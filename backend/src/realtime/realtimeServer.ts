import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer, IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database/db.js';
import { authenticateSocketToken } from './auth.js';
import { authorizeSubscription } from './roomAuthorizer.js';
import { RealtimeUser, ClientMessage, ServerMessage, BroadcastOptions } from './types.js';

interface ExtendedWebSocket extends WebSocket {
  id: string;
  ip: string;
  isAlive: boolean;
  user?: RealtimeUser;
}

/**
 * Recursively removes sensitive authentication and internal credentials from realtime payloads
 */
export function sanitizeRealtimePayload(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(sanitizeRealtimePayload);
  }

  const sensitiveKeys = new Set([
    'password',
    'password_hash',
    'passwordhash',
    'token',
    'access_token',
    'accesstoken',
    'refresh_token',
    'refreshtoken',
    'jwt',
    'secret',
    'api_key',
    'apikey',
    'gateway_secret',
    'service_role_key',
  ]);

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (
      sensitiveKeys.has(key) ||
      sensitiveKeys.has(lowerKey) ||
      lowerKey.includes('password') ||
      lowerKey.includes('secret')
    ) {
      continue;
    }
    sanitized[key] = sanitizeRealtimePayload(value);
  }
  return sanitized;
}

export class RealtimeServer {
  private static instance: RealtimeServer | null = null;
  private wss: WebSocketServer | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Connection and Room Tracking
  private sockets = new Map<string, ExtendedWebSocket>();
  private socketUsers = new Map<string, RealtimeUser>();
  private socketChannels = new Map<string, Set<string>>();
  private channelSockets = new Map<string, Set<string>>();
  private userSockets = new Map<string, Set<string>>();

  // Abuse Protection & Rate Limiting
  private ipConnections = new Map<string, number>();
  private socketRateLimits = new Map<
    string,
    { messages: number[]; typings: number[]; subs: number[]; authAttempts: number }
  >();

  // Typing indicators: key = `${channel}:${userId}` -> NodeJS.Timeout
  private typingTimers = new Map<string, NodeJS.Timeout>();

  private constructor() {}

  public static getInstance(): RealtimeServer {
    if (!RealtimeServer.instance) {
      RealtimeServer.instance = new RealtimeServer();
    }
    return RealtimeServer.instance;
  }

