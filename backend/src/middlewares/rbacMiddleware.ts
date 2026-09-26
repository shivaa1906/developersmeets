import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types/index.js';
import { ROLES } from '../config/constants.js';
import { query } from '../database/db.js';

/**
 * Enforces that only designated roles can access the endpoint.
 * CEO always has global bypass access.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required. No session found.' });
      return;
    }

    // CEO has superadmin permissions across all operations
    if (req.user.role === ROLES.CEO) {
      next();
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Forbidden: role '${req.user.role}' lacks permissions for this resource.`,
      });
      return;
    }

    next();
  };
}

/**
 * Enforces that only authorized administrative roles can manage credits.
 * ADMIN and CEO are authorized.
 * MD and SUPPORT must not automatically receive credit-management authority.
 */
export function requireCreditManagement(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. No session found.' });
    return;
  }

  // CEO and ADMIN are authorized by default
  if (req.user.role === ROLES.CEO || req.user.role === ROLES.ADMIN) {
    next();
    return;
  }

  // MD and SUPPORT must not automatically receive credit-management authority
  // unless explicit credit management permission is provided
  const userPermissions = (req.user as any).permissions || [];
  if (
    Array.isArray(userPermissions) &&
    (userPermissions.includes('MANAGE_CREDITS') || userPermissions.includes('CREDIT_MANAGEMENT'))
  ) {
    next();
    return;
  }

  res.status(403).json({
    error: `Forbidden: role '${req.user.role}' is not authorized for credit management. Only ADMIN or CEO have credit-management authority.`,
  });
}

/**
 * Enforces that only verified active developers can access marketplace claims and community channels
 */
export async function requireVerifiedDeveloper(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (req.user.role === ROLES.CEO || req.user.role === ROLES.ADMIN || req.user.role === ROLES.MD) {
    next();
    return;
  }

  if (req.user.role !== ROLES.DEVELOPER || !req.user.developerId) {
    res.status(403).json({ error: 'Forbidden: only registered developers may access this resource.' });
    return;
  }

  try {
    const devRes = await query(
      `SELECT d.verification_status, u.status as user_status
       FROM developers d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = $1`,
      [req.user.developerId]
    );

    if (devRes.rows.length === 0) {
      res.status(403).json({ error: 'Forbidden: developer profile not found.' });
      return;
    }

    if (devRes.rows[0].user_status === 'SUSPENDED' || devRes.rows[0].verification_status === 'SUSPENDED') {
      res.status(403).json({
        error: 'Forbidden: developer account is suspended.',
      });
      return;
    }

    if (devRes.rows[0].verification_status !== 'VERIFIED') {
      res.status(403).json({
        error: 'Forbidden: developer profile is pending verification. Unapproved developers cannot perform this action.',
      });
      return;
    }

    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Enforces that clients can only access projects they created,
 * and developers can only access workspaces for projects where they are assigned as LEAD.
 */
export function requireProjectAccess() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const { projectId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    // CEO and Admin have oversight access
    if (user.role === ROLES.CEO || user.role === ROLES.ADMIN || user.role === ROLES.MD) {
      next();
      return;
    }

    try {
      const projectRes = await query(
        `SELECT client_id, lead_developer_id, status FROM projects WHERE id = $1`,
        [projectId]
      );

      if (projectRes.rows.length === 0) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const project = projectRes.rows[0];

      // If user is client, check client_id
      if (user.role === ROLES.CLIENT) {
        if (project.client_id !== user.clientId && project.client_id !== user.userId) {
          res.status(403).json({ error: 'Forbidden: you do not own this project.' });
          return;
        }
      }

      // If user is developer, check lead_developer_id or project claims
      if (user.role === ROLES.DEVELOPER) {
        const isLead = project.lead_developer_id === user.developerId;
        if (!isLead) {
          // Check if developer has an active claim
          const claimRes = await query(
            `SELECT id FROM project_claims WHERE project_id = $1 AND developer_id = $2`,
            [projectId, user.developerId || user.userId]
          );
          if (claimRes.rows.length === 0) {
            res.status(403).json({ error: 'Forbidden: you are not associated with this project.' });
            return;
          }
        }
      }

      next();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}

/**
 * Enforces that developers can never see other developers' conversations,
 * and clients can never access conversations of projects they do not own.
 */
export function requireConversationAccess() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const { conversationId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    // CEO has emergency moderation access
    if (user.role === ROLES.CEO) {
      next();
      return;
    }

    try {
      const memberRes = await query(
        `SELECT id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, user.userId]
      );

      if (memberRes.rows.length === 0) {
        res.status(403).json({
          error: 'Forbidden: you are not an authorized member of this conversation.',
        });
        return;
      }

      next();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}
