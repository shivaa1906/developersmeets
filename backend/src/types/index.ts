import { Request } from 'express';

export type UserRole = 'CEO' | 'ADMIN' | 'MD' | 'DEVELOPER' | 'CLIENT' | 'SUPPORT' | 'GUEST';

export type UserStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'DISABLED';

export interface AuthUser {
  userId: string;
  publicUid?: string;
  email: string;
  role: UserRole;
  developerId?: string;
  clientId?: string;
  clientNumber?: string;
  supportStaffId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface DbUser {
  id: string;
  public_uid: string;
  email: string;
  phone?: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  last_login_at?: Date;
  email_verified: boolean;
  email_verified_at?: Date;
  is_suspended: boolean;
  suspended_at?: Date;
  suspension_reason?: string;
  password_reset_token?: string;
  password_reset_expires_at?: Date;
  created_at: Date;
  updated_at: Date;
}
