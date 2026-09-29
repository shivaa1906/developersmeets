import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer, IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { authenticateSocketToken } from './auth.js';
import { authorizeSubscription } from './roomAuthorizer.js';
import { RealtimeUser, ClientMessage, ServerMessage, BroadcastOptions } from './types.js';

interface ExtendedWebSocket extends WebSocket {
  id: string;
  isAlive: boolean;
  user?: RealtimeUser;
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

      this.sockets.set(extWs.id, extWs);
      this.socketChannels.set(extWs.id, new Set());

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
          const payload: ClientMessage = JSON.parse(raw.toString('utf8'));
          await this.handleClientMessage(extWs, payload);
        } catch (err: any) {
          this.send(extWs, {
            type: 'error',
            message: err.message || 'Malformed message payload',
            code: 'BAD_REQUEST',
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

    // Start 30-second ping-pong heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.sockets.forEach((ws) => {
        if (!ws.isAlive) {
          ws.terminate();
          this.cleanupSocket(ws);
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  /**
   * Authenticates socket with JWT token
   */
  private async handleAuth(ws: ExtendedWebSocket, token: string): Promise<void> {
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
        this.leaveChannel(ws, msg.channel);
        this.send(ws, { type: 'unsubscribed', channel: msg.channel });
        break;
      }

      case 'typing': {
        if (!ws.user) return;
        const channel = msg.channel;
        const channels = this.socketChannels.get(ws.id);
        if (!channels || !channels.has(channel)) {
          return; // Must be in channel to emit typing
        }

        // Resolve display name: anonymize in project chat
        let displayName = ws.user.displayName;
        if (channel.startsWith('chat:')) {
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
          isTyping: msg.isTyping,
          timestamp: new Date().toISOString(),
        };

        this.sendPacketToChannel(channel, typingPayload, { excludeSocketId: ws.id });

        // Auto-expire typing indicator after 5 seconds if no stop received
        if (msg.isTyping) {
          const timer = setTimeout(() => {
            this.typingTimers.delete(timerKey);
            this.sendPacketToChannel(channel, {
              type: 'typing',
              channel,
              senderId: ws.user!.userId,
              displayName,
              isTyping: false,
              timestamp: new Date().toISOString(),
            }, { excludeSocketId: ws.id });
          }, 5000);
          this.typingTimers.set(timerKey, timer);
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

    this.socketUsers.delete(socketId);
    this.sockets.delete(socketId);
  }

  private send(ws: ExtendedWebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
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

    const messageStr = JSON.stringify(packet);

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

    const payload: ServerMessage = {
      type: 'event',
      channel,
      event,
      data,
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
    const payload: ServerMessage = {
      type: 'event',
      channel: 'all',
      event,
      data,
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
