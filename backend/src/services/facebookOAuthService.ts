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

export interface FacebookIdentityClaims {
  id: string;
  name?: string;
  email?: string;
  pictureUrl?: string;
}

export interface FacebookOAuthStateSession {
  state: string;
  codeVerifier: string;
  returnUrl: string;
  createdAt: number;
}

export interface FacebookOAuthResult {
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

// In-memory sliding window cache for Facebook OAuth state sessions (10-minute TTL)
const facebookStateStore = new Map<string, FacebookOAuthStateSession>();

// Cleanup expired state sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of facebookStateStore.entries()) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      facebookStateStore.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

// Test-only hooks for automated test suites (strictly isolated to NODE_ENV === 'test')
let testFacebookTokenExchanger: ((code: string, codeVerifier: string) => Promise<{ access_token: string }>) | null = null;
let testFacebookIdentityVerifier: ((accessToken: string) => Promise<FacebookIdentityClaims>) | null = null;

export class FacebookOAuthService {
  /**
   * Set isolated token exchanger for automated test environments
   */
  static setTestTokenExchanger(fn: ((code: string, codeVerifier: string) => Promise<{ access_token: string }>) | null) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Test token exchanger is strictly restricted to test environments.');
    }
    testFacebookTokenExchanger = fn;
  }

  /**
   * Set isolated identity verifier for automated test environments
   */
  static setTestIdentityVerifier(fn: ((accessToken: string) => Promise<FacebookIdentityClaims>) | null) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Test identity verifier is strictly restricted to test environments.');
    }
    testFacebookIdentityVerifier = fn;
  }

  /**
   * Validates whether Facebook OAuth credentials are configured
   */
  static isConfigured(): boolean {
    return Boolean(
      env.FACEBOOK_CLIENT_ID &&
      env.FACEBOOK_CLIENT_SECRET &&
      env.FACEBOOK_OAUTH_REDIRECT_URI
    );
  }

  /**
   * Initiates Facebook OAuth: generates cryptographically secure state and PKCE verifier/challenge
   */
  static generateAuthorizationUrl(returnUrl?: string): {
    authorizationUrl: string;
    state: string;
    codeVerifier: string;
  } {
    if (!this.isConfigured() && process.env.NODE_ENV !== 'test') {
      throw new Error('Facebook OAuth is not configured on this server.');
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
    facebookStateStore.set(state, {
      state,
      codeVerifier,
      returnUrl: safeReturnUrl,
      createdAt: Date.now(),
    });

    // 6. Build Facebook OAuth authorization URL (Graph API v19.0 Dialog)
    const fbAuthEndpoint = 'https://www.facebook.com/v19.0/dialog/oauth';
    const params = new URLSearchParams({
      client_id: env.FACEBOOK_CLIENT_ID,
      redirect_uri: env.FACEBOOK_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'email,public_profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      authorizationUrl: `${fbAuthEndpoint}?${params.toString()}`,
      state,
      codeVerifier,
    };
  }

  /**
   * Validates and single-use consumes OAuth state token
   */
  static consumeState(state: string | undefined): FacebookOAuthStateSession {
    if (!state || typeof state !== 'string') {
      const err: any = new Error('OAuth state is required.');
      err.code = 'INVALID_STATE';
      throw err;
    }

    const session = facebookStateStore.get(state);
    if (!session) {
      const err: any = new Error('Your Facebook sign-in session expired or is invalid. Please try again.');
      err.code = 'INVALID_STATE';
      throw err;
    }

    // Check expiration (10 minutes)
    if (Date.now() - session.createdAt > 10 * 60 * 1000) {
      facebookStateStore.delete(state);
      const err: any = new Error('Your Facebook sign-in session expired. Please try again.');
      err.code = 'STATE_EXPIRED';
      throw err;
    }

    // Single-use: immediately delete state to prevent replay attacks
    facebookStateStore.delete(state);

    return session;
  }

  /**
   * Exchanges authorization code with Facebook Graph API token endpoint
   */
  static async exchangeCodeForTokens(
    code: string,
    codeVerifier: string
  ): Promise<{ access_token: string }> {
    if (!code) {
      const err: any = new Error('Authorization code is required.');
      err.code = 'MISSING_CODE';
      throw err;
    }

    if (testFacebookTokenExchanger) {
      return await testFacebookTokenExchanger(code, codeVerifier);
    }

    const tokenEndpoint = 'https://graph.facebook.com/v19.0/oauth/access_token';
    const bodyParams = new URLSearchParams({
      client_id: env.FACEBOOK_CLIENT_ID,
      client_secret: env.FACEBOOK_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      redirect_uri: env.FACEBOOK_OAUTH_REDIRECT_URI,
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
        parsedError = json.error?.message || json.error_description || parsedError;
      } catch {}
      const err: any = new Error(`Facebook token exchange failed: ${parsedError}`);
      err.code = 'TOKEN_EXCHANGE_FAILED';
      throw err;
    }

    const tokenData = (await response.json()) as any;
    if (!tokenData.access_token) {
      const err: any = new Error('Facebook did not return an access token.');
      err.code = 'MISSING_TOKEN';
      throw err;
    }

    return {
      access_token: tokenData.access_token,
    };
  }

  /**
   * Cryptographically verifies Facebook access token and fetches user identity profile.
   * Enforces:
   * 1. Token debug validation (is_valid === true)
   * 2. Application ID validation (aud / app_id === env.FACEBOOK_CLIENT_ID)
   * 3. Identity profile retrieval with appsecret_proof HMAC
   */
  static async verifyFacebookTokenAndIdentity(accessToken: string): Promise<FacebookIdentityClaims> {
    if (!accessToken || typeof accessToken !== 'string') {
      const err: any = new Error('Missing Facebook access token.');
      err.code = 'INVALID_TOKEN';
      throw err;
    }

    if (testFacebookIdentityVerifier) {
      return await testFacebookIdentityVerifier(accessToken);
    }

    // 1. Verify token authenticity and audience via debug_token endpoint
    const appAccessToken = `${env.FACEBOOK_CLIENT_ID}|${env.FACEBOOK_CLIENT_SECRET}`;
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appAccessToken)}`;
    const debugRes = await fetch(debugUrl);

    if (!debugRes.ok) {
      const err: any = new Error('Facebook access token verification failed.');
      err.code = 'TOKEN_VERIFICATION_FAILED';
      throw err;
    }

    const debugData = (await debugRes.json()) as any;
    const tokenInfo = debugData?.data;

    if (!tokenInfo || !tokenInfo.is_valid) {
      const err: any = new Error('Facebook access token is invalid or expired.');
      err.code = 'INVALID_TOKEN';
      throw err;
    }

    // Strict App ID Verification (confused deputy defense)
    if (String(tokenInfo.app_id) !== String(env.FACEBOOK_CLIENT_ID)) {
      const err: any = new Error('Facebook token was not issued for this application.');
      err.code = 'INVALID_APP_ID';
      throw err;
    }

    if (!tokenInfo.user_id) {
      const err: any = new Error('Facebook token missing user identifier.');
      err.code = 'MISSING_SUB';
      throw err;
    }

    // 2. Fetch authenticated user profile using App Secret Proof
    const appSecretProof = crypto
      .createHmac('sha256', env.FACEBOOK_CLIENT_SECRET)
      .update(accessToken)
      .digest('hex');

    const meUrl = `https://graph.facebook.com/v19.0/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}&appsecret_proof=${appSecretProof}`;
    const meRes = await fetch(meUrl);

    if (!meRes.ok) {
      const err: any = new Error('Failed to retrieve Facebook user profile.');
      err.code = 'PROFILE_FETCH_FAILED';
      throw err;
    }

    const profile = (await meRes.json()) as any;

    if (!profile.id || String(profile.id) !== String(tokenInfo.user_id)) {
      const err: any = new Error('Facebook profile identity mismatch.');
      err.code = 'IDENTITY_MISMATCH';
      throw err;
    }

    return {
      id: String(profile.id),
      name: profile.name,
      email: profile.email ? profile.email.toLowerCase().trim() : undefined,
      pictureUrl: profile.picture?.data?.url,
    };
  }

  /**
   * Resolves Facebook identity against platform accounts:
   * - Checks provider identity (provider='facebook', provider_subject=id)
   * - Enforces account status (ACTIVE vs SUSPENDED/DISABLED)
   * - Explicitly handles missing email (requires user email completion)
   * - Detects email conflicts with unlinked local accounts
   * - Safely provisions new client account if user does not exist
   */
  static async resolveFacebookIdentity(
    claims: FacebookIdentityClaims,
    safeReturnUrl: string
  ): Promise<FacebookOAuthResult> {
    const provider = 'facebook';
    const providerSubject = claims.id;

    // 1. Check if this exact Facebook identity already exists in oauth_accounts
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
          action: 'FACEBOOK_OAUTH_FAILURE',
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
          action: 'FACEBOOK_OAUTH_FAILURE',
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
      const token = jwt.sign(
        {
          userId: existingAccount.user_id,
          uid: existingAccount.uid,
          publicUid: existingAccount.public_uid || existingAccount.uid,
          email: existingAccount.user_email,
          role: existingAccount.role,
          tokenVersion: existingAccount.token_version || 1,
          developerId,
          clientId,
        },
        env.JWT_SECRET,
        { expiresIn: (env.JWT_EXPIRES_IN || '7d') as any }
      );

      // Log successful login audit events
      await AuditLogger.log({
        actorUserId: existingAccount.user_id,
        action: 'FACEBOOK_ACCOUNT_LOGIN',
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
        action: 'FACEBOOK_OAUTH_SUCCESS',
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

    // 2. Identity not linked. For new account creation, verify that Facebook provided an email address.
    if (!claims.email || typeof claims.email !== 'string' || !claims.email.includes('@')) {
      await AuditLogger.log({
        action: 'FACEBOOK_OAUTH_FAILURE',
        entityType: 'OAUTH',
        entityId: providerSubject,
        metadata: { reason: 'MISSING_FACEBOOK_EMAIL' },
      });
      const err: any = new Error(
        'Facebook did not provide an email address. Please continue to complete your account.'
      );
      err.code = 'MISSING_EMAIL';
      throw err;
    }

    const normalizedEmail = claims.email.toLowerCase().trim();

    // 3. Provider identity does NOT exist. Check if an existing platform user has this email.
    const emailConflictRes = await query(
      `SELECT id, email, role, status FROM users WHERE email = $1`,
      [normalizedEmail]
    );

    if (emailConflictRes.rows.length > 0) {
      const existingUser = emailConflictRes.rows[0];

      // Log security audit for email conflict
      await AuditLogger.log({
        actorUserId: existingUser.id,
        action: 'FACEBOOK_ACCOUNT_EMAIL_CONFLICT',
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

    // 4. Completely new Facebook user: Provision new platform account safely.
    // Client role is strictly server-controlled according to Phase 4 client onboarding rules.
    const cleanName = sanitizeInput(claims.name || normalizedEmail.split('@')[0]);
    const cleanPicture = claims.pictureUrl ? sanitizeInput(claims.pictureUrl) : null;
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
          action: 'FACEBOOK_ACCOUNT_CREATED',
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
          action: 'FACEBOOK_OAUTH_SUCCESS',
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

    const token = jwt.sign(
      {
        userId: createdResult.user.id,
        uid: createdResult.user.uid,
        publicUid: createdResult.user.uid,
        email: createdResult.user.email,
        role: ROLES.CLIENT,
        tokenVersion: 1,
        clientId: createdResult.client.id,
        clientNumber: createdResult.client.client_number,
      },
      env.JWT_SECRET,
      { expiresIn: (env.JWT_EXPIRES_IN || '7d') as any }
    );

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
    facebookStateStore.clear();
  }
}