  /**
   * Initializes the WebSocket server attached to the Node HTTP server
   */
  public init(httpServer: HttpServer): void {
    if (this.wss) {
      return; // Already initialized
    }

    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.wss.on('error', (err: any) => {
      if (err?.code !== 'EADDRINUSE') {
        console.error('[WebSocketServer Error]:', err);
      }
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const extWs = ws as ExtendedWebSocket;
      extWs.id = uuidv4();
      extWs.isAlive = true;

      // Extract client IP address
      const forwarded = req.headers['x-forwarded-for'];
      const rawIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';
      extWs.ip = rawIp;

      // Connection limit per IP (Max 50 concurrent sockets per IP)
      const currentIpConns = this.ipConnections.get(rawIp) || 0;
      if (currentIpConns >= 50) {
        this.send(extWs, {
          type: 'error',
          message: 'Connection limit exceeded for IP',
          code: 'RATE_LIMITED',
        });
        extWs.close(1008, 'Connection limit exceeded');
        return;
      }
      this.ipConnections.set(rawIp, currentIpConns + 1);

      this.sockets.set(extWs.id, extWs);
      this.socketChannels.set(extWs.id, new Set());
      this.socketRateLimits.set(extWs.id, {
        messages: [],
        typings: [],
        subs: [],
        authAttempts: 0,
      });

      extWs.on('pong', () => {
        extWs.isAlive = true;
      });

      // Check query param for immediate auth (e.g. /ws?token=...)
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');

      if (token) {
        this.handleAuth(extWs, token).catch((err) => {
          this.send(extWs, { type: 'auth_error', message: err.message });
          extWs.close(1008, 'Authentication failed');
        });
      }

      extWs.on('message', async (raw: Buffer) => {
        try {
          // Payload size limit: 64KB max
          if (raw.length > 65536) {
            this.send(extWs, {
              type: 'error',
              message: 'Payload exceeds maximum allowed size (64KB)',
              code: 'PAYLOAD_TOO_LARGE',
            });
            return;
          }

          let payload: any;
          try {
            payload = JSON.parse(raw.toString('utf8'));
          } catch {
            this.send(extWs, {
              type: 'error',
              message: 'Malformed JSON payload',
              code: 'BAD_REQUEST',
            });
            return;
          }

          // Strict Event Allowlist
          const ALLOWED_TYPES = new Set([
            'auth',
            'subscribe',
            'unsubscribe',
            'typing',
            'message',
            'message:send',
            'message:read',
            'message:react',
            'message:edit',
            'message:delete',
            'ping',
          ]);

          if (!payload || typeof payload !== 'object' || !payload.type || !ALLOWED_TYPES.has(payload.type)) {
            this.send(extWs, {
              type: 'error',
              message: 'Invalid or disallowed event type',
              code: 'INVALID_EVENT',
            });
            return;
          }

          await this.handleClientMessage(extWs, payload as ClientMessage);
        } catch (err: any) {
          this.send(extWs, {
            type: 'error',
            message: err.message || 'Error processing message',
            code: 'INTERNAL_ERROR',
          });
        }
      });

      extWs.on('close', () => {
        this.cleanupSocket(extWs);
      });

      extWs.on('error', (_err) => {
        this.cleanupSocket(extWs);
      });
    });

    // Start 30-second ping-pong heartbeat & proactive session revocation audit
    this.heartbeatInterval = setInterval(async () => {
      for (const [socketId, ws] of this.sockets.entries()) {
        if (!ws.isAlive) {
          ws.terminate();
          this.cleanupSocket(ws);
          continue;
        }

        // Periodically verify that authenticated sessions remain active in DB
        if (ws.user) {
          try {
            const userCheck = await query(
              `SELECT status, is_suspended, token_version FROM users WHERE id = $1`,
              [ws.user.userId]
            );
            if (
              userCheck.rows.length === 0 ||
              userCheck.rows[0].status === 'DISABLED' ||
              userCheck.rows[0].status === 'SUSPENDED' ||
              userCheck.rows[0].is_suspended === true ||
              (ws.user.tokenVersion !== undefined && userCheck.rows[0].token_version !== ws.user.tokenVersion)
            ) {
              this.send(ws, {
                type: 'auth_error',
                message: 'Session has expired or account has been suspended',
                code: 'SESSION_REVOKED',
              });
              ws.close(1008, 'Session revoked');
              this.cleanupSocket(ws);
              continue;
            }
          } catch (_dbErr) {
            // Non-blocking DB verification failure on heartbeat
          }
        }

        ws.isAlive = false;
        ws.ping();
      }
    }, 30000);
  }

  /**
   * Validates channel string to prevent injection attacks or invalid scopes
   */
  private isValidChannelName(channel: any): boolean {
    if (!channel || typeof channel !== 'string') return false;
    if (channel.length < 3 || channel.length > 128) return false;
    return /^[a-zA-Z0-9_\-:]+$/.test(channel);
  }

  /**
   * Rate limiting helper
   */
  private checkRateLimit(
    socketId: string,
    type: 'messages' | 'typings' | 'subs',
    maxEvents: number,
    windowMs: number
  ): boolean {
    const limits = this.socketRateLimits.get(socketId);
    if (!limits) return true;

    const now = Date.now();
    const timestamps = limits[type].filter((ts) => now - ts < windowMs);
    if (timestamps.length >= maxEvents) {
      return false;
    }
    timestamps.push(now);
    limits[type] = timestamps;
    return true;
  }

  /**
   * Authenticates socket with JWT token
   */
  private async handleAuth(ws: ExtendedWebSocket, token: string): Promise<void> {
    const limits = this.socketRateLimits.get(ws.id);
    if (limits) {
      limits.authAttempts++;
      if (limits.authAttempts > 10) {
        throw new Error('Too many authentication attempts on this connection');
      }
    }

    const user = await authenticateSocketToken(token);
    ws.user = user;
    this.socketUsers.set(ws.id, user);

    if (!this.userSockets.has(user.userId)) {
      this.userSockets.set(user.userId, new Set());
    }
    this.userSockets.get(user.userId)!.add(ws.id);

    this.send(ws, {
      type: 'auth_success',
      user: {
        userId: user.userId,
        role: user.role,
        displayName: user.displayName,
      },
    });

    // Automatically subscribe to user's private notification channel
    const userChannel = `user:${user.userId}`;
    this.joinChannel(ws, userChannel);
  }

