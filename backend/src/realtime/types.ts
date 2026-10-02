import { UserRole } from '../types/index.js';

export interface RealtimeUser {
  userId: string;
  email: string;
  role: UserRole;
  status: string;
  developerId?: string;
  clientId?: string;
  supportStaffId?: string;
  verificationStatus?: string;
  permissions?: string[];
  displayName: string;
  tokenVersion?: number;
}

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'typing'; channel: string; isTyping: boolean }
  | { type: 'message' | 'message:send'; channel: string; message: string; messageType?: string; senderId?: string }
  | { type: 'message:read'; channel: string; messageId?: string }
  | { type: 'message:react'; channel: string; messageId: string; emoji: string }
  | { type: 'message:edit'; channel: string; messageId: string; content: string }
  | { type: 'message:delete'; channel: string; messageId: string }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'auth_success'; user: { userId: string; role: string; displayName: string } }
  | { type: 'auth_error'; message: string; code?: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong' }
  | { type: 'event'; channel: string; event: string; data: any; timestamp: string }
  | { type: 'typing'; channel: string; senderId: string; displayName: string; isTyping: boolean; timestamp: string }
  | { type: 'presence'; channel: string; onlineCount: number };

export interface BroadcastOptions {
  excludeSocketId?: string;
}
