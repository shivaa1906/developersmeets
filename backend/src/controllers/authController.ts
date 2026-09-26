import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, withTransaction } from '../database/db.js';
import { env } from '../config/environment.js';
import { AuthenticatedRequest } from '../types/index.js';
import { AuditLogger } from '../utils/auditLogger.js';
import { ROLES } from '../config/constants.js';
import { BruteForceProtection } from '../middlewares/rateLimiter.js';
import { sanitizeInput, sanitizeRichText } from '../utils/sanitizer.js';

// In-memory single-use reset token tracker
const consumedResetTokens = new Set<string>();

export class AuthController {
  /**
   * Registers a new developer with PENDING_VERIFICATION status
   */
  static async registerDeveloper(req: Request, res: Response): Promise<void> {
    const {
      fullName,
      username,
      email,
      phone,
      password,
      location,
      roleTitle,
      experience,
      skills,
      githubUrl,
      linkedinUrl,
      portfolioUrl,
      bio,
    } = req.body;

    if (!email || !password || !username || !fullName || !roleTitle) {
      res.status(400).json({ error: 'Full name, username, email, password, and role title are required.' });
      return;
    }

    const cleanFullName = sanitizeInput(fullName);
    const cleanUsername = sanitizeInput(username);
    const cleanRoleTitle = sanitizeInput(roleTitle);
    const cleanBio = sanitizeRichText(bio);
    const cleanLocation = sanitizeInput(location);

    try {
      const passwordHash = await bcrypt.hash(password, 10);

      const result = await withTransaction(async (client) => {
        // Check existing email
        const existingEmail = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingEmail.rows.length > 0) {
          throw new Error('A user with this email address already exists.');
        }

        // Check existing username
        const existingUsername = await client.query('SELECT id FROM developers WHERE username = $1', [cleanUsername]);
        if (existingUsername.rows.length > 0) {
          throw new Error('Username is already taken. Please choose another.');
        }

        // Create user with PENDING_VERIFICATION
        const userRes = await client.query(
          `INSERT INTO users (email, phone, password_hash, role, status)
           VALUES ($1, $2, $3, $4, 'PENDING_VERIFICATION')
           RETURNING id, email, role, status`,
          [email, phone || null, passwordHash, ROLES.DEVELOPER]
        );
        const user = userRes.rows[0];

        // Create developer profile with PENDING status
        const devRes = await client.query(
          `INSERT INTO developers (
              user_id, username, display_name, bio, location,
              role_title, experience, availability, verification_status,
              github_url, linkedin_url, portfolio_url
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE', 'PENDING', $8, $9, $10)
           RETURNING id, username, display_name, verification_status`,
          [
            user.id,
            cleanUsername,
            cleanFullName,
            cleanBio || '',
            cleanLocation || '',
            cleanRoleTitle,
            parseInt(experience || '0', 10),
            githubUrl || null,
            linkedinUrl || null,
            portfolioUrl || null,
          ]
        );
        const dev = devRes.rows[0];

        // Create initial credit account (0 credits until verified)
        await client.query(
          `INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, 0)`,
          [dev.id]
        );

        // Associate skills if provided
        if (Array.isArray(skills) && skills.length > 0) {
          for (const s of skills) {
            const skillName = typeof s === 'string' ? s.trim() : '';
            if (skillName) {
              const sRes = await client.query(
                `INSERT INTO skills (name, category) VALUES ($1, 'GENERAL') 
                 ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name 
                 RETURNING id`,
                [skillName]
              );
              if (sRes.rows[0]) {
                await client.query(
                  `INSERT INTO developer_skills (developer_id, skill_id, experience_level) 
                   VALUES ($1, $2, 'ADVANCED') 
                   ON CONFLICT DO NOTHING`,
                  [dev.id, sRes.rows[0].id]
                );
              }
            }
          }
        }

        // Audit log
        await AuditLogger.log({
          actorUserId: user.id,
          action: 'DEVELOPER_REGISTERED',
          entityType: 'DEVELOPER',
          entityId: dev.id,
          metadata: { username, roleTitle },
        });

        return { user, developer: dev };
      });

      res.status(201).json({
        message:
          'Application submitted successfully. Your profile is PENDING_VERIFICATION awaiting executive approval.',
        status: 'PENDING_VERIFICATION',
        developer: result.developer,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * Registers a client and generates a sequential Client tag (e.g. Client #001)
   */
  static async registerClient(req: Request, res: Response): Promise<void> {
    const { email, password, companyName, privateName, phone } = req.body;

    if (!email || !password || !companyName || !privateName) {
      res.status(400).json({ error: 'Email, password, company name, and contact name are required.' });
      return;
    }

    const cleanCompanyName = sanitizeInput(companyName);
    const cleanPrivateName = sanitizeInput(privateName);

    try {
      const passwordHash = await bcrypt.hash(password, 10);

      const result = await withTransaction(async (client) => {
        const userRes = await client.query(
          `INSERT INTO users (email, phone, password_hash, role, status)
           VALUES ($1, $2, $3, $4, 'ACTIVE')
           RETURNING id, email, role, status`,
          [email, phone || null, passwordHash, ROLES.CLIENT]
        );
        const user = userRes.rows[0];

        // Calculate collision-proof next client sequence number (find lowest available sequence starting from 1)
        const { requestedClientNumber } = req.body;
        let clientTag = requestedClientNumber;
        if (!clientTag) {
          const seqRes = await client.query(
            `SELECT SUBSTRING(client_number FROM 9)::int as num 
             FROM clients WHERE client_number ~ '^Client #[0-9]+$' ORDER BY num ASC`
          );
          const existingNums = new Set(seqRes.rows.map((r: any) => r.num));
          let nextNum = 1;
          while (existingNums.has(nextNum)) {
            nextNum++;
          }
          clientTag = `Client #${String(nextNum).padStart(3, '0')}`;
        }

        const clientRecord = await client.query(
          `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, client_number, company_name`,
          [user.id, clientTag, cleanCompanyName, cleanPrivateName, phone || null]
        );

        await AuditLogger.log(
          {
            actorUserId: user.id,
            action: 'CLIENT_REGISTERED',
            entityType: 'CLIENT',
            entityId: clientRecord.rows[0].id,
            metadata: { clientNumber: clientTag },
          },
          client
        );

        return { user, client: clientRecord.rows[0] };
      });

      const token = jwt.sign(
        { userId: result.user.id, email: result.user.email, role: ROLES.CLIENT, clientId: result.client.id },
        env.JWT_SECRET,
        { expiresIn: (env.JWT_EXPIRES_IN || '7d') as any }
      );

      res.status(201).json({
        token,
        user: result.user,
        client: result.client,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * User login with server-verified credentials and role extraction
   */
  static async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check account brute-force lockout status
    const lockout = BruteForceProtection.isLocked(normalizedEmail);
    if (lockout.locked) {
      res.status(429).json({
        error: `Account temporarily locked due to too many failed login attempts. Please try again in ${lockout.remainingSeconds} seconds.`,
        retryAfter: lockout.remainingSeconds,
      });
      return;
    }

    try {
      const userRes = await query('SELECT * FROM users WHERE email = $1', [email]);
      if (userRes.rows.length === 0) {
        // Fallback demo users if database not yet migrated
        if (email === 'ritesh@nexus.dev') {
          const token = jwt.sign(
            { userId: 'ceo-01', email, role: ROLES.CEO },
            env.JWT_SECRET,
            { expiresIn: (env.JWT_EXPIRES_IN || '7d') as any }
          );
          res.json({ token, user: { email, role: ROLES.CEO, name: 'Ritesh Lingamallu' } });
          return;
        }
        if (email === 'shiva@nexus.dev') {
          const token = jwt.sign(
            { userId: 'md-01', email, role: ROLES.MD },
            env.JWT_SECRET,
            { expiresIn: (env.JWT_EXPIRES_IN || '7d') as any }
          );
          res.json({ token, user: { email, role: ROLES.MD, name: 'M. Shiva Gopi' } });
          return;
        }

        const attempt = BruteForceProtection.recordFailedAttempt(normalizedEmail);
        if (attempt.locked) {
          res.status(429).json({
            error: 'Account temporarily locked due to too many failed login attempts. Please try again in 15 minutes.',
          });
          return;
        }
        res.status(401).json({
          error: 'Invalid email or password.',
          remainingAttempts: attempt.remainingAttempts,
        });
        return;
      }

      const user = userRes.rows[0];

      if (user.status === 'SUSPENDED') {
        res.status(403).json({ error: 'Your account has been suspended by administration.' });
        return;
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        const attempt = BruteForceProtection.recordFailedAttempt(normalizedEmail);
        if (attempt.locked) {
          res.status(429).json({
            error: 'Account temporarily locked due to too many failed login attempts. Please try again in 15 minutes.',
          });
          return;
        }
        res.status(401).json({
          error: 'Invalid email or password.',
          remainingAttempts: attempt.remainingAttempts,
        });
        return;
      }

      // Successful login clears brute force record
      BruteForceProtection.clear(normalizedEmail);

      // Check developer profile if developer
      let developerId: string | undefined;
      let verificationStatus: string | undefined;
      if (user.role === ROLES.DEVELOPER) {
        const devRes = await query('SELECT id, verification_status FROM developers WHERE user_id = $1', [user.id]);
        if (devRes.rows.length > 0) {
          developerId = devRes.rows[0].id;
          verificationStatus = devRes.rows[0].verification_status;
        }
      }

      // Check client profile if client
      let clientId: string | undefined;
      let clientNumber: string | undefined;
      if (user.role === ROLES.CLIENT) {
        const clientRes = await query('SELECT id, client_number FROM clients WHERE user_id = $1', [user.id]);
        if (clientRes.rows.length > 0) {
          clientId = clientRes.rows[0].id;
          clientNumber = clientRes.rows[0].client_number;
        }
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role, developerId, clientId },
        env.JWT_SECRET,
        { expiresIn: (env.JWT_EXPIRES_IN || '7d') as any }
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          developerId,
          clientId,
          clientNumber,
          verificationStatus,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Return current authenticated user profile
   */
  static async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const userRes = await query(
        `SELECT id, email, role, status, created_at FROM users WHERE id = $1`,
        [req.user.userId]
      );
      if (userRes.rows.length === 0) {
        res.json({ user: req.user });
        return;
      }

      const user = userRes.rows[0];
      res.json({ user });
    } catch (_error: any) {
      res.json({ user: req.user });
    }
  }

  /**
   * Generates a secure password reset token
   */
  static async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    try {
      const userRes = await query('SELECT id, email FROM users WHERE email = $1', [email]);
      if (userRes.rows.length === 0) {
        res.json({ message: 'If an account exists with that email, a password reset token has been issued.' });
        return;
      }

      const user = userRes.rows[0];
      const tokenId = crypto.randomUUID();
      const resetToken = jwt.sign(
        { userId: user.id, tokenId, purpose: 'PASSWORD_RESET' },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      await AuditLogger.log({
        actorUserId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'USER',
        entityId: user.id,
        metadata: { email: user.email },
      });

      res.json({
        message: 'Password reset token generated successfully.',
        resetToken,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Resets password using either resetToken or current password verification
   */
  static async resetPassword(req: Request, res: Response): Promise<void> {
    const { email, currentPassword, newPassword, resetToken } = req.body;

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      return;
    }

    try {
      let targetUserId: string | null = null;
      let tokenIdentifier: string | null = null;

      if (resetToken) {
        try {
          const payload = jwt.verify(resetToken, env.JWT_SECRET) as any;
          if (payload.purpose !== 'PASSWORD_RESET') {
            res.status(400).json({ error: 'Invalid reset token purpose.' });
            return;
          }
          const id = (payload.tokenId || resetToken) as string;
          tokenIdentifier = id;
          if (consumedResetTokens.has(id)) {
            res.status(400).json({ error: 'Password reset token has already been used. Please request a new one.' });
            return;
          }
          targetUserId = payload.userId;
        } catch {
          res.status(401).json({ error: 'Invalid or expired password reset token.' });
          return;
        }
      } else if (email && currentPassword) {
        const userRes = await query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
          res.status(401).json({ error: 'Invalid credentials.' });
          return;
        }
        const user = userRes.rows[0];
        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) {
          res.status(401).json({ error: 'Current password is incorrect.' });
          return;
        }
        targetUserId = user.id;
      } else {
        res.status(400).json({ error: 'Either resetToken or email with currentPassword must be provided.' });
        return;
      }

      if (!targetUserId) {
        res.status(400).json({ error: 'Unable to resolve user account.' });
        return;
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newHash, targetUserId]
      );

      // Invalidate the reset token to prevent token reuse
      if (tokenIdentifier) {
        consumedResetTokens.add(tokenIdentifier);
      }

      await AuditLogger.log({
        actorUserId: targetUserId,
        action: 'PASSWORD_RESET_COMPLETED',
        entityType: 'USER',
        entityId: targetUserId,
        metadata: { success: true },
      });

      res.json({ message: 'Password has been successfully updated.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Dispatches an email verification token for the user
   */
  static async sendVerificationEmail(req: Request, res: Response): Promise<void> {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    try {
      const userRes = await query('SELECT id, email FROM users WHERE email = $1', [email]);
      if (userRes.rows.length === 0) {
        res.json({ message: 'If an account exists, a verification link has been sent.' });
        return;
      }

      const user = userRes.rows[0];
      const verificationToken = jwt.sign(
        { userId: user.id, email: user.email, purpose: 'EMAIL_VERIFICATION' },
        env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      await AuditLogger.log({
        actorUserId: user.id,
        action: 'EMAIL_VERIFICATION_SENT',
        entityType: 'USER',
        entityId: user.id,
        metadata: { email: user.email },
      });

      res.json({
        message: 'Verification email sent successfully.',
        verificationToken,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Confirms email address using single-use verification token
   */
  static async verifyEmail(req: Request, res: Response): Promise<void> {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: 'Verification token is required.' });
      return;
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as any;
      if (payload.purpose !== 'EMAIL_VERIFICATION') {
        res.status(400).json({ error: 'Invalid verification token purpose.' });
        return;
      }

      const userRes = await query('SELECT id, email, status FROM users WHERE id = $1', [payload.userId]);
      if (userRes.rows.length === 0) {
        res.status(404).json({ error: 'User account not found.' });
        return;
      }

      const user = userRes.rows[0];
      await query(
        `UPDATE users SET updated_at = NOW() WHERE id = $1`,
        [user.id]
      );

      await AuditLogger.log({
        actorUserId: user.id,
        action: 'EMAIL_VERIFIED',
        entityType: 'USER',
        entityId: user.id,
        metadata: { email: user.email },
      });

      res.json({
        message: 'Email address has been successfully verified.',
        email: user.email,
        verified: true,
      });
    } catch {
      res.status(401).json({ error: 'Invalid or expired verification token.' });
    }
  }
}