  /**
   * Dispatches incoming client packets
   */
  private async handleClientMessage(ws: ExtendedWebSocket, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'auth': {
        try {
          await this.handleAuth(ws, msg.token);
        } catch (err: any) {
          this.send(ws, { type: 'auth_error', message: err.message });
          ws.close(1008, 'Authentication failed');
        }
        break;
      }

      case 'subscribe': {
        if (!ws.user) {
          this.send(ws, { type: 'error', message: 'Unauthorized: authenticate first', code: 'UNAUTHORIZED' });
          return;
        }

        if (!this.isValidChannelName(msg.channel)) {
          this.send(ws, { type: 'error', message: 'Invalid channel specification', code: 'BAD_REQUEST' });
          return;
        }

        // Subscription Rate Limit (max 20 per 5 seconds)
        if (!this.checkRateLimit(ws.id, 'subs', 20, 5000)) {
          this.send(ws, { type: 'error', message: 'Subscription rate limit exceeded', code: 'RATE_LIMITED' });
          return;
        }

        // Max active channels per socket limit (max 50)
        const currentChannels = this.socketChannels.get(ws.id);
        if (currentChannels && currentChannels.size >= 50 && !currentChannels.has(msg.channel)) {
          this.send(ws, { type: 'error', message: 'Maximum subscription channels exceeded (50)', code: 'RESOURCE_EXHAUSTED' });
          return;
        }

        const authResult = await authorizeSubscription(ws.user, msg.channel);
        if (!authResult.authorized) {
          this.send(ws, {
            type: 'error',
            message: authResult.reason || 'Forbidden: Subscription not permitted',
            code: 'FORBIDDEN',
          });
          return;
        }

        this.joinChannel(ws, msg.channel);
        this.send(ws, { type: 'subscribed', channel: msg.channel });
        break;
      }

      case 'unsubscribe': {
        if (msg.channel && typeof msg.channel === 'string') {
          this.leaveChannel(ws, msg.channel);
          this.send(ws, { type: 'unsubscribed', channel: msg.channel });
        }
        break;
      }

      case 'typing': {
        if (!ws.user) return;
        const channel = msg.channel;
        if (!this.isValidChannelName(channel)) return;

        const channels = this.socketChannels.get(ws.id);
        if (!channels || !channels.has(channel)) {
          return; // Must be subscribed to channel to emit typing
        }

        // Typing Rate Limit (max 10 per 5 seconds)
        if (!this.checkRateLimit(ws.id, 'typings', 10, 5000)) {
          return;
        }

        // Resolve display name: anonymize in project chat
        let displayName = ws.user.displayName;
        if (channel.startsWith('chat:') || channel.startsWith('conversation:')) {
          const authRes = await authorizeSubscription(ws.user, channel);
          if (authRes.anonymousTag) {
            displayName = authRes.anonymousTag;
          }
        }

        const timerKey = `${channel}:${ws.user.userId}`;
        if (this.typingTimers.has(timerKey)) {
          clearTimeout(this.typingTimers.get(timerKey)!);
          this.typingTimers.delete(timerKey);
        }

        const typingPayload: ServerMessage = {
          type: 'typing',
          channel,
          senderId: ws.user.userId,
          displayName,
          isTyping: Boolean(msg.isTyping),
          timestamp: new Date().toISOString(),
        };

        this.sendPacketToChannel(channel, typingPayload, { excludeSocketId: ws.id });

        // Auto-expire typing indicator after 5 seconds
        if (msg.isTyping) {
          const timer = setTimeout(() => {
            this.typingTimers.delete(timerKey);
            this.sendPacketToChannel(
              channel,
              {
                type: 'typing',
                channel,
                senderId: ws.user!.userId,
                displayName,
                isTyping: false,
                timestamp: new Date().toISOString(),
              },
              { excludeSocketId: ws.id }
            );
          }, 5000);
          this.typingTimers.set(timerKey, timer);
        }
        break;
      }

      case 'message':
      case 'message:send': {
        if (!ws.user) {
          this.send(ws, { type: 'error', message: 'Unauthorized: authenticate first', code: 'UNAUTHORIZED' });
          return;
        }

        const channel = msg.channel;
        if (!this.isValidChannelName(channel)) {
          this.send(ws, { type: 'error', message: 'Invalid channel specification', code: 'BAD_REQUEST' });
          return;
        }

        // Message Rate Limit (max 10 messages per 5 seconds)
        if (!this.checkRateLimit(ws.id, 'messages', 10, 5000)) {
          this.send(ws, { type: 'error', message: 'Message rate limit exceeded. Please slow down.', code: 'RATE_LIMITED' });
          return;
        }

        const text = (msg.message || '').trim();
        if (!text || text.length === 0) {
          this.send(ws, { type: 'error', message: 'Message content cannot be empty', code: 'BAD_REQUEST' });
          return;
        }
        if (text.length > 4000) {
          this.send(ws, { type: 'error', message: 'Message exceeds maximum length (4000 characters)', code: 'BAD_REQUEST' });
          return;
        }

        // Authorize channel access
        const authRes = await authorizeSubscription(ws.user, channel);
        if (!authRes.authorized) {
          this.send(ws, { type: 'error', message: authRes.reason || 'Forbidden: Cannot send to this channel', code: 'FORBIDDEN' });
          return;
        }

        // Server assigns author identity: strictly ws.user.userId (ignoring any client spoofing)
        const senderUserId = ws.user.userId;
        const [scope, id] = channel.split(':');

        try {
          if (scope === 'chat' || scope === 'conversation') {
            const insRes = await query(
              `INSERT INTO messages (conversation_id, sender_user_id, message, message_type)
               VALUES ($1, $2, $3, 'TEXT')
               RETURNING id, conversation_id, sender_user_id, message, created_at`,
              [id, senderUserId, text]
            );
            const savedMsg = insRes.rows[0];
            const senderDisplayName = authRes.anonymousTag || ws.user.displayName;

            const packet: ServerMessage = {
              type: 'event',
              channel,
              event: 'chat:message',
              data: {
                id: savedMsg.id,
                conversationId: savedMsg.conversation_id,
                senderUserId: savedMsg.sender_user_id,
                senderDisplayName,
                message: savedMsg.message,
                createdAt: savedMsg.created_at,
              },
              timestamp: new Date().toISOString(),
            };
            this.sendPacketToChannel(channel, packet);
          } else if (scope === 'community') {
            const chRes = await query(`SELECT id FROM channels WHERE slug = $1`, [id]);
            if (chRes.rows.length === 0) {
              this.send(ws, { type: 'error', message: 'Community channel not found', code: 'NOT_FOUND' });
              return;
            }
            const channelId = chRes.rows[0].id;
            const devId = ws.user.developerId || null;

            const insRes = await query(
              `INSERT INTO channel_messages (channel_id, author_user_id, author_developer_id, content)
               VALUES ($1, $2, $3, $4)
               RETURNING id, channel_id, author_user_id, author_developer_id, content, created_at`,
              [channelId, senderUserId, devId, text]
            );
            const savedMsg = insRes.rows[0];

            const packet: ServerMessage = {
              type: 'event',
              channel,
              event: 'community:message',
              data: {
                id: savedMsg.id,
                channelSlug: id,
                authorUserId: savedMsg.author_user_id,
                authorDisplayName: ws.user.displayName,
                content: savedMsg.content,
                createdAt: savedMsg.created_at,
              },
              timestamp: new Date().toISOString(),
            };
            this.sendPacketToChannel(channel, packet);
          } else {
            this.send(ws, { type: 'error', message: 'Direct realtime messaging not supported for this channel scope', code: 'BAD_REQUEST' });
          }
        } catch (dbErr: any) {
          this.send(ws, { type: 'error', message: 'Failed to persist message to database', code: 'INTERNAL_ERROR' });
        }
        break;
      }

      case 'message:read': {
        if (!ws.user) return;
        const channel = msg.channel;
        if (!this.isValidChannelName(channel)) return;

        const [scope, id] = channel.split(':');
        if (scope === 'chat' || scope === 'conversation') {
          const authRes = await authorizeSubscription(ws.user, channel);
          if (!authRes.authorized) return;

          await query(
            `UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id::text = $1 AND user_id = $2`,
            [id, ws.user.userId]
          );

          this.broadcastToChannel(channel, 'chat:read', {
            userId: ws.user.userId,
            unreadCount: 0,
          });
        }
        break;
      }

      case 'message:react': {
        if (!ws.user) return;
        const channel = msg.channel;
        if (!this.isValidChannelName(channel) || !msg.messageId || !msg.emoji) return;

        const [scope, id] = channel.split(':');
        if (scope === 'community') {
          const authRes = await authorizeSubscription(ws.user, channel);
          if (!authRes.authorized) return;

          const msgCheck = await query(`SELECT id FROM channel_messages WHERE id = $1`, [msg.messageId]);
          if (msgCheck.rows.length === 0) return;

          const emoji = msg.emoji.trim().slice(0, 10);
          const devId = ws.user.developerId || null;

          const existing = await query(
            `SELECT id FROM channel_message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
            [msg.messageId, ws.user.userId, emoji]
          );

          let added = false;
          if (existing.rows.length > 0) {
            await query(`DELETE FROM channel_message_reactions WHERE id = $1`, [existing.rows[0].id]);
          } else {
            await query(
              `INSERT INTO channel_message_reactions (message_id, user_id, developer_id, emoji) VALUES ($1, $2, $3, $4)`,
              [msg.messageId, ws.user.userId, devId, emoji]
            );
            added = true;
          }

          const countRes = await query(
            `SELECT COUNT(*)::int as count FROM channel_message_reactions WHERE message_id = $1 AND emoji = $2`,
            [msg.messageId, emoji]
          );

          this.broadcastToChannel(channel, 'community:reaction', {
            messageId: msg.messageId,
            emoji,
            added,
            count: countRes.rows[0]?.count || 0,
          });
        }
        break;
      }

      case 'message:edit': {
        if (!ws.user) return;
        const channel = msg.channel;
        const messageId = msg.messageId;
        const newContent = (msg.content || '').trim();
        if (!messageId || !newContent || newContent.length > 4000) return;

        const [scope] = channel.split(':');
        if (scope === 'chat' || scope === 'conversation') {
          const msgRes = await query(`SELECT sender_user_id FROM messages WHERE id = $1`, [messageId]);
          if (msgRes.rows.length === 0) return;

          const isAuthor = msgRes.rows[0].sender_user_id === ws.user.userId;
          const isAdmin = ['CEO', 'ADMIN'].includes(ws.user.role);
          if (!isAuthor && !isAdmin) {
            this.send(ws, { type: 'error', message: 'Forbidden: Cannot edit another user message', code: 'FORBIDDEN' });
            return;
          }

          await query(`UPDATE messages SET message = $1, updated_at = NOW() WHERE id = $2`, [newContent, messageId]);
          this.broadcastToChannel(channel, 'chat:message_edited', { messageId, content: newContent });
        } else if (scope === 'community') {
          const msgRes = await query(`SELECT author_user_id FROM channel_messages WHERE id = $1`, [messageId]);
          if (msgRes.rows.length === 0) return;

          const isAuthor = msgRes.rows[0].author_user_id === ws.user.userId;
          const isAdmin = ['CEO', 'ADMIN'].includes(ws.user.role);
          if (!isAuthor && !isAdmin) {
            this.send(ws, { type: 'error', message: 'Forbidden: Cannot edit another user message', code: 'FORBIDDEN' });
            return;
          }

          await query(`UPDATE channel_messages SET content = $1, updated_at = NOW() WHERE id = $2`, [newContent, messageId]);
          this.broadcastToChannel(channel, 'community:message_edited', { messageId, content: newContent });
        }
        break;
      }

      case 'message:delete': {
        if (!ws.user) return;
        const channel = msg.channel;
        const messageId = msg.messageId;
        if (!messageId) return;

        const [scope] = channel.split(':');
        if (scope === 'chat' || scope === 'conversation') {
          const msgRes = await query(`SELECT sender_user_id FROM messages WHERE id = $1`, [messageId]);
          if (msgRes.rows.length === 0) return;

          const isAuthor = msgRes.rows[0].sender_user_id === ws.user.userId;
          const isAdmin = ['CEO', 'ADMIN'].includes(ws.user.role);
          if (!isAuthor && !isAdmin) {
            this.send(ws, { type: 'error', message: 'Forbidden: Cannot delete another user message', code: 'FORBIDDEN' });
            return;
          }

          await query(`DELETE FROM messages WHERE id = $1`, [messageId]);
          this.broadcastToChannel(channel, 'chat:message_deleted', { messageId });
        } else if (scope === 'community') {
          const msgRes = await query(`SELECT author_user_id FROM channel_messages WHERE id = $1`, [messageId]);
          if (msgRes.rows.length === 0) return;

          const isAuthor = msgRes.rows[0].author_user_id === ws.user.userId;
          const isAdmin = ['CEO', 'ADMIN'].includes(ws.user.role);
          if (!isAuthor && !isAdmin) {
            this.send(ws, { type: 'error', message: 'Forbidden: Cannot delete another user message', code: 'FORBIDDEN' });
            return;
          }

          await query(`DELETE FROM channel_messages WHERE id = $1`, [messageId]);
          this.broadcastToChannel(channel, 'community:message_deleted', { messageId });
        }
        break;
      }

      case 'ping': {
        this.send(ws, { type: 'pong' });
        break;
      }

      default:
        this.send(ws, { type: 'error', message: 'Unknown event type', code: 'UNKNOWN_EVENT' });
    }
  }

  private joinChannel(ws: ExtendedWebSocket, channel: string): void {
    const userChannels = this.socketChannels.get(ws.id);
    if (userChannels) {
      userChannels.add(channel);
    }

    if (!this.channelSockets.has(channel)) {
      this.channelSockets.set(channel, new Set());
    }
    this.channelSockets.get(channel)!.add(ws.id);
  }

  private leaveChannel(ws: ExtendedWebSocket, channel: string): void {
    const userChannels = this.socketChannels.get(ws.id);
    if (userChannels) {
      userChannels.delete(channel);
    }

    const subscribers = this.channelSockets.get(channel);
    if (subscribers) {
      subscribers.delete(ws.id);
      if (subscribers.size === 0) {
        this.channelSockets.delete(channel);
      }
    }
  }

  private cleanupSocket(ws: ExtendedWebSocket): void {
    const socketId = ws.id;

    // Remove from channels
    const channels = this.socketChannels.get(socketId);
    if (channels) {
      channels.forEach((channel) => {
        const subscribers = this.channelSockets.get(channel);
        if (subscribers) {
          subscribers.delete(socketId);
          if (subscribers.size === 0) {
            this.channelSockets.delete(channel);
          }
        }
      });
      this.socketChannels.delete(socketId);
    }

    // Remove from user sockets
    if (ws.user) {
      const userSocketsSet = this.userSockets.get(ws.user.userId);
      if (userSocketsSet) {
        userSocketsSet.delete(socketId);
        if (userSocketsSet.size === 0) {
          this.userSockets.delete(ws.user.userId);
        }
      }
    }

    // Decrement IP connection count
    if (ws.ip) {
      const current = this.ipConnections.get(ws.ip) || 1;
      if (current <= 1) {
        this.ipConnections.delete(ws.ip);
      } else {
        this.ipConnections.set(ws.ip, current - 1);
      }
    }

    this.socketRateLimits.delete(socketId);
    this.socketUsers.delete(socketId);
    this.sockets.delete(socketId);
  }

  private send(ws: ExtendedWebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      const sanitized = sanitizeRealtimePayload(msg);
      ws.send(JSON.stringify(sanitized));
    }
  }

  /**
   * Broadcasts a raw ServerMessage directly to all channel subscribers
   */
  public sendPacketToChannel(channel: string, packet: ServerMessage, options?: BroadcastOptions): void {
    const subscribers = this.channelSockets.get(channel);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const sanitized = sanitizeRealtimePayload(packet);
    const messageStr = JSON.stringify(sanitized);

    subscribers.forEach((socketId) => {
      if (options?.excludeSocketId && socketId === options.excludeSocketId) {
        return;
      }
      const ws = this.sockets.get(socketId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  /**
   * Broadcasts an event to all subscribers in a specific channel
   */
  public broadcastToChannel(channel: string, event: string, data: any, options?: BroadcastOptions): void {
    const subscribers = this.channelSockets.get(channel);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const sanitizedData = sanitizeRealtimePayload(data);
    const payload: ServerMessage = {
      type: 'event',
      channel,
      event,
      data: sanitizedData,
      timestamp: new Date().toISOString(),
    };
    const messageStr = JSON.stringify(payload);

    subscribers.forEach((socketId) => {
      if (options?.excludeSocketId && socketId === options.excludeSocketId) {
        return;
      }
      const ws = this.sockets.get(socketId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  /**
   * Broadcasts directly to a specific user (all their active devices/tabs)
   */
  public broadcastToUser(userId: string, event: string, data: any): void {
    const userChannel = `user:${userId}`;
    this.broadcastToChannel(userChannel, event, data);
  }

  /**
   * Broadcasts to all connected authenticated sockets
   */
  public broadcastToAll(event: string, data: any): void {
    const sanitizedData = sanitizeRealtimePayload(data);
    const payload: ServerMessage = {
      type: 'event',
      channel: 'all',
      event,
      data: sanitizedData,
      timestamp: new Date().toISOString(),
    };
    const messageStr = JSON.stringify(payload);

    this.sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN && ws.user) {
        ws.send(messageStr);
      }
    });
  }

  /**
   * Revokes all active WebSocket connections for a user immediately (Logout, Suspension, Deactivation)
   */
  public revokeUserSessions(userId: string, reason = 'Session revoked or invalidated'): void {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || socketIds.size === 0) {
      return;
    }

    const socketIdsCopy = Array.from(socketIds);
    for (const socketId of socketIdsCopy) {
      const ws = this.sockets.get(socketId);
      if (ws) {
        this.send(ws, {
          type: 'auth_error',
          message: reason,
          code: 'SESSION_REVOKED',
        });
        ws.close(1008, 'Session revoked');
        this.cleanupSocket(ws);
      }
    }
  }

  /**
   * Revalidates a user's authorized subscriptions following role, project, or status changes
   */
  public async revalidateUserAuthorization(userId: string): Promise<void> {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || socketIds.size === 0) return;

    // Check user database status & reload updated identity
    const userRes = await query(
      `SELECT id, role, status, is_suspended, token_version, permissions FROM users WHERE id = $1`,
      [userId]
    );

    if (
      userRes.rows.length === 0 ||
      userRes.rows[0].status === 'DISABLED' ||
      userRes.rows[0].status === 'SUSPENDED' ||
      userRes.rows[0].is_suspended === true
    ) {
      this.revokeUserSessions(userId, 'Account deactivated or suspended');
      return;
    }

    const dbUser = userRes.rows[0];

    // Check developer status if role is DEVELOPER
    let devVerificationStatus: string | undefined;
    if (dbUser.role === 'DEVELOPER') {
      const devRes = await query(`SELECT verification_status FROM developers WHERE user_id = $1`, [userId]);
      if (devRes.rows.length > 0) {
        devVerificationStatus = devRes.rows[0].verification_status;
      }
    }

    // For active sockets, re-evaluate all subscribed channels
    for (const socketId of socketIds) {
      const ws = this.sockets.get(socketId);
      if (!ws || !ws.user) continue;

      // Update in-memory user to reflect database changes
      ws.user.role = dbUser.role;
      ws.user.tokenVersion = dbUser.token_version;
      ws.user.permissions = dbUser.permissions || [];
      if (devVerificationStatus !== undefined) {
        ws.user.verificationStatus = devVerificationStatus;
      }

      const channels = this.socketChannels.get(socketId);
      if (!channels) continue;

      const channelsCopy = Array.from(channels);
      for (const channel of channelsCopy) {
        const authRes = await authorizeSubscription(ws.user, channel);
        if (!authRes.authorized) {
          this.leaveChannel(ws, channel);
          this.send(ws, {
            type: 'unsubscribed',
            channel,
          });
          this.send(ws, {
            type: 'error',
            message: `Subscription to ${channel} was revoked due to authorization changes`,
            code: 'FORBIDDEN',
          });
        }
      }
    }
  }

  /**
   * Gets current count of connected sockets
   */
  public getConnectionCount(): number {
    return this.sockets.size;
  }

  /**
   * Gracefully shuts down the WebSocket server
   */
  public shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.typingTimers.forEach((t) => clearTimeout(t));
    this.typingTimers.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

export const realtimeServer = RealtimeServer.getInstance();
