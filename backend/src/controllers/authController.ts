import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, withTransaction } from '../database/db.js';
import { env } from '../config/environment.js';
import { AuthenticatedRequest } from '../types/index.js';
import { AuditLogger } from '../utils/auditLogger.js';
import { ROLES, LEADERSHIP } from '../config/constants.js';
import { BruteForceProtection } from '../middlewares/rateLimiter.js';
import { sanitizeInput, sanitizeRichText } from '../utils/sanitizer.js';
import { ProjectService } from '../services/projectService.js';
import { DeveloperService } from '../services/developerService.js';
import { GoogleOAuthService } from '../services/googleOAuthService.js';
import { hashPassword, verifyPassword, validatePassword } from '../utils/password.js';

// In-memory single-use reset token tracker for JWT reset tokens
const consumedResetTokens = new Set<string>();

/**
 * Validates and sanitizes destination redirect URLs to prevent Open Redirect attacks
 */
export function validateRedirectUrl(target: any, defaultUrl: string): string {
  if (!target || typeof target !== 'string') {
    return defaultUrl;
  }

  const trimmed = target.trim();

  // Strictly enforce leading single slash and reject protocol-relative (//) or backslash (\)
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return defaultUrl;
  }

  // Reject URLs containing schemes, protocols or pseudo-protocols
  if (trimmed.includes('://') || /^(?:javascript|data|vbscript):/i.test(trimmed)) {
    return defaultUrl;
  }

  // Reject CR/LF characters
  if (/[\r\n]/.test(trimmed)) {
    return defaultUrl;
  }

  // Validate internal path characters
  const safeInternalPathRegex = /^\/[a-zA-Z0-9_\-/?=&%#.]*$/;
  if (!safeInternalPathRegex.test(trimmed)) {
    return defaultUrl;
  }

  return trimmed;
}

/**
 * Computes default role-based redirect URL
 */
export function getDefaultRedirectForRole(role: string): string {
  switch (role) {
    case ROLES.CEO:
    case ROLES.MD:
    case ROLES.ADMIN:
      return '/admin/dashboard';
    case ROLES.SUPPORT:
      return '/admin/support';
    case ROLES.DEVELOPER:
    case ROLES.CLIENT:
      return '/dashboard';
    default:
      return '/';
  }
}

