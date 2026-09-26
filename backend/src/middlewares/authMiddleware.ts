import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/environment.js';
import { AuthenticatedRequest, AuthUser } from '../types/index.js';
import { query } from '../database/db.js';

export async function authenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. No token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;

    // Check if the user is suspended, disabled, or deleted in the database
    const userRes = await query('SELECT status, is_suspended, suspension_reason FROM users WHERE id = $1', [decoded.userId]);
    if (userRes.rows.length === 0) {
      res.status(401).json({ error: 'User account no longer exists.' });
      return;
    }

    const user = userRes.rows[0];
    if (user.status === 'SUSPENDED' || user.is_suspended === true) {
      res.status(403).json({ 
        error: 'Account has been suspended. Please contact platform support.',
        reason: user.suspension_reason || null
      });
      return;
    }

    if (user.status === 'DISABLED') {
      res.status(403).json({ error: 'Account has been disabled. Please contact platform support.' });
      return;
    }

    req.user = decoded;
    next();
  } catch (_error) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
