import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query, withTransaction } from '../database/db.js';
import { env } from '../config/environment.js';
import { AuditLogger } from '../utils/auditLogger.js';
import { ROLES, LEADERSHIP } from '../config/constants.js';
import { sanitizeInput } from '../utils/sanitizer.js';
import { generateUserUid } from '../utils/uidGenerator.js';
import { validateRedirectUrl, getDefaultRedirectForRole } from '../controllers/authController.js';
import { ProjectService } from './projectService.js';
import { generateAccessToken } from '../utils/tokenService.js';

export interface GoogleIdentityClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  aud?: string;
  iss?: string;
  exp?: number;
}

export interface OAuthStateSession {
  state: string;
  codeVerifier: string;
  returnUrl: string;
  createdAt: number;
}

export interface GoogleOAuthResult {
  token: string;
  user: {
    id: string;
    uid: string;
    publicUid: string;
    email: string;
    role: string;
    status: string;
    emailVerified: boolean;
    name?: string;
    developerId?: string;
    clientId?: string;
    clientNumber?: string;
    verificationStatus?: string;
  };
  redirectUrl: string;
  isNewUser: boolean;
}

// In-memory sliding window cache for OAuth state sessions (10-minute TTL)
const stateStore = new Map<string, OAuthStateSession>();

// Cleanup expired state sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of stateStore.entries()) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      stateStore.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

// Test-only verifier hook for automated test suites
let testTokenVerifier: ((idToken: string) => Promise<GoogleIdentityClaims>) | null = null;
let testTokenExchanger: ((code: string, codeVerifier: string) => Promise<{ id_token: string; access_token?: string }>) | null = null;

