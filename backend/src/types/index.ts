import { Request } from 'express';

export type UserRole = 'CEO' | 'ADMIN' | 'MD' | 'DEVELOPER' | 'CLIENT' | 'SUPPORT' | 'GUEST';

export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
  developerId?: string;
  clientId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status: 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED';
  created_at: Date;
  updated_at: Date;
}
