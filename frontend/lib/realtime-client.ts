'use client';

type EventCallback = (data: any) => void;

export class RealtimeClient {
  private static instance: RealtimeClient | null = null;
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000;
  private isExplicitDisconnect = false;

  // Active subscriptions: channel -> Set<EventCallback>
  private subscriptions = new Map<string, Set<EventCallback>>();
  // General event listeners (e.g. 'connect', 'disconnect', 'error', 'typing')
  private eventListeners = new Map<string, Set<EventCallback>>();

  private constructor() {}

  public static getInstance(): RealtimeClient {
    if (!RealtimeClient.instance) {
      RealtimeClient.instance = new RealtimeClient();
    }
    return RealtimeClient.instance;
  }

  public connect(token?: string): void {
    if (typeof window === 'undefined') return;

    if (token) {
      this.token = token;
    } else {
      this.token = localStorage.getItem('token');
    }

    if (!this.token) {
      return;
    }

    this.isExplicitDisconnect = false;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    let wsUrl: string;
    if (process.env.NEXT_PUBLIC_WS_URL) {
      const baseWsUrl = process.env.NEXT_PUBLIC_WS_URL.replace(/\/+$/, '');
      const separator = baseWsUrl.includes('?') ? '&' : '?';
      wsUrl = `${baseWsUrl}${separator}token=${encodeURIComponent(this.token)}`;
    } else {
      const host = window.location.hostname || 'localhost';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // When developing locally or using port 5000 API
      const wsPort = process.env.NEXT_PUBLIC_WS_PORT || '5000';
      wsUrl = `${protocol}//${host}:${wsPort}/ws?token=${encodeURIComponent(this.token)}`;
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.emitLocal('connect', { connected: true });

        // Resubscribe to all active channels after reconnect
        this.subscriptions.forEach((_callbacks, channel) => {
          this.sendRaw({ type: 'subscribe', channel });
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleIncoming(payload);
        } catch (_err) {
          // Ignore non-json frames
        }
      };

      this.ws.onclose = (event) => {
        this.emitLocal('disconnect', { code: event.code, reason: event.reason });
        if (!this.isExplicitDisconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        this.emitLocal('error', err);
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  private handleIncoming(payload: any): void {
    if (payload.type === 'event') {
      const channel = payload.channel;
      const callbacks = this.subscriptions.get(channel);
      if (callbacks) {
        callbacks.forEach((cb) => {
          try {
            cb(payload);
          } catch (e) {
            console.error('Error in subscription callback:', e);
          }
        });
      }
      this.emitLocal('event', payload);
    } else if (payload.type === 'typing') {
      this.emitLocal(`typing:${payload.channel}`, payload);
      this.emitLocal('typing', payload);
    } else if (payload.type === 'auth_success') {
      this.emitLocal('auth_success', payload.user);
    } else if (payload.type === 'error') {
      this.emitLocal('server_error', payload);
    }
  }

  public subscribe(channel: string, callback: EventCallback): () => void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      if (this.isConnected()) {
        this.sendRaw({ type: 'subscribe', channel });
      }
    }

    this.subscriptions.get(channel)!.add(callback);

    // Return unsubscription function
    return () => {
      const subs = this.subscriptions.get(channel);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscriptions.delete(channel);
          if (this.isConnected()) {
            this.sendRaw({ type: 'unsubscribe', channel });
          }
        }
      }
    };
  }

  public sendTyping(channel: string, isTyping: boolean): void {
    if (this.isConnected()) {
      this.sendRaw({ type: 'typing', channel, isTyping });
    }
  }

  public on(event: string, callback: EventCallback): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  private emitLocal(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in listener for ${event}:`, e);
        }
      });
    }
  }

  private sendRaw(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private scheduleReconnect(): void {
    if (this.isExplicitDisconnect) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      10000
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  public isConnected(): boolean {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  public disconnect(): void {
    this.isExplicitDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'User logged out');
      this.ws = null;
    }
    this.subscriptions.clear();
    this.eventListeners.clear();
  }
}

export const realtimeClient = RealtimeClient.getInstance();