export class GoogleOAuthService {
  /**
   * Set isolated token verifier for automated test environments
   */
  static setTestTokenVerifier(fn: ((idToken: string) => Promise<GoogleIdentityClaims>) | null) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Test token verifier is strictly restricted to test environments.');
    }
    testTokenVerifier = fn;
  }

  /**
   * Set isolated token exchanger for automated test environments
   */
  static setTestTokenExchanger(fn: ((code: string, codeVerifier: string) => Promise<{ id_token: string; access_token?: string }>) | null) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Test token exchanger is strictly restricted to test environments.');
    }
    testTokenExchanger = fn;
  }

  /**
   * Validates whether Google OAuth credentials are configured
   */
  static isConfigured(): boolean {
    return Boolean(
      env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REDIRECT_URI
    );
  }

  /**
   * Initiates Google OAuth: generates cryptographically secure state and PKCE verifier/challenge
   */
  static generateAuthorizationUrl(returnUrl?: string): {
    authorizationUrl: string;
    state: string;
    codeVerifier: string;
  } {
    if (!this.isConfigured() && process.env.NODE_ENV !== 'test') {
      throw new Error('Google OAuth is not configured on this server.');
    }

    // 1. Generate state with 32 bytes (256 bits) of CSPRNG entropy
    const state = crypto.randomBytes(32).toString('hex');

    // 2. Generate PKCE code_verifier (32 random bytes, base64url encoded)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    // 3. Compute code_challenge = base64url(SHA256(codeVerifier))
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    // 4. Sanitize destination return URL
    const safeReturnUrl = validateRedirectUrl(returnUrl, '/dashboard');

    // 5. Store state session in memory
    stateStore.set(state, {
      state,
      codeVerifier,
      returnUrl: safeReturnUrl,
      createdAt: Date.now(),
    });

    // 6. Build Google OAuth authorization URL
    const googleAuthEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'online',
      prompt: 'select_account',
    });

    return {
      authorizationUrl: `${googleAuthEndpoint}?${params.toString()}`,
      state,
      codeVerifier,
    };
  }

  /**
   * Validates and single-use consumes OAuth state token
   */
  static consumeState(state: string | undefined): OAuthStateSession {
    if (!state || typeof state !== 'string') {
      const err: any = new Error('OAuth state is required.');
      err.code = 'INVALID_STATE';
      throw err;
    }

    const session = stateStore.get(state);
    if (!session) {
      const err: any = new Error('Your Google sign-in session expired or is invalid. Please try again.');
      err.code = 'INVALID_STATE';
      throw err;
    }

    // Check expiration (10 minutes)
    if (Date.now() - session.createdAt > 10 * 60 * 1000) {
      stateStore.delete(state);
      const err: any = new Error('Your Google sign-in session expired. Please try again.');
      err.code = 'STATE_EXPIRED';
      throw err;
    }

    // Single-use: immediately delete state to prevent replay attacks
    stateStore.delete(state);

    return session;
  }

  /**
   * Exchanges authorization code with Google's token endpoint
   */
  static async exchangeCodeForTokens(
    code: string,
    codeVerifier: string
  ): Promise<{ id_token: string; access_token?: string }> {
    if (!code) {
      const err: any = new Error('Authorization code is required.');
      err.code = 'MISSING_CODE';
      throw err;
    }

    if (testTokenExchanger) {
      return await testTokenExchanger(code, codeVerifier);
    }

    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const bodyParams = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedError = 'Code exchange failed';
      try {
        const json = JSON.parse(errText);
        parsedError = json.error_description || json.error || parsedError;
      } catch {
        // ignore JSON parse errors
      }
      const err: any = new Error(`Google token exchange failed: ${parsedError}`);
      err.code = 'TOKEN_EXCHANGE_FAILED';
      throw err;
    }

    const tokenData = (await response.json()) as any;
    if (!tokenData.id_token) {
      const err: any = new Error('Google did not return an ID token.');
      err.code = 'MISSING_ID_TOKEN';
      throw err;
    }

    return {
      id_token: tokenData.id_token,
      access_token: tokenData.access_token,
    };
  }

  /**
   * Verifies Google ID token cryptographic signature and all standard claims
   */
  static async verifyIdToken(idToken: string): Promise<GoogleIdentityClaims> {
    if (!idToken || typeof idToken !== 'string') {
      const err: any = new Error('Missing ID token');
      err.code = 'INVALID_ID_TOKEN';
      throw err;
    }

    if (testTokenVerifier) {
      return await testTokenVerifier(idToken);
    }

    // 1. Decode token structure without trusting contents yet
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      const err: any = new Error('Malformed ID token structure');
      err.code = 'INVALID_ID_TOKEN';
      throw err;
    }

    // 2. Validate using Google's official tokeninfo cryptographic endpoint
    const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const res = await fetch(tokenInfoUrl);

    if (!res.ok) {
      await res.text();
      const err: any = new Error('Google ID token signature verification failed.');
      err.code = 'TOKEN_SIGNATURE_INVALID';
      throw err;
    }

    const payload = (await res.json()) as any;

    // 3. Strict Audience Verification
    if (payload.aud !== env.GOOGLE_CLIENT_ID) {
      const err: any = new Error('Google ID token audience mismatch.');
      err.code = 'INVALID_AUDIENCE';
      throw err;
    }

    // 4. Strict Issuer Verification
    const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
    if (!validIssuers.includes(payload.iss)) {
      const err: any = new Error('Google ID token issuer mismatch.');
      err.code = 'INVALID_ISSUER';
      throw err;
    }

    // 5. Expiration Verification
    const nowSeconds = Math.floor(Date.now() / 1000);
    const exp = parseInt(payload.exp, 10);
    if (isNaN(exp) || exp < nowSeconds - 60) {
      const err: any = new Error('Google ID token has expired.');
      err.code = 'TOKEN_EXPIRED';
      throw err;
    }

    // 6. Identity Subject Verification
    if (!payload.sub || typeof payload.sub !== 'string') {
      const err: any = new Error('Google ID token missing subject identifier.');
      err.code = 'MISSING_SUB';
      throw err;
    }

    // 7. Email and Verification Status
    if (!payload.email) {
      const err: any = new Error('Google ID token missing email address.');
      err.code = 'MISSING_EMAIL';
      throw err;
    }

    const emailVerified =
      payload.email_verified === true ||
      payload.email_verified === 'true';

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase().trim(),
      email_verified: emailVerified,
      name: payload.name || payload.given_name || payload.email.split('@')[0],
      picture: payload.picture,
      aud: payload.aud,
      iss: payload.iss,
      exp: exp,
    };
  }

  /**
   * Resolves Google identity against platform accounts:
   * - Checks provider identity (provider='google', provider_subject=sub)
   * - Enforces account status (ACTIVE vs SUSPENDED/DISABLED)
   * - Detects email conflicts with unlinked local accounts
   * - Safely provisions new client account if user does not exist
   */
  static async resolveGoogleIdentity(
    claims: GoogleIdentityClaims,
    safeReturnUrl: string
  ): Promise<GoogleOAuthResult> {
    const provider = 'google';
    const providerSubject = claims.sub;
    const normalizedEmail = claims.email.toLowerCase().trim();

    // 1. Enforce verified email requirement from Google
    if (!claims.email_verified) {
      await AuditLogger.log({
        action: 'GOOGLE_OAUTH_FAILURE',
        entityType: 'OAUTH',
        entityId: providerSubject,
        metadata: { reason: 'UNVERIFIED_GOOGLE_EMAIL', email: normalizedEmail },
      });
      const err: any = new Error('Your Google email address is not verified by Google.');
      err.code = 'UNVERIFIED_EMAIL';
      throw err;
    }

    // 2. Check if this exact Google identity already exists
    const existingIdentityRes = await query(
      `SELECT oa.*, u.uid, u.public_uid, u.email as user_email, u.role, u.status, u.is_suspended, 
              u.suspension_reason, u.token_version
       FROM oauth_accounts oa
       JOIN users u ON oa.user_id = u.id
       WHERE oa.provider = $1 AND oa.provider_subject = $2`,
      [provider, providerSubject]
    );

    if (existingIdentityRes.rows.length > 0) {
      const existingAccount = existingIdentityRes.rows[0];

      // Enforce suspension check
      if (existingAccount.status === 'SUSPENDED' || existingAccount.is_suspended === true) {
        await AuditLogger.log({
          actorUserId: existingAccount.user_id,
          action: 'GOOGLE_OAUTH_FAILURE',
          entityType: 'USER',
          entityId: existingAccount.user_id,
          metadata: { reason: 'ACCOUNT_SUSPENDED', role: existingAccount.role },
        });
        const err: any = new Error('Your account has been suspended by administration. Please contact platform support.');
        err.code = 'ACCOUNT_SUSPENDED';
        throw err;
      }

      // Enforce disabled check
      if (existingAccount.status === 'DISABLED') {
        await AuditLogger.log({
          actorUserId: existingAccount.user_id,
          action: 'GOOGLE_OAUTH_FAILURE',
          entityType: 'USER',
          entityId: existingAccount.user_id,
          metadata: { reason: 'ACCOUNT_DISABLED', role: existingAccount.role },
        });
        const err: any = new Error('Your account has been disabled. Please contact platform support.');
        err.code = 'ACCOUNT_DISABLED';
        throw err;
      }

      // Update last_used_at on oauth_accounts and last_login_at on users
      await query(
        `UPDATE oauth_accounts SET last_used_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [existingAccount.id]
      );
      await query(
        `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [existingAccount.user_id]
      );

      // Resolve role-specific profile details
      let developerId: string | undefined;
      let verificationStatus: string | undefined;
      let developerName: string | undefined;
      if (existingAccount.role === ROLES.DEVELOPER) {
        const devRes = await query(
          'SELECT id, username, display_name, verification_status FROM developers WHERE user_id = $1',
          [existingAccount.user_id]
        );
        if (devRes.rows.length > 0) {
          developerId = devRes.rows[0].id;
          verificationStatus = devRes.rows[0].verification_status;
          developerName = devRes.rows[0].display_name;
        }
      } else if (
        existingAccount.role === ROLES.CEO ||
        existingAccount.role === ROLES.MD ||
        existingAccount.role === ROLES.ADMIN
      ) {
        developerId = await ProjectService.getOrCreateExecutiveDeveloperId(
          existingAccount.user_id,
          existingAccount.role,
          existingAccount.user_email
        );
        verificationStatus = 'VERIFIED';
        developerName =
          existingAccount.role === ROLES.CEO
            ? LEADERSHIP.CEO.NAME
            : existingAccount.role === ROLES.MD
            ? LEADERSHIP.MD.NAME
            : 'Platform Administrator';
      }

      let clientId: string | undefined;
      let clientNumber: string | undefined;
      let clientName: string | undefined;
      if (existingAccount.role === ROLES.CLIENT) {
        const clientRes = await query(
          'SELECT id, client_number, company_name, private_name FROM clients WHERE user_id = $1',
          [existingAccount.user_id]
        );
        if (clientRes.rows.length > 0) {
          clientId = clientRes.rows[0].id;
          clientNumber = clientRes.rows[0].client_number;
          clientName = clientRes.rows[0].private_name || clientRes.rows[0].company_name;
        }
      }

      const defaultRoleRedirect = getDefaultRedirectForRole(existingAccount.role);
      const effectiveRedirect = safeReturnUrl !== '/dashboard' ? safeReturnUrl : defaultRoleRedirect;

      // Create standard authenticated JWT session
      const token = generateAccessToken({
        userId: existingAccount.user_id,
        uid: existingAccount.uid,
        publicUid: existingAccount.public_uid || existingAccount.uid,
        email: existingAccount.user_email,
        role: existingAccount.role,
        tokenVersion: existingAccount.token_version || 1,
        developerId,
        clientId,
      });

      // Log successful login audit event
      await AuditLogger.log({
        actorUserId: existingAccount.user_id,
        action: 'GOOGLE_ACCOUNT_LOGIN',
        entityType: 'USER',
        entityId: existingAccount.user_id,
        metadata: {
          provider,
          providerSubject,
          role: existingAccount.role,
          email: existingAccount.user_email,
        },
      });

      await AuditLogger.log({
        actorUserId: existingAccount.user_id,
        action: 'GOOGLE_OAUTH_SUCCESS',
        entityType: 'USER',
        entityId: existingAccount.user_id,
        metadata: { provider, isNewUser: false },
      });

      return {
        token,
        user: {
          id: existingAccount.user_id,
          uid: existingAccount.uid,
          publicUid: existingAccount.public_uid || existingAccount.uid,
          email: existingAccount.user_email,
          role: existingAccount.role,
          status: existingAccount.status,
          emailVerified: true,
          name: developerName || clientName || claims.name,
          developerId,
          clientId,
          clientNumber,
          verificationStatus,
        },
        redirectUrl: effectiveRedirect,
        isNewUser: false,
      };
    }

    // 3. Provider identity does NOT exist. Check if an existing platform user has this email.
    const emailConflictRes = await query(
      `SELECT id, email, role, status FROM users WHERE LOWER(TRIM(email)) = $1`,
      [normalizedEmail]
    );

    if (emailConflictRes.rows.length > 0) {
      const existingUser = emailConflictRes.rows[0];

      // Log security audit for email conflict
      await AuditLogger.log({
        actorUserId: existingUser.id,
        action: 'GOOGLE_ACCOUNT_EMAIL_CONFLICT',
        entityType: 'USER',
        entityId: existingUser.id,
        metadata: {
          provider,
          providerSubject,
          conflictingEmail: normalizedEmail,
          existingRole: existingUser.role,
        },
      });

      // DO NOT silently attach or create duplicate account.
      // Inform the user to sign in with their existing account credentials.
      const err: any = new Error(
        'An account already exists with this email. Please sign in using your existing account.'
      );
      err.code = 'EMAIL_CONFLICT';
      throw err;
    }

    // 4. Completely new Google user: Provision new platform account safely.
    // Client role is strictly server-controlled according to Phase 4 client onboarding rules.
    const cleanName = sanitizeInput(claims.name || normalizedEmail.split('@')[0]);
    const cleanPicture = claims.picture ? sanitizeInput(claims.picture) : null;
    const internalUid = generateUserUid();

    const createdResult = await withTransaction(async (client) => {
      // Insert new user with 16-character UID and password_hash = NULL
      const userRes = await client.query(
        `INSERT INTO users (uid, public_uid, email, password_hash, role, status, email_verified, email_verified_at, last_login_at)
         VALUES ($1, $1, $2, NULL, $3, 'ACTIVE', TRUE, NOW(), NOW())
         RETURNING id, uid, public_uid, email, role, status, email_verified, created_at`,
        [internalUid, normalizedEmail, ROLES.CLIENT]
      );
      const newUser = userRes.rows[0];

      // Calculate sequential client tag
      const seqRes = await client.query(
        `SELECT SUBSTRING(client_number FROM 9)::int as num 
         FROM clients WHERE client_number ~ '^Client #[0-9]+$' ORDER BY num ASC`
      );
      const existingNums = new Set(seqRes.rows.map((r: any) => r.num));
      let nextNum = 1;
      while (existingNums.has(nextNum)) {
        nextNum++;
      }
      const clientTag = `Client #${String(nextNum).padStart(3, '0')}`;

      // Insert client profile record
      const clientRecord = await client.query(
        `INSERT INTO clients (user_id, client_number, company_name, private_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, client_number, company_name, private_name`,
        [newUser.id, clientTag, `${cleanName} Enterprise`, cleanName]
      );

      // Insert federated identity in oauth_accounts table
      const oauthRes = await client.query(
        `INSERT INTO oauth_accounts (
           user_id, provider, provider_subject, provider_email, 
           provider_email_verified, provider_display_name, provider_avatar_url
         )
         VALUES ($1, $2, $3, $4, TRUE, $5, $6)
         RETURNING id`,
        [newUser.id, provider, providerSubject, normalizedEmail, cleanName, cleanPicture]
      );

      // Default notification preferences
      await client.query(
        `INSERT INTO notification_preferences (user_id, email_notifications, project_updates, proposal_alerts, support_ticket_updates)
         VALUES ($1, TRUE, TRUE, TRUE, TRUE)
         ON CONFLICT (user_id) DO NOTHING`,
        [newUser.id]
      );

      // Audit logs
      await AuditLogger.log(
        {
          actorUserId: newUser.id,
          action: 'GOOGLE_ACCOUNT_CREATED',
          entityType: 'USER',
          entityId: newUser.id,
          metadata: {
            provider,
            providerSubject,
            email: normalizedEmail,
            role: ROLES.CLIENT,
            clientNumber: clientTag,
          },
        },
        client
      );

      await AuditLogger.log(
        {
          actorUserId: newUser.id,
          action: 'GOOGLE_OAUTH_SUCCESS',
          entityType: 'USER',
          entityId: newUser.id,
          metadata: { provider, isNewUser: true },
        },
        client
      );

      return {
        user: newUser,
        client: clientRecord.rows[0],
        oauthAccount: oauthRes.rows[0],
      };
    });

    const defaultRoleRedirect = getDefaultRedirectForRole(ROLES.CLIENT);
    const effectiveRedirect = safeReturnUrl !== '/dashboard' ? safeReturnUrl : defaultRoleRedirect;

    const token = generateAccessToken({
      userId: createdResult.user.id,
      uid: createdResult.user.uid,
      publicUid: createdResult.user.uid,
      email: createdResult.user.email,
      role: ROLES.CLIENT,
      tokenVersion: 1,
      clientId: createdResult.client.id,
    });

    return {
      token,
      user: {
        id: createdResult.user.id,
        uid: createdResult.user.uid,
        publicUid: createdResult.user.uid,
        email: createdResult.user.email,
        role: ROLES.CLIENT,
        status: createdResult.user.status,
        emailVerified: true,
        name: cleanName,
        clientId: createdResult.client.id,
        clientNumber: createdResult.client.client_number,
      },
      redirectUrl: effectiveRedirect,
      isNewUser: true,
    };
  }

  /**
   * Helper to clear in-memory state store (testing helper)
   */
  static resetStateStore() {
    stateStore.clear();
  }
}
