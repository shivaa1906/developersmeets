import jwt from 'jsonwebtoken';
import { env } from '../config/environment.js';
import { query } from '../database/db.js';
import { RealtimeUser } from './types.js';
import { verifyAccessToken } from '../utils/tokenService.js';

interface JwtPayload {
  userId: string;
  email?: string;
  role?: string;
  developerId?: string;
  clientId?: string;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}

/**
 * Authenticates a WebSocket connection using a JWT token.
 * Validates against the database to guarantee the user is active,
 * not suspended, not disabled, and uses trusted server-side roles rather than trusting client claims.
 */
export async function authenticateSocketToken(token: string): Promise<RealtimeUser> {
  if (!token) {
    throw new Error('Authentication token required');
  }

  let decoded: JwtPayload;
  try {
    decoded = verifyAccessToken(token) as JwtPayload;
  } catch (err: any) {
    if (err.name === 'TokenExpiredError' || err.code === 'TOKEN_EXPIRED') {
      throw new Error('Authentication token has expired');
    }
    throw new Error(err.message || 'Invalid authentication token');
  }

  const userId = decoded.userId;
  if (!userId) {
    throw new Error('Malformed token payload: missing userId');
  }

  // Load user from database to ensure fresh status, role, and permissions
  const userRes = await query(
    `SELECT id, email, role, status, is_suspended, token_version, permissions FROM users WHERE id = $1`,
    [userId]
  );

  if (userRes.rows.length === 0) {
    throw new Error('User account not found');
  }

  const dbUser = userRes.rows[0];

  if (dbUser.status === 'SUSPENDED' || dbUser.is_suspended === true) {
    throw new Error('User account is suspended');
  }

  if (dbUser.status === 'DISABLED') {
    throw new Error('User account is disabled');
  }

  if (
    dbUser.token_version !== undefined &&
    dbUser.token_version !== null &&
    (decoded.tokenVersion === undefined || decoded.tokenVersion !== dbUser.token_version)
  ) {
    throw new Error('Authentication session has been invalidated');
  }

  let developerId: string | undefined = undefined;
  let verificationStatus: string | undefined = undefined;
  let clientId: string | undefined = undefined;
  let supportStaffId: string | undefined = undefined;
  let displayName = dbUser.email.split('@')[0];

  if (dbUser.role === 'DEVELOPER') {
    const devRes = await query(
      `SELECT id, display_name, username, verification_status FROM developers WHERE user_id = $1`,
      [userId]
    );
    if (devRes.rows.length > 0) {
      developerId = devRes.rows[0].id;
      verificationStatus = devRes.rows[0].verification_status;
      displayName = devRes.rows[0].display_name || devRes.rows[0].username || displayName;
    }
  } else if (dbUser.role === 'CLIENT') {
    const clientRes = await query(
      `SELECT id, client_number, company_name FROM clients WHERE user_id = $1`,
      [userId]
    );
    if (clientRes.rows.length > 0) {
      clientId = clientRes.rows[0].id;
      displayName = clientRes.rows[0].client_number || displayName;
    }
  } else if (dbUser.role === 'SUPPORT') {
    const staffRes = await query(
      `SELECT id, status, permissions FROM support_staff WHERE user_id = $1`,
      [userId]
    );
    if (staffRes.rows.length > 0) {
      supportStaffId = staffRes.rows[0].id;
      if (staffRes.rows[0].status === 'SUSPENDED') {
        throw new Error('Support staff account is suspended');
      }
    }
  } else if (['CEO', 'MD', 'ADMIN'].includes(dbUser.role)) {
    displayName = `${dbUser.role} Administrator`;
  }

  const permissions = Array.isArray(dbUser.permissions) ? dbUser.permissions : [];

  return {
    userId: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    status: dbUser.status,
    developerId,
    clientId,
    supportStaffId,
    verificationStatus,
    permissions,
    displayName,
    tokenVersion: dbUser.token_version,
  };
}