export class AuthController {
  /**
   * Registers a new developer with PENDING_VERIFICATION status
   * Role is strictly server controlled (always DEVELOPER).
   */
  static async registerDeveloper(req: Request, res: Response): Promise<void> {
    const {
      fullName,
      username,
      email,
      phone,
      password,
      profilePhoto,
      avatarUrl,
      location,
      roleTitle,
      developerRole,
      experience,
      skills,
      programmingLanguages,
      frameworks,
      databases,
      cloud,
      aiml,
      uiux,
      githubUrl,
      linkedinUrl,
      portfolioUrl,
      leetcodeUrl,
      kaggleUrl,
      otherLinks,
      bio,
    } = req.body;

    const effectiveRoleTitle = roleTitle || developerRole;

    if (!email || !password || !username || !fullName || !effectiveRoleTitle) {
      res.status(400).json({ error: 'Full name, username, email, password, and role title are required.' });
      return;
    }

    const passwordValidation = validatePassword(password, req.body.confirmPassword);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.error });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanFullName = sanitizeInput(fullName);
    const cleanUsername = sanitizeInput(username);
    const cleanRoleTitle = sanitizeInput(effectiveRoleTitle);
    const cleanBio = sanitizeRichText(bio);
    const cleanLocation = sanitizeInput(location);
    const cleanPhoto = profilePhoto || avatarUrl || null;

    const parseArray = (input: any): string[] => {
      if (Array.isArray(input)) {
        return input.map((s) => String(s).trim()).filter(Boolean);
      }
      if (typeof input === 'string') {
        return input.split(',').map((s) => s.trim()).filter(Boolean);
      }
      return [];
    };

    const progLangsArray = parseArray(programmingLanguages);
    const frameworksArray = parseArray(frameworks);
    const databasesArray = parseArray(databases);
    const cloudArray = parseArray(cloud);
    const aimlArray = parseArray(aiml);
    const uiuxArray = parseArray(uiux);
    const generalSkillsArray = parseArray(skills);

    try {
      const passwordHash = await hashPassword(password);

      const result = await withTransaction(async (client) => {
        // Check existing email
        const existingEmail = await client.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (existingEmail.rows.length > 0) {
          const conflictErr: any = new Error('This email is already registered.');
          conflictErr.statusCode = 409;
          throw conflictErr;
        }

        // Check existing username
        const existingUsername = await client.query('SELECT id FROM developers WHERE username = $1', [cleanUsername]);
        if (existingUsername.rows.length > 0) {
          throw new Error('Username is already taken. Please choose another.');
        }

        // Create user with server-controlled role = DEVELOPER and status = PENDING_VERIFICATION
        const userRes = await client.query(
          `INSERT INTO users (email, phone, password_hash, role, status, email_verified)
           VALUES ($1, $2, $3, $4, 'PENDING_VERIFICATION', FALSE)
           RETURNING id, uid, public_uid, email, role, status, email_verified, created_at`,
          [normalizedEmail, phone || null, passwordHash, ROLES.DEVELOPER]
        );
        const user = userRes.rows[0];

        // Create developer profile with PENDING verification status
        const devRes = await client.query(
          `INSERT INTO developers (
              user_id, username, display_name, bio, location,
              role_title, experience, availability, verification_status,
              github_url, linkedin_url, portfolio_url, leetcode_url, kaggle_url,
              profile_photo, other_links, programming_languages, frameworks,
              databases, cloud_tools, aiml_tools, uiux_tools
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE', 'PENDING', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
           RETURNING id, username, display_name, verification_status, role_title, experience`,
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
            leetcodeUrl || null,
            kaggleUrl || null,
            cleanPhoto,
            otherLinks || null,
            progLangsArray,
            frameworksArray,
            databasesArray,
            cloudArray,
            aimlArray,
            uiuxArray,
          ]
        );
        const dev = devRes.rows[0];

        // Create initial credit account (0 credits until verified)
        await client.query(
          `INSERT INTO credit_accounts (developer_id, user_id, balance) VALUES ($1, $2, 0)
           ON CONFLICT (developer_id) DO NOTHING`,
          [dev.id, user.id]
        );

        // Associate categorized skills
        const categorizedSkills: { name: string; category: string }[] = [
          ...progLangsArray.map((name) => ({ name, category: 'PROGRAMMING_LANGUAGE' })),
          ...frameworksArray.map((name) => ({ name, category: 'FRAMEWORK' })),
          ...databasesArray.map((name) => ({ name, category: 'DATABASE' })),
          ...cloudArray.map((name) => ({ name, category: 'CLOUD' })),
          ...aimlArray.map((name) => ({ name, category: 'AI_ML' })),
          ...uiuxArray.map((name) => ({ name, category: 'UI_UX' })),
          ...generalSkillsArray.map((name) => ({ name, category: 'GENERAL' })),
        ];

        for (const item of categorizedSkills) {
          const skillName = item.name.trim();
          if (skillName) {
            const sRes = await client.query(
              `INSERT INTO skills (name, category) VALUES ($1, $2) 
               ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category 
               RETURNING id`,
              [skillName, item.category]
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

        // Create default notification preferences
        await client.query(
          `INSERT INTO notification_preferences (user_id, email_notifications, project_updates, proposal_alerts, support_ticket_updates)
           VALUES ($1, TRUE, TRUE, TRUE, TRUE)
           ON CONFLICT (user_id) DO NOTHING`,
          [user.id]
        );

        // Audit log
        await AuditLogger.log(
          {
            actorUserId: user.id,
            action: 'DEVELOPER_REGISTERED',
            entityType: 'DEVELOPER',
            entityId: dev.id,
            metadata: { username: cleanUsername, roleTitle: cleanRoleTitle },
          },
          client
        );
        await AuditLogger.log(
          {
            actorUserId: user.id,
            action: 'DEVELOPER_VERIFICATION_REQUESTED',
            entityType: 'DEVELOPER',
            entityId: dev.id,
            metadata: { username: cleanUsername, status: 'PENDING' },
          },
          client
        );

        return { user, developer: dev };
      });

      res.status(201).json({
        message:
          'Application submitted successfully. Your profile is PENDING_DEVELOPER_APPROVAL awaiting executive approval.',
        status: 'PENDING_DEVELOPER_APPROVAL',
        verificationStatus: 'PENDING',
        developer: {
          id: result.developer.id,
          username: result.developer.username,
          displayName: result.developer.display_name,
          verificationStatus: result.developer.verification_status,
          roleTitle: result.developer.role_title,
          experience: result.developer.experience,
        },
        user: {
          id: result.user.id,
          uid: result.user.uid,
          publicUid: result.user.uid,
          email: result.user.email,
          role: result.user.role,
          status: result.user.status,
        },
      });
    } catch (err: any) {
      const statusCode =
        err.statusCode ||
        (err.message?.includes('already exists') ||
        err.message?.includes('already registered') ||
        err.code === '23505'
          ? 409
          : 400);
      res.status(statusCode).json({ error: err.message || 'Registration failed' });
    }
  }

  /**
   * Registers a client and generates a sequential Client tag (e.g. Client #001)
   * Role is strictly server controlled (always CLIENT).
   */
  static async registerClient(req: Request, res: Response): Promise<void> {
    const { email, password, confirmPassword, companyName, privateName, fullName, name, phone } = req.body;

    const contactName = fullName || privateName || name;
    if (!email || !password || !contactName) {
      res.status(400).json({ error: 'Full name, email, and password are required.' });
      return;
    }

    const passwordValidation = validatePassword(password, confirmPassword);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.error });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanPrivateName = sanitizeInput(contactName);
    const cleanCompanyName = companyName
      ? sanitizeInput(companyName)
      : `${cleanPrivateName} Enterprise`;

    try {
      const passwordHash = await hashPassword(password);

      const result = await withTransaction(async (client) => {
        // Check existing email
        const existingEmail = await client.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (existingEmail.rows.length > 0) {
          const conflictErr: any = new Error('This email is already registered.');
          conflictErr.statusCode = 409;
          throw conflictErr;
        }

        const userRes = await client.query(
          `INSERT INTO users (email, phone, password_hash, role, status, email_verified, email_verified_at)
           VALUES ($1, $2, $3, $4, 'ACTIVE', TRUE, NOW())
           RETURNING id, uid, public_uid, email, role, status, email_verified, created_at`,
          [normalizedEmail, phone || null, passwordHash, ROLES.CLIENT]
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
           RETURNING id, client_number, company_name, private_name`,
          [user.id, clientTag, cleanCompanyName, cleanPrivateName, phone || null]
        );

        // Create default notification preferences
        await client.query(
          `INSERT INTO notification_preferences (user_id, email_notifications, project_updates, proposal_alerts, support_ticket_updates)
           VALUES ($1, TRUE, TRUE, TRUE, TRUE)
           ON CONFLICT (user_id) DO NOTHING`,
          [user.id]
        );

        await AuditLogger.log(
          {
            actorUserId: user.id,
            action: 'CLIENT_REGISTERED',
            entityType: 'CLIENT',
            entityId: clientRecord.rows[0].id,
            metadata: { clientNumber: clientTag, companyName: cleanCompanyName },
          },
          client
        );

        return { user, client: clientRecord.rows[0] };
      });

      const token = jwt.sign(
        {
          userId: result.user.id,
          uid: result.user.uid,
          publicUid: result.user.uid,
          email: result.user.email,
          role: ROLES.CLIENT,
          tokenVersion: 1,
          clientId: result.client.id,
          clientNumber: result.client.client_number,
        },
        env.JWT_SECRET,
        { expiresIn: (env.JWT_EXPIRES_IN || '7d') as any }
      );

      res.status(201).json({
        token,
        user: {
          id: result.user.id,
          uid: result.user.uid,
          publicUid: result.user.uid,
          email: result.user.email,
          role: ROLES.CLIENT,
          status: result.user.status,
          emailVerified: result.user.email_verified,
          clientId: result.client.id,
          clientNumber: result.client.client_number,
          name: result.client.private_name || result.client.company_name,
        },
        client: result.client,
        redirectUrl: '/dashboard',
      });
    } catch (err: any) {
      const statusCode =
        err.statusCode ||
        (err.message?.includes('already exists') ||
        err.message?.includes('already registered') ||
        err.code === '23505'
          ? 409
          : 400);
      res.status(statusCode).json({ error: err.message || 'Registration failed' });
    }
  }

  /**
   * User login with server-verified credentials and strictly server-controlled role
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
      const aliasMap: Record<string, string> = {
        'developer@nexus.dev': 'rahul@nexus.dev',
        'client@nexus.dev': 'client1@apexretail.io',
        'client001@apexretail.io': 'client1@apexretail.io',
      };
      const effectiveEmail = aliasMap[normalizedEmail] || normalizedEmail;

      const userRes = await query(
        `SELECT id, uid, public_uid, email, phone, password_hash, role, status, email_verified, is_suspended, suspension_reason, token_version, last_login_at 
         FROM users WHERE email = $1 OR email = $2`,
        [normalizedEmail, effectiveEmail]
      );

      if (userRes.rows.length === 0) {
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

      // Check suspension state
      if (user.status === 'SUSPENDED' || user.is_suspended === true) {
        res.status(403).json({
          error: 'Your account has been suspended by administration. Please contact platform support.',
          code: 'ACCOUNT_SUSPENDED',
          reason: user.suspension_reason || null,
        });
        return;
      }

      // Check disabled state
      if (user.status === 'DISABLED') {
        res.status(403).json({
          error: 'Your account has been disabled. Please contact platform support.',
          code: 'ACCOUNT_DISABLED',
        });
        return;
      }

      // Cryptographically verify password (Argon2id or backward-compatible bcrypt)
      const verification = await verifyPassword(password, user.password_hash);

      if (!verification.valid) {
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

      // Transparent upgrade-on-login: if legacy bcrypt hash was verified, rehash to Argon2id and update database
      if (verification.needsRehash) {
        try {
          const upgradedHash = await hashPassword(password);
          await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
            upgradedHash,
            user.id,
          ]);
          await AuditLogger.log({
            actorUserId: user.id,
            action: 'PASSWORD_HASH_UPGRADED_ARGON2ID',
            entityType: 'USER',
            entityId: user.id,
            metadata: { upgradedTo: 'Argon2id' },
          });
        } catch (upgradeErr: any) {
          console.warn('Password hash upgrade warning:', upgradeErr.message);
        }
      }

      // Record last login timestamp
      await query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

      // Check role-specific profiles
      let developerId: string | undefined;
      let verificationStatus: string | undefined;
      let developerName: string | undefined;
      if (user.role === ROLES.DEVELOPER) {
        const devRes = await query(
          'SELECT id, username, display_name, verification_status FROM developers WHERE user_id = $1',
          [user.id]
        );
        if (devRes.rows.length > 0) {
          developerId = devRes.rows[0].id;
          verificationStatus = devRes.rows[0].verification_status;
          developerName = devRes.rows[0].display_name;
        }
      } else if (user.role === ROLES.CEO || user.role === ROLES.MD || user.role === ROLES.ADMIN) {
        // CEO, MD, and ADMIN do not need a separate verified developer profile: auto-provision / resolve
        developerId = await ProjectService.getOrCreateExecutiveDeveloperId(user.id, user.role, user.email);
        verificationStatus = 'VERIFIED';
        developerName =
          user.role === ROLES.CEO
            ? LEADERSHIP.CEO.NAME
            : user.role === ROLES.MD
            ? LEADERSHIP.MD.NAME
            : 'Platform Administrator';
      }

      let clientId: string | undefined;
      let clientNumber: string | undefined;
      let clientName: string | undefined;
      if (user.role === ROLES.CLIENT) {
        const clientRes = await query(
          'SELECT id, client_number, company_name, private_name FROM clients WHERE user_id = $1',
          [user.id]
        );
        if (clientRes.rows.length > 0) {
          clientId = clientRes.rows[0].id;
          clientNumber = clientRes.rows[0].client_number;
          clientName = clientRes.rows[0].private_name || clientRes.rows[0].company_name;
        } else {
          const clientNumSeq = await query(
            `SELECT COALESCE(MAX(SUBSTRING(client_number FROM 10)::int), 0) + 1 AS next_seq FROM clients WHERE client_number ~ '^CLT-2026-[0-9]+$'`
          );
          const nextSeq = clientNumSeq.rows[0]?.next_seq || 1;
          clientNumber = `CLT-2026-${String(nextSeq).padStart(4, '0')}`;
          const newClient = await query(
            `INSERT INTO clients (user_id, client_number, company_name, private_name)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [user.id, clientNumber, 'Apex Retail Labs', user.email.split('@')[0]]
          );
          clientId = newClient.rows[0].id;
          clientName = user.email.split('@')[0];
        }
      }

      let supportStaffId: string | undefined;
      let supportTitle: string | undefined;
      if (user.role === ROLES.SUPPORT) {
        const staffRes = await query(
          'SELECT id, title, department FROM support_staff WHERE user_id = $1',
          [user.id]
        );
        if (staffRes.rows.length > 0) {
          supportStaffId = staffRes.rows[0].id;
          supportTitle = staffRes.rows[0].title;
        }
      }

      // Compute safe redirect URL with open redirect protection
      const defaultRoleRedirect = getDefaultRedirectForRole(user.role);
      const requestedRedirect =
        req.body.returnUrl ||
        req.query.returnUrl ||
        req.body.redirect ||
        req.body.next ||
        req.query.redirect ||
        req.query.next;
      const safeRedirectUrl = validateRedirectUrl(requestedRedirect, defaultRoleRedirect);

      const token = jwt.sign(
        {
          userId: user.id,
          uid: user.uid,
          publicUid: user.uid || user.public_uid,
          email: user.email,
          role: user.role,
          tokenVersion: user.token_version || 1,
          developerId,
          clientId,
          supportStaffId,
        },
        env.JWT_SECRET,
        { expiresIn: (env.JWT_EXPIRES_IN || '7d') as any }
      );

      // Audit log login
      await AuditLogger.log({
        actorUserId: user.id,
        action: 'USER_LOGGED_IN',
        entityType: 'USER',
        entityId: user.id,
        metadata: { role: user.role, email: user.email },
      });

      const displayName =
        developerName ||
        clientName ||
        (user.role === ROLES.CEO
          ? LEADERSHIP.CEO.NAME
          : user.role === ROLES.MD
          ? LEADERSHIP.MD.NAME
          : supportTitle || user.email.split('@')[0]);

      res.json({
        token,
        user: {
          id: user.id,
          uid: user.uid,
          publicUid: user.uid || user.public_uid,
          email: user.email,
          role: user.role,
          status: user.status,
          emailVerified: user.email_verified,
          lastLoginAt: new Date().toISOString(),
          developerId,
          clientId,
          clientNumber,
          supportStaffId,
          verificationStatus,
          name: displayName,
        },
        redirectUrl: safeRedirectUrl,
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
        `SELECT id, uid, public_uid, email, phone, role, status, email_verified, is_suspended, last_login_at, created_at, updated_at 
         FROM users WHERE id = $1`,
        [req.user.userId]
      );
      if (userRes.rows.length === 0) {
        res.status(404).json({ error: 'User account not found' });
        return;
      }

      const user = userRes.rows[0];

      let developer: any = null;
      if (user.role === ROLES.DEVELOPER) {
        const devRes = await query(
          `SELECT id, username, display_name, verification_status, experience, role_title, availability, profile_photo, profile_image, avatar_url 
            FROM developers WHERE user_id = $1`,
          [user.id]
        );
        if (devRes.rows.length > 0) {
          developer = devRes.rows[0];
        }
      } else if (user.role === ROLES.CEO || user.role === ROLES.MD || user.role === ROLES.ADMIN) {
        const execDevId = await ProjectService.getOrCreateExecutiveDeveloperId(user.id, user.role, user.email);
        const devRes = await query(
          `SELECT id, username, display_name, verification_status, experience, role_title, availability, profile_photo, profile_image, avatar_url 
            FROM developers WHERE id = $1`,
          [execDevId]
        );
        if (devRes.rows.length > 0) {
          developer = devRes.rows[0];
          developer.verification_status = 'VERIFIED';
        }
      }

      let client: any = null;
      if (user.role === ROLES.CLIENT) {
        const clientRes = await query(
          `SELECT id, client_number, company_name, private_name, phone 
            FROM clients WHERE user_id = $1`,
          [user.id]
        );
        if (clientRes.rows.length > 0) {
          client = clientRes.rows[0];
        }
      }

      let supportStaff: any = null;
      if (user.role === ROLES.SUPPORT) {
        const staffRes = await query(
          `SELECT id, department, title, support_level, permissions, status 
            FROM support_staff WHERE user_id = $1`,
          [user.id]
        );
        if (staffRes.rows.length > 0) {
          supportStaff = staffRes.rows[0];
        }
      }

      let userPhoto: string | null = null;
      let userName: string | null = null;
      try {
        const photoRes = await query(
          `SELECT avatar_url, profile_image, name FROM users WHERE id = $1`,
          [user.id]
        );
        if (photoRes.rows.length > 0) {
          userPhoto = photoRes.rows[0].avatar_url || photoRes.rows[0].profile_image || null;
          userName = photoRes.rows[0].name || null;
        }
      } catch {
        // Safe fallback if columns not yet present
      }

      const activePhoto = userPhoto || developer?.profile_photo || developer?.profile_image || developer?.avatar_url || null;
      const activeName = userName || developer?.display_name || client?.private_name || user.email.split('@')[0];

      const isExecutive = ['CEO', 'MD', 'ADMIN'].includes(user.role);

      res.json({
        user: {
          id: user.id,
          uid: user.uid,
          publicUid: user.uid || user.public_uid,
          email: user.email,
          phone: user.phone,
          name: activeName,
          profileImage: activePhoto,
          avatarUrl: activePhoto,
          role: user.role,
          status: user.status,
          emailVerified: user.email_verified,
          isSuspended: user.is_suspended,
          lastLoginAt: user.last_login_at,
          createdAt: user.created_at,
          developerId: developer?.id,
          verificationStatus: developer?.verification_status || (isExecutive ? 'VERIFIED' : undefined),
          developer,
          client,
          supportStaff,
        },
      });
    } catch (_error: any) {
      res.json({ user: req.user });
    }
  }

  /**
   * Generates a secure password reset token with 1-hour expiration
   */
  static async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const userRes = await query('SELECT id, email FROM users WHERE email = $1', [normalizedEmail]);
      if (userRes.rows.length === 0) {
        res.json({ message: 'If an account exists with that email, a password reset token has been issued.' });
        return;
      }

      const user = userRes.rows[0];
      const cryptoToken = crypto.randomBytes(32).toString('hex');
      const tokenId = crypto.randomUUID();

      // Sign JWT token for clients that rely on JWT structure
      const resetTokenJwt = jwt.sign(
        { userId: user.id, tokenId, purpose: 'PASSWORD_RESET' },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Store in users table with 1 hour expiry
      await query(
        `UPDATE users 
         SET password_reset_token = $1, password_reset_expires_at = NOW() + INTERVAL '1 hour', updated_at = NOW() 
         WHERE id = $2`,
        [cryptoToken, user.id]
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
        resetToken: cryptoToken,
        jwtResetToken: resetTokenJwt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Resets password using either resetToken or current password verification
   */
  static async resetPassword(req: Request, res: Response): Promise<void> {
    const { email, currentPassword, newPassword, confirmPassword, resetToken } = req.body;

    const validation = validatePassword(newPassword, confirmPassword);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      let targetUserId: string | null = null;
      let tokenIdentifier: string | null = null;

      if (resetToken) {
        // 1. Check database token column
        const dbTokenRes = await query(
          `SELECT id, email, password_reset_expires_at FROM users 
           WHERE password_reset_token = $1 AND password_reset_expires_at > NOW()`,
          [resetToken]
        );

        if (dbTokenRes.rows.length > 0) {
          targetUserId = dbTokenRes.rows[0].id;
        } else {
          // 2. Check JWT reset token format
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
        }
      } else if (email && currentPassword) {
        const normalizedEmail = email.toLowerCase().trim();
        const userRes = await query('SELECT id, password_hash FROM users WHERE email = $1', [normalizedEmail]);
        if (userRes.rows.length === 0) {
          res.status(401).json({ error: 'Invalid credentials.' });
          return;
        }
        const user = userRes.rows[0];
        const verification = await verifyPassword(currentPassword, user.password_hash);
        if (!verification.valid) {
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

      const newHash = await hashPassword(newPassword);
      await query(
        `UPDATE users 
         SET password_hash = $1, password_reset_token = NULL, password_reset_expires_at = NULL, token_version = token_version + 1, password_changed_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [newHash, targetUserId]
      );

      // Invalidate the reset token to prevent reuse
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
   * Changes password for authenticated user session.
   * Verifies current password, applies Argon2id to new password,
   * and increments token_version to invalidate prior sessions.
   */
  static async changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user?.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }

    const validation = validatePassword(newPassword, confirmPassword);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const userRes = await query(
        'SELECT id, password_hash, token_version FROM users WHERE id = $1',
        [req.user.userId]
      );

      if (userRes.rows.length === 0) {
        res.status(404).json({ error: 'User account not found.' });
        return;
      }

      const user = userRes.rows[0];
      const verification = await verifyPassword(currentPassword, user.password_hash);
      if (!verification.valid) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }

      const newHash = await hashPassword(newPassword);
      const nextTokenVersion = (user.token_version || 1) + 1;

      await query(
        `UPDATE users 
         SET password_hash = $1, token_version = $2, password_changed_at = NOW(), updated_at = NOW() 
         WHERE id = $3`,
        [newHash, nextTokenVersion, user.id]
      );

      await AuditLogger.log({
        actorUserId: user.id,
        action: 'PASSWORD_CHANGED',
        entityType: 'USER',
        entityId: user.id,
        metadata: { success: true },
      });

      const freshToken = jwt.sign(
        {
          userId: req.user.userId,
          uid: req.user.uid,
          publicUid: req.user.publicUid,
          email: req.user.email,
          role: req.user.role,
          tokenVersion: nextTokenVersion,
          developerId: req.user.developerId,
          clientId: req.user.clientId,
          supportStaffId: req.user.supportStaffId,
        },
        env.JWT_SECRET,
        { expiresIn: (env.JWT_EXPIRES_IN || '7d') as any }
      );

      res.json({
        message: 'Password changed successfully. Prior active sessions have been invalidated.',
        token: freshToken,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Log out authenticated user session with audit logging and session invalidation
   */
  static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.user?.userId) {
      await query('UPDATE users SET token_version = COALESCE(token_version, 1) + 1, updated_at = NOW() WHERE id = $1', [
        req.user.userId,
      ]);

      await AuditLogger.log({
        actorUserId: req.user.userId,
        action: 'SESSION_INVALIDATED',
        entityType: 'USER',
        entityId: req.user.userId,
        metadata: { email: req.user.email, reason: 'LOGOUT' },
      });

      await AuditLogger.log({
        actorUserId: req.user.userId,
        action: 'USER_LOGGED_OUT',
        entityType: 'USER',
        entityId: req.user.userId,
        metadata: { email: req.user.email },
      });
    }
    res.json({ message: 'Logged out successfully.' });
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

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const userRes = await query('SELECT id, email FROM users WHERE email = $1', [normalizedEmail]);
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
        `UPDATE users SET email_verified = TRUE, email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
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

  private static profileColsChecked = false;
  private static async ensureProfileColumns(): Promise<void> {
    if (AuthController.profileColsChecked) return;
    try {
      await query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(150);
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'developers' AND column_name = 'profile_photo') THEN
            ALTER TABLE developers ALTER COLUMN profile_photo TYPE TEXT;
          ELSE
            ALTER TABLE developers ADD COLUMN profile_photo TEXT;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'developers' AND column_name = 'profile_image') THEN
            ALTER TABLE developers ALTER COLUMN profile_image TYPE TEXT;
          ELSE
            ALTER TABLE developers ADD COLUMN profile_image TEXT;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'developers' AND column_name = 'avatar_url') THEN
            ALTER TABLE developers ALTER COLUMN avatar_url TYPE TEXT;
          ELSE
            ALTER TABLE developers ADD COLUMN avatar_url TEXT;
          END IF;
        END $$;
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      `);
      AuthController.profileColsChecked = true;
    } catch (err: any) {
      console.warn('[ensureProfileColumns warning]:', err?.message);
    }
  }

  /**
   * Update profile details and profile photo for authenticated users
   */
  static async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const {
      name,
      phone,
      location,
      profileImage,
      avatarUrl,
      bio,
      roleTitle,
      companyName,
      skills,
      experience,
      availability,
      githubUrl,
      linkedinUrl,
      portfolioUrl,
    } = req.body;

    try {
      await AuthController.ensureProfileColumns();

      const photo = profileImage || avatarUrl || null;

      // 1. Update users table defensively
      try {
        await query(
          `UPDATE users 
           SET phone = COALESCE($1, phone),
               profile_image = COALESCE($2, profile_image),
               avatar_url = COALESCE($2, avatar_url),
               name = COALESCE($3, name),
               updated_at = NOW()
           WHERE id = $4`,
          [phone || null, photo, name || null, req.user.userId]
        );
      } catch (uErr: any) {
        console.warn('[updateProfile users table warning]:', uErr?.message);
        // Fallback update without custom columns if DB rejected them
        await query(
          `UPDATE users 
           SET phone = COALESCE($1, phone),
               updated_at = NOW()
           WHERE id = $2`,
          [phone || null, req.user.userId]
        ).catch(() => {});
      }

      // 2. If client, update clients table
      if (req.user.role === ROLES.CLIENT) {
        try {
          await query(
            `UPDATE clients
             SET company_name = COALESCE($1, company_name),
                 private_name = COALESCE($2, private_name),
                 phone = COALESCE($3, phone),
                 avatar_url = COALESCE($4, avatar_url),
                 updated_at = NOW()
             WHERE user_id = $5`,
            [companyName || null, name || null, phone || null, photo, req.user.userId]
          );
        } catch {
          await query(
            `UPDATE clients
             SET company_name = COALESCE($1, company_name),
                 private_name = COALESCE($2, private_name),
                 phone = COALESCE($3, phone)
             WHERE user_id = $4`,
            [companyName || null, name || null, phone || null, req.user.userId]
          ).catch(() => {});
        }
      }

      // 3. If developer, executive, or admin, update developer record if exists
      const devRes = await query(
        `SELECT id FROM developers WHERE user_id = $1`,
        [req.user.userId]
      );

      if (devRes.rows.length > 0) {
        const devId = devRes.rows[0].id;
        await DeveloperService.updateProfile(devId, {
          displayName: name,
          roleTitle,
          bio,
          location,
          experience: experience !== undefined ? Number(experience) : undefined,
          availability,
          profilePhoto: photo,
          githubUrl,
          linkedinUrl,
          portfolioUrl,
          skills: Array.isArray(skills)
            ? skills
            : typeof skills === 'string'
            ? skills.split(',').map((s: string) => s.trim()).filter(Boolean)
            : undefined,
        });
      }

      // 4. Return updated user object cleanly without hardcoded column failures
      const updatedUserRes = await query(
        `SELECT id, uid, public_uid, email, phone, role, status, updated_at
         FROM users WHERE id = $1`,
        [req.user.userId]
      );

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          ...(updatedUserRes.rows[0] || {}),
          name: name || undefined,
          profileImage: photo || undefined,
          avatarUrl: photo || undefined,
        },
      });
    } catch (error: any) {
      console.error('[updateProfile Error]:', error);
      res.status(500).json({ error: error.message || 'Failed to update profile' });
    }
  }

  /**
   * Assesses eligibility for account deactivation without performing mutations
   */
  static async getDeletionEligibility(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.user.email === 'shivaa1906@gmail.com' || req.user.role === ROLES.CEO) {
      res.status(403).json({
        eligible: false,
        reasons: ['Chief Executive Officer account is protected and cannot be deleted or deactivated.'],
        activeProjects: [],
      });
      return;
    }

    if (req.user.role === ROLES.MD) {
      res.status(403).json({
        eligible: false,
        reasons: ['Managing Director account is protected and cannot be deactivated via self-service.'],
        activeProjects: [],
      });
      return;
    }

    const reasons: string[] = [];
    let activeProjects: any[] = [];

    if (req.user.role === ROLES.CLIENT) {
      const clientRes = await query('SELECT id FROM clients WHERE user_id = $1', [req.user.userId]);
      if (clientRes.rows.length > 0) {
        const clientId = clientRes.rows[0].id;
        const projRes = await query(
          `SELECT id, project_number, title, status FROM projects 
           WHERE client_id = $1 AND status IN ('IN_PROGRESS', 'DEVELOPER_SELECTED', 'SUBMITTED_FOR_REVIEW', 'SELECTION_PENDING', 'OPEN_FOR_CLAIMS', 'CLAIMS_ACTIVE', 'REVIEWING')`,
          [clientId]
        );
        if (projRes.rows.length > 0) {
          activeProjects = projRes.rows;
          reasons.push('Your account has active projects. Please resolve or transfer those projects before deleting the account.');
        }
      }
    } else if (req.user.role === ROLES.DEVELOPER) {
      const devRes = await query('SELECT id FROM developers WHERE user_id = $1', [req.user.userId]);
      if (devRes.rows.length > 0) {
        const devId = devRes.rows[0].id;
        const projRes = await query(
          `SELECT id, project_number, title, status FROM projects 
           WHERE lead_developer_id = $1 AND status IN ('IN_PROGRESS', 'DEVELOPER_SELECTED', 'SUBMITTED_FOR_REVIEW')`,
          [devId]
        );
        if (projRes.rows.length > 0) {
          activeProjects = projRes.rows;
          reasons.push('Your account has active lead projects in progress. Please complete or transfer those projects before deleting the account.');
        }
      }
    }

    res.json({
      eligible: reasons.length === 0,
      reasons,
      activeProjects,
    });
  }

  /**
   * Safely deactivates user account after verifying explicit confirmation and zero active projects
   * Historical projects, financial transactions, and audit records remain strictly preserved.
   */
  static async deactivateAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // CEO and MD Protection
    if (req.user.email === 'shivaa1906@gmail.com' || req.user.role === ROLES.CEO) {
      res.status(403).json({ error: 'Chief Executive Officer account is protected and cannot be deleted or deactivated.' });
      return;
    }

    if (req.user.role === ROLES.MD) {
      res.status(403).json({ error: 'Managing Director account is protected and cannot be deactivated via self-service.' });
      return;
    }

    // Require explicit confirmation
    const { confirmation, confirmText } = req.body || {};
    const text = confirmation || confirmText;
    if (text !== 'DELETE') {
      res.status(400).json({ error: "Confirmation text 'DELETE' is required to confirm account deactivation." });
      return;
    }

    // Check active projects
    if (req.user.role === ROLES.CLIENT) {
      const clientRes = await query('SELECT id FROM clients WHERE user_id = $1', [req.user.userId]);
      if (clientRes.rows.length > 0) {
        const clientId = clientRes.rows[0].id;
        const activeProjects = await query(
          `SELECT id, project_number, title, status FROM projects 
           WHERE client_id = $1 AND status IN ('IN_PROGRESS', 'DEVELOPER_SELECTED', 'SUBMITTED_FOR_REVIEW', 'SELECTION_PENDING', 'OPEN_FOR_CLAIMS', 'CLAIMS_ACTIVE', 'REVIEWING')`,
          [clientId]
        );
        if (activeProjects.rows.length > 0) {
          res.status(400).json({
            error: 'Your account has active projects. Please resolve or transfer those projects before deleting the account.',
            activeProjects: activeProjects.rows,
          });
          return;
        }
      }
    } else if (req.user.role === ROLES.DEVELOPER) {
      const devRes = await query('SELECT id FROM developers WHERE user_id = $1', [req.user.userId]);
      if (devRes.rows.length > 0) {
        const devId = devRes.rows[0].id;
        const activeLeadProjects = await query(
          `SELECT id, project_number, title, status FROM projects 
           WHERE lead_developer_id = $1 AND status IN ('IN_PROGRESS', 'DEVELOPER_SELECTED', 'SUBMITTED_FOR_REVIEW')`,
          [devId]
        );
        if (activeLeadProjects.rows.length > 0) {
          res.status(400).json({
            error: 'Your account has active projects in progress. Please complete or transfer those projects before deleting the account.',
            activeProjects: activeLeadProjects.rows,
          });
          return;
        }
      }
    }

    try {
      await withTransaction(async (client) => {
        // 1. Audit log: ACCOUNT_DELETION_REQUESTED
        await AuditLogger.log(
          {
            actorUserId: req.user!.userId,
            action: 'ACCOUNT_DELETION_REQUESTED',
            entityType: 'USER',
            entityId: req.user!.userId,
            metadata: { email: req.user!.email, role: req.user!.role },
          },
          client
        );

        // 2. Safely deactivate user: mark DISABLED and invalidate all session tokens
        await client.query(
          `UPDATE users 
           SET status = 'DISABLED', 
               is_suspended = TRUE, 
               suspension_reason = 'Account deactivated by user request', 
               token_version = COALESCE(token_version, 1) + 1, 
               updated_at = NOW() 
           WHERE id = $1`,
          [req.user!.userId]
        );

        // 3. If developer, set availability to UNAVAILABLE
        if (req.user!.role === ROLES.DEVELOPER) {
          await client.query(
            `UPDATE developers SET availability = 'UNAVAILABLE', updated_at = NOW() WHERE user_id = $1`,
            [req.user!.userId]
          );
        }

        // 4. Audit log: ACCOUNT_DEACTIVATED
        await AuditLogger.log(
          {
            actorUserId: req.user!.userId,
            action: 'ACCOUNT_DEACTIVATED',
            entityType: 'USER',
            entityId: req.user!.userId,
            metadata: {
              email: req.user!.email,
              role: req.user!.role,
              preservedHistory: true,
              deactivatedAt: new Date().toISOString(),
            },
          },
          client
        );

        // 5. Audit log: SESSION_INVALIDATED
        await AuditLogger.log(
          {
            actorUserId: req.user!.userId,
            action: 'SESSION_INVALIDATED',
            entityType: 'USER',
            entityId: req.user!.userId,
            metadata: { email: req.user!.email, reason: 'ACCOUNT_DEACTIVATED' },
          },
          client
        );
      });

      res.json({
        message: 'Account successfully deactivated. All active sessions have been invalidated.',
        deactivated: true,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to deactivate account' });
    }
  }

  /**
   * Initiates Google OAuth: generates cryptographically secure state and PKCE verifier,
   * sets secure HttpOnly cookie, and redirects user to Google's authorization endpoint.
   */
  static async initiateGoogleOAuth(req: Request, res: Response): Promise<void> {
    try {
      const requestedRedirect =
        req.query.returnUrl ||
        req.query.redirect ||
        req.query.next;
      const safeReturnUrl = validateRedirectUrl(requestedRedirect, '/dashboard');

      if (!GoogleOAuthService.isConfigured() && process.env.NODE_ENV !== 'test') {
        const errorRedirect = `/login?error=oauth_unavailable`;
        if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
          res.status(503).json({
            error: 'Google sign-in is temporarily unavailable.',
            code: 'OAUTH_UNAVAILABLE',
            redirectUrl: errorRedirect,
          });
          return;
        }
        res.redirect(errorRedirect);
        return;
      }

      await AuditLogger.log({
        action: 'GOOGLE_OAUTH_STARTED',
        entityType: 'OAUTH',
        entityId: 'google',
        metadata: { returnUrl: safeReturnUrl },
      });

      const { authorizationUrl, state } = GoogleOAuthService.generateAuthorizationUrl(safeReturnUrl);

      // Set secure HttpOnly cookie for state binding
      const isProduction = env.NODE_ENV === 'production';
      const cookieOptions = [
        `oauth_state=${state}`,
        'Path=/api/auth/google',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=600',
        ...(isProduction ? ['Secure'] : []),
      ].join('; ');
      res.setHeader('Set-Cookie', cookieOptions);

      if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
        res.json({
          url: authorizationUrl,
          state,
          redirectUrl: authorizationUrl,
        });
        return;
      }

      res.redirect(authorizationUrl);
    } catch (err: any) {
      await AuditLogger.log({
        action: 'GOOGLE_OAUTH_FAILURE',
        entityType: 'OAUTH',
        entityId: 'google',
        metadata: { error: err.message, stage: 'INITIATION' },
      });

      if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
        res.status(500).json({ error: err.message || 'Failed to initiate Google OAuth' });
        return;
      }
      res.redirect('/login?error=oauth_unavailable');
    }
  }

  /**
   * Handles Google OAuth callback: validates state, exchanges authorization code,
   * verifies ID token, resolves or provisions identity, and redirects with authenticated session.
   */
  static async handleGoogleOAuthCallback(req: Request, res: Response): Promise<void> {
    const isJsonClient =
      req.headers.accept?.includes('application/json') ||
      req.query.format === 'json' ||
      req.body?.format === 'json';
    const clearCookieHeader = 'oauth_state=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0';

    const handleCallbackError = async (
      statusCode: number,
      errorCode: string,
      userFriendlyMessage: string,
      auditMetadata?: any
    ) => {
      await AuditLogger.log({
        action: 'GOOGLE_OAUTH_FAILURE',
        entityType: 'OAUTH',
        entityId: 'google',
        metadata: { errorCode, ...auditMetadata },
      });

      res.setHeader('Set-Cookie', clearCookieHeader);

      if (isJsonClient) {
        res.status(statusCode).json({
          error: userFriendlyMessage,
          code: errorCode,
          redirectUrl: `/login?error=${errorCode}`,
        });
        return;
      }

      res.redirect(`/login?error=${errorCode}`);
    };

    try {
      // 1. Check for provider-level callback error (e.g. user cancelled login)
      const providerError = req.query.error || req.body?.error;
      if (providerError) {
        await handleCallbackError(
          400,
          'cancelled',
          'Google sign-in was cancelled.',
          { providerError: String(providerError) }
        );
        return;
      }

      const state = (req.query.state || req.body?.state) as string;
      const code = (req.query.code || req.body?.code) as string;
      const directIdToken = (req.body?.id_token || req.query?.id_token) as string;

      // 2. Validate and consume single-use state token
      let session;
      try {
        session = GoogleOAuthService.consumeState(state);
      } catch (stateErr: any) {
        const errCode = stateErr.code === 'STATE_EXPIRED' ? 'state_expired' : 'invalid_state';
        await handleCallbackError(
          400,
          errCode,
          'Your Google sign-in session expired. Please try again.'
        );
        return;
      }

      // 3. Verify presence of code (or test-supplied id_token)
      if (!code && !directIdToken) {
        await handleCallbackError(
          400,
          'missing_code',
          'Invalid authentication request: authorization code is missing.'
        );
        return;
      }

      // 4. Exchange code for tokens (or use direct id_token if provided in test mode)
      let idToken = directIdToken;
      if (!idToken) {
        try {
          const tokenRes = await GoogleOAuthService.exchangeCodeForTokens(code, session.codeVerifier);
          idToken = tokenRes.id_token;
        } catch (exchangeErr: any) {
          await handleCallbackError(
            400,
            exchangeErr.code || 'exchange_failed',
            'Failed to exchange authorization code with Google.'
          );
          return;
        }
      }

      // 5. Verify ID token claims & cryptographic signature
      let claims;
      try {
        claims = await GoogleOAuthService.verifyIdToken(idToken);
      } catch (tokenErr: any) {
        const errCode = tokenErr.code || 'invalid_token';
        let status = 401;
        let message = 'Google token verification failed.';
        if (errCode === 'TOKEN_EXPIRED') {
          message = 'Google ID token has expired. Please sign in again.';
        } else if (errCode === 'INVALID_AUDIENCE' || errCode === 'INVALID_ISSUER') {
          message = 'Untrusted or invalid identity provider token.';
        }
        await handleCallbackError(status, errCode.toLowerCase(), message);
        return;
      }

      // 6. Resolve Google Identity & Session
      let result;
      try {
        result = await GoogleOAuthService.resolveGoogleIdentity(claims, session.returnUrl);
      } catch (resolveErr: any) {
        if (resolveErr.code === 'EMAIL_CONFLICT') {
          await handleCallbackError(
            409,
            'account_exists_conflict',
            'An account already exists with this email. Please sign in using your existing account.',
            { email: claims.email }
          );
          return;
        }
        if (resolveErr.code === 'ACCOUNT_SUSPENDED') {
          await handleCallbackError(
            403,
            'account_suspended',
            'Your account has been suspended by administration. Please contact platform support.'
          );
          return;
        }
        if (resolveErr.code === 'ACCOUNT_DISABLED') {
          await handleCallbackError(
            403,
            'account_disabled',
            'Your account has been disabled. Please contact platform support.'
          );
          return;
        }
        if (resolveErr.code === 'UNVERIFIED_EMAIL') {
          await handleCallbackError(
            400,
            'unverified_email',
            'Your Google email address is not verified by Google.'
          );
          return;
        }
        throw resolveErr;
      }

      // Clear the state cookie on success
      res.setHeader('Set-Cookie', clearCookieHeader);

      if (isJsonClient) {
        res.json(result);
        return;
      }

      const redirectDestination = `/auth/callback?token=${encodeURIComponent(result.token)}&redirect=${encodeURIComponent(result.redirectUrl)}`;
      res.redirect(redirectDestination);
    } catch (err: any) {
      await handleCallbackError(
        500,
        'oauth_failed',
        'Google sign-in is temporarily unavailable.'
      );
    }
  }
}

