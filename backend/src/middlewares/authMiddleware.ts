import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuthUser } from '../types/index.js';
import { query } from '../database/db.js';
import { verifyAccessToken } from '../utils/tokenService.js';

export async function authenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. No token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.trim() === '') {
    res.status(401).json({ error: 'Authentication required. Empty token provided.' });
    return;
  }

  try {
    const decoded = verifyAccessToken(token) as AuthUser & { tokenVersion?: number };

    // Check if the user is suspended, disabled, or deleted in the database
    const userRes = await query(
      'SELECT id, uid, public_uid, email, role, status, is_suspended, suspension_reason, token_version, permissions FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (userRes.rows.length === 0) {
      res.status(401).json({ error: 'User account no longer exists.' });
      return;
    }

    const user = userRes.rows[0];
    if (user.status === 'SUSPENDED' || user.is_suspended === true) {
      res.status(403).json({ 
        error: 'Account has been suspended. Please contact platform support.',
        code: 'ACCOUNT_SUSPENDED',
        reason: user.suspension_reason || null
      });
      return;
    }

    if (user.status === 'DISABLED') {
      res.status(403).json({
        error: 'Account has been disabled. Please contact platform support.',
        code: 'ACCOUNT_DISABLED',
      });
      return;
    }

    // Session invalidation / revocation check via token_version
    if (
      decoded.tokenVersion !== undefined &&
      user.token_version !== undefined &&
      decoded.tokenVersion !== user.token_version
    ) {
      res.status(401).json({ error: 'Session invalidated. Please log in again.' });
      return;
    }

    // Authoritatively resolve client, developer, and support staff records from database
    const [clientRes, devRes, supportRes] = await Promise.all([
      query('SELECT id, client_number FROM clients WHERE user_id = $1', [user.id]),
      query('SELECT id, verification_status FROM developers WHERE user_id = $1', [user.id]),
      query('SELECT id FROM support_staff WHERE user_id = $1', [user.id]),
    ]);

    req.user = {
      ...decoded,
      userId: user.id,
      uid: user.uid,
      publicUid: user.public_uid || user.uid,
      email: user.email,
      role: user.role, // Authoritative from database
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      clientId: clientRes.rows[0]?.id,
      clientNumber: clientRes.rows[0]?.client_number,
      developerId: devRes.rows[0]?.id,
      verificationStatus: devRes.rows[0]?.verification_status,
      supportStaffId: supportRes.rows[0]?.id,
    };
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError' || error.code === 'TOKEN_EXPIRED') {
      res.status(401).json({ error: 'Token has expired.', code: 'TOKEN_EXPIRED' });
      return;
    }
    if (error.code === 'INVALID_ISSUER') {
      res.status(401).json({ error: 'Invalid token issuer.' });
      return;
    }
    if (error.code === 'INVALID_AUDIENCE') {
      res.status(401).json({ error: 'Invalid token audience.' });
      return;
    }
    if (error.code === 'INVALID_SUBJECT') {
      res.status(401).json({ error: 'Invalid token subject.' });
      return;
    }
    if (error.code === 'INVALID_ALGORITHM') {
      res.status(401).json({ error: 'Invalid or unsupported token algorithm.' });
      return;
    }
    if (error.code === 'MISSING_SIGNATURE') {
      res.status(401).json({ error: 'Token signature is missing.' });
      return;
    }
    if (error.code === 'MALFORMED_TOKEN') {
      res.status(401).json({ error: 'Malformed token.' });
      return;
    }
    if (error.code === 'INVALID_PURPOSE') {
      res.status(401).json({ error: error.message });
      return;
    }
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({ error: error.message || 'Invalid token.' });
      return;
    }
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export async function optionalAuthenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  return authenticateJwt(req, res, next);
}
