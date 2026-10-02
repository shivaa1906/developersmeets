import crypto from 'crypto';
import { query, withTransaction } from '../database/db.js';
import { env } from '../config/environment.js';
import { AuditLogger } from '../utils/auditLogger.js';
import { NotificationService } from './notificationService.js';
import { normalizeEmail, isValidEmail } from '../utils/emailNormalization.js';
import { hashPassword, verifyPassword, validatePassword } from '../utils/password.js';
import { validateRedirectUrl } from '../controllers/authController.js';
import { GoogleOAuthService, GoogleIdentityClaims } from './googleOAuthService.js';
import { FacebookOAuthService, FacebookIdentityClaims } from './facebookOAuthService.js';
import { DiscordOAuthService, DiscordIdentityClaims } from './discordOAuthService.js';

export type SupportedOAuthProvider = 'google' | 'facebook' | 'discord';

export interface OAuthLinkStateRecord {
  id: string;
  state: string;
  user_id: string;
  provider: SupportedOAuthProvider;
  code_verifier: string;
  return_url: string;
  expires_at: string;
  consumed: boolean;
  created_at: string;
}

export interface ProviderIdentityClaims {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  avatarUrl?: string;
}

export interface ConnectedProviderInfo {
  connected: boolean;
  email: string | null;
  displayName: string | null;
  connectedAt: string | null;
  canDisconnect: boolean;
}

export interface ConnectedAccountsResponse {
  hasPassword: boolean;
  authMethodsCount: number;
  providers: {
    google: ConnectedProviderInfo;
    facebook: ConnectedProviderInfo;
    discord: ConnectedProviderInfo;
  };
}

export class AccountLinkingService {
  /**
   * Capitalizes provider name for user-facing messages
   */
  static getProviderTitle(provider: string): string {
    switch (provider.toLowerCase()) {
      case 'google':
        return 'Google';
      case 'facebook':
        return 'Facebook';
      case 'discord':
        return 'Discord';
      default:
        return provider.charAt(0).toUpperCase() + provider.slice(1);
    }
  }

  /**
   * Initiates account linking for an authenticated platform user:
   * 1. Validates authenticated user exists and is active.
   * 2. Checks if provider is already connected.
   * 3. Generates 256-bit CSPRNG state and PKCE verifier/challenge.
   * 4. Persists linking state bound to user_id in database.
   * 5. Constructs and returns the provider authorization URL.
   */
  static async initiateProviderLink(
    userId: string,
    provider: SupportedOAuthProvider,
    returnUrl?: string
  ): Promise<{ authorizationUrl: string; state: string; provider: string }> {
    if (!['google', 'facebook', 'discord'].includes(provider)) {
      const err: any = new Error(`Unsupported OAuth provider: ${provider}`);
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify user exists and is not suspended or disabled
    const userRes = await query(
      'SELECT id, uid, role, status, is_suspended FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) {
      const err: any = new Error('User account not found.');
      err.statusCode = 404;
      throw err;
    }
    const user = userRes.rows[0];
    if (user.status === 'SUSPENDED' || user.is_suspended === true) {
      const err: any = new Error('Account has been suspended.');
      err.statusCode = 403;
      throw err;
    }
    if (user.status === 'DISABLED') {
      const err: any = new Error('Account has been disabled.');
      err.statusCode = 403;
      throw err;
    }

    // 2. Check if provider is already linked to this user
    const existingLinkRes = await query(
      'SELECT id FROM oauth_accounts WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );
    if (existingLinkRes.rows.length > 0) {
      const providerTitle = this.getProviderTitle(provider);
      const err: any = new Error(`${providerTitle} is already connected to this account.`);
      err.statusCode = 409;
      err.code = 'ALREADY_CONNECTED';
      throw err;
    }

    // 3. Generate cryptographically secure state and PKCE verifier/challenge
    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const safeReturnUrl = validateRedirectUrl(returnUrl, '/dashboard/settings');

    // 4. Clean up any existing unconsumed or expired states for this user and provider
    await query(
      `DELETE FROM oauth_link_states 
       WHERE expires_at < NOW() OR (user_id = $1 AND provider = $2)`,
      [userId, provider]
    );

    // 5. Persist OAuth linking state bound strictly to user_id
    await query(
      `INSERT INTO oauth_link_states (state, user_id, provider, code_verifier, return_url, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')`,
      [state, userId, provider, codeVerifier, safeReturnUrl]
    );

    // 6. Generate provider authorization URL
    let authorizationUrl: string;
    if (provider === 'google') {
      const googleAuthEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID || '',
        redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI || '',
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        access_type: 'online',
        prompt: 'select_account',
      });
      authorizationUrl = `${googleAuthEndpoint}?${params.toString()}`;
    } else if (provider === 'facebook') {
      const facebookAuthEndpoint = 'https://www.facebook.com/v19.0/dialog/oauth';
      const params = new URLSearchParams({
        client_id: env.FACEBOOK_CLIENT_ID || '',
        redirect_uri: env.FACEBOOK_OAUTH_REDIRECT_URI || '',
        response_type: 'code',
        scope: 'email,public_profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      authorizationUrl = `${facebookAuthEndpoint}?${params.toString()}`;
    } else {
      const discordAuthEndpoint = 'https://discord.com/api/oauth2/authorize';
      const params = new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID || '',
        redirect_uri: env.DISCORD_OAUTH_REDIRECT_URI || '',
        response_type: 'code',
        scope: 'identify email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'consent',
      });
      authorizationUrl = `${discordAuthEndpoint}?${params.toString()}`;
    }

    // 7. Audit log event
    await AuditLogger.log({
      actorUserId: userId,
      action: 'ACCOUNT_PROVIDER_LINK_STARTED',
      entityType: 'OAUTH',
      entityId: provider,
      metadata: {
        provider,
        targetUserId: userId,
        returnUrl: safeReturnUrl,
      },
    });

    return {
      authorizationUrl,
      state,
      provider,
    };
  }

  /**
   * Looks up an unconsumed, unexpired OAuth linking state
   */
  static async findLinkState(state: string): Promise<OAuthLinkStateRecord | null> {
    if (!state || typeof state !== 'string') return null;
    const res = await query(
      `SELECT * FROM oauth_link_states WHERE state = $1`,
      [state]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0] as OAuthLinkStateRecord;
  }

  /**
   * Completes provider linking following OAuth callback or token exchange:
   * - Validates state existence, expiration, and single-use consumption.
   * - Defends against session confusion (binding authenticated user to initiator).
   * - Verifies provider identity claims cryptographically.
   * - Enforces provider uniqueness and blocks duplicate accounts / silent merges.
   * - Safely links provider within an ACID database transaction.
   */
  static async completeProviderLink(params: {
    state: string;
    code?: string;
    idToken?: string;
    accessToken?: string;
    claims?: ProviderIdentityClaims;
    sessionUserId?: string;
  }): Promise<{
    status: 'SUCCESS' | 'ALREADY_LINKED';
    message: string;
    provider: string;
    returnUrl: string;
  }> {
    const { state, code, idToken, accessToken, claims: preVerifiedClaims, sessionUserId } = params;

    if (!state || typeof state !== 'string') {
      const err: any = new Error('OAuth state is required for account linking.');
      err.statusCode = 400;
      err.code = 'INVALID_STATE';
      throw err;
    }

    // 1. Fetch linking state record
    const stateRecordRes = await query(
      'SELECT * FROM oauth_link_states WHERE state = $1',
      [state]
    );

    if (stateRecordRes.rows.length === 0) {
      await AuditLogger.log({
        action: 'ACCOUNT_PROVIDER_LINK_FAILED',
        entityType: 'OAUTH',
        entityId: 'unknown',
        metadata: { reason: 'INVALID_STATE_NOT_FOUND', state: state.slice(0, 8) + '...' },
      });
      const err: any = new Error('Your account linking session is invalid or has already been used. Please try again.');
      err.statusCode = 400;
      err.code = 'INVALID_STATE';
      throw err;
    }

    const linkState = stateRecordRes.rows[0] as OAuthLinkStateRecord;
    const provider = linkState.provider;
    const providerTitle = this.getProviderTitle(provider);
    const targetUserId = linkState.user_id;

    // Check single-use / already consumed
    if (linkState.consumed) {
      await AuditLogger.log({
        actorUserId: targetUserId,
        action: 'ACCOUNT_PROVIDER_LINK_FAILED',
        entityType: 'OAUTH',
        entityId: provider,
        metadata: { reason: 'STATE_REPLAY_ATTEMPT', provider },
      });
      const err: any = new Error('This account linking request has already been processed. Replay rejected.');
      err.statusCode = 400;
      err.code = 'STATE_ALREADY_CONSUMED';
      throw err;
    }

    // Check expiration (10 minutes)
    if (new Date(linkState.expires_at).getTime() < Date.now()) {
      await query('DELETE FROM oauth_link_states WHERE id = $1', [linkState.id]);
      await AuditLogger.log({
        actorUserId: targetUserId,
        action: 'ACCOUNT_PROVIDER_LINK_FAILED',
        entityType: 'OAUTH',
        entityId: provider,
        metadata: { reason: 'STATE_EXPIRED', provider },
      });
      const err: any = new Error('Your account linking session has expired. Please try again.');
      err.statusCode = 400;
      err.code = 'STATE_EXPIRED';
      throw err;
    }

    // Session confusion protection: if sessionUserId is provided, ensure it matches targetUserId
    if (sessionUserId && sessionUserId !== targetUserId) {
      await AuditLogger.log({
        actorUserId: sessionUserId,
        action: 'ACCOUNT_PROVIDER_LINK_FAILED',
        entityType: 'OAUTH',
        entityId: provider,
        metadata: {
          reason: 'SESSION_CONFUSION_MISMATCH',
          boundUserId: targetUserId,
          currentSessionUserId: sessionUserId,
        },
      });
      const err: any = new Error('Session confusion detected: The linking request was initiated by a different user.');
      err.statusCode = 403;
      err.code = 'SESSION_CONFUSION';
      throw err;
    }

    // Mark consumed immediately to prevent replay concurrency
    await query('UPDATE oauth_link_states SET consumed = TRUE WHERE id = $1', [linkState.id]);

    // 2. Resolve provider claims
    let providerClaims: ProviderIdentityClaims;

    try {
      if (preVerifiedClaims) {
        providerClaims = preVerifiedClaims;
      } else if (provider === 'google') {
        let tokenToVerify = idToken;
        if (code) {
          const tokens = await GoogleOAuthService.exchangeCodeForTokens(code, linkState.code_verifier);
          tokenToVerify = tokens.id_token;
        }
        if (!tokenToVerify) {
          throw new Error('No Google token received for verification.');
        }
        const gClaims: GoogleIdentityClaims = await GoogleOAuthService.verifyIdToken(tokenToVerify);
        providerClaims = {
          sub: gClaims.sub,
          email: gClaims.email,
          emailVerified: gClaims.email_verified,
          displayName: gClaims.name,
          avatarUrl: gClaims.picture,
        };
      } else if (provider === 'facebook') {
        let fbToken = accessToken;
        if (code) {
          const tokens = await FacebookOAuthService.exchangeCodeForTokens(code, linkState.code_verifier);
          fbToken = tokens.access_token;
        }
        if (!fbToken) {
          throw new Error('No Facebook access token received for verification.');
        }
        const fbClaims: FacebookIdentityClaims = await FacebookOAuthService.verifyFacebookTokenAndIdentity(fbToken);
        providerClaims = {
          sub: fbClaims.id,
          email: fbClaims.email,
          emailVerified: Boolean(fbClaims.email),
          displayName: fbClaims.name,
          avatarUrl: fbClaims.pictureUrl,
        };
      } else if (provider === 'discord') {
        let dToken = accessToken;
        if (code) {
          const tokens = await DiscordOAuthService.exchangeCodeForTokens(code, linkState.code_verifier);
          dToken = tokens.access_token;
        }
        if (!dToken) {
          throw new Error('No Discord access token received for verification.');
        }
        const dClaims: DiscordIdentityClaims = await DiscordOAuthService.verifyDiscordTokenAndIdentity(dToken);
        providerClaims = {
          sub: dClaims.id,
          email: dClaims.email,
          emailVerified: dClaims.verified !== false,
          displayName: dClaims.global_name || dClaims.username,
          avatarUrl: dClaims.avatarUrl,
        };
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (claimErr: any) {
      await AuditLogger.log({
        actorUserId: targetUserId,
        action: 'ACCOUNT_PROVIDER_LINK_FAILED',
        entityType: 'OAUTH',
        entityId: provider,
        metadata: { reason: 'CLAIM_VERIFICATION_FAILED', error: claimErr.message },
      });
      claimErr.statusCode = claimErr.statusCode || 400;
      throw claimErr;
    }

    if (!providerClaims.sub || typeof providerClaims.sub !== 'string') {
      const err: any = new Error(`Provider returned invalid identity subject.`);
      err.statusCode = 400;
      throw err;
    }

    const providerSubject = providerClaims.sub;
    const normalizedEmail = providerClaims.email ? normalizeEmail(providerClaims.email) : null;

    // 3. Transactional identity verification and link attachment
    try {
      const linkResult = await withTransaction(async (client) => {
        // Re-verify target user exists, is active
        const targetUserRes = await client.query(
          'SELECT id, uid, role, status, email, is_suspended FROM users WHERE id = $1',
          [targetUserId]
        );
        if (targetUserRes.rows.length === 0) {
          const err: any = new Error('Target user account not found.');
          err.statusCode = 404;
          throw err;
        }
        const targetUser = targetUserRes.rows[0];
        if (targetUser.status === 'SUSPENDED' || targetUser.is_suspended === true) {
          const err: any = new Error('Account has been suspended.');
          err.statusCode = 403;
          throw err;
        }
        if (targetUser.status === 'DISABLED') {
          const err: any = new Error('Account has been disabled.');
          err.statusCode = 403;
          throw err;
        }

        // Check 1: Is this exact provider identity already registered in oauth_accounts?
        const existingProviderRes = await client.query(
          `SELECT oa.id, oa.user_id, oa.provider, oa.provider_subject, u.email as owner_email, u.role as owner_role
           FROM oauth_accounts oa
           JOIN users u ON oa.user_id = u.id
           WHERE oa.provider = $1 AND oa.provider_subject = $2`,
          [provider, providerSubject]
        );

        if (existingProviderRes.rows.length > 0) {
          const existingProvider = existingProviderRes.rows[0];

          // Case A: Already linked to the SAME user
          if (existingProvider.user_id === targetUserId) {
            await AuditLogger.log(
              {
                actorUserId: targetUserId,
                action: 'ACCOUNT_PROVIDER_ALREADY_LINKED',
                entityType: 'OAUTH',
                entityId: provider,
                metadata: {
                  provider,
                  targetUserId,
                },
              },
              client
            );

            return {
              status: 'ALREADY_LINKED' as const,
              message: `${providerTitle} is already connected to this account.`,
              provider,
              returnUrl: linkState.return_url,
            };
          }

          // Case B: Linked to a DIFFERENT platform user
          // NEVER MOVE, MERGE, OR OVERWRITE!
          const conflictErr: any = new Error(
            `This ${providerTitle} account is already connected to another account.`
          );
          conflictErr.statusCode = 409;
          conflictErr.code = 'PROVIDER_CONFLICT';
          conflictErr.auditAction = 'ACCOUNT_PROVIDER_CONFLICT';
          conflictErr.auditMetadata = {
            reason: 'PROVIDER_ALREADY_LINKED_TO_OTHER_USER',
            provider,
            conflictingUserId: existingProvider.user_id,
            targetUserId,
          };
          throw conflictErr;
        }

        // Check 2: Does current user already have this provider linked with a different subject?
        const userExistingProviderRes = await client.query(
          'SELECT id FROM oauth_accounts WHERE user_id = $1 AND provider = $2 FOR UPDATE',
          [targetUserId, provider]
        );
        if (userExistingProviderRes.rows.length > 0) {
          const conflictErr: any = new Error(
            `A ${providerTitle} account is already connected to this account. Please disconnect it first.`
          );
          conflictErr.statusCode = 409;
          conflictErr.code = 'USER_PROVIDER_EXISTS';
          throw conflictErr;
        }

        // Check 3: Does provider verified email belong to another platform user?
        if (normalizedEmail) {
          const emailConflictRes = await client.query(
            'SELECT id, role, email FROM users WHERE LOWER(TRIM(email)) = $1 AND id <> $2',
            [normalizedEmail, targetUserId]
          );
          if (emailConflictRes.rows.length > 0) {
            const conflictErr: any = new Error(
              'This provider is associated with another platform account. Sign in to that account to manage its connected accounts.'
            );
            conflictErr.statusCode = 409;
            conflictErr.code = 'EMAIL_CONFLICT';
            conflictErr.auditAction = 'ACCOUNT_PROVIDER_CONFLICT';
            conflictErr.auditMetadata = {
              reason: 'EMAIL_BELONGS_TO_OTHER_ACCOUNT',
              provider,
              conflictingEmail: normalizedEmail,
              targetUserId,
            };
            throw conflictErr;
          }
        }

        // Check 4: Safe insertion into oauth_accounts
        try {
          await client.query(
            `INSERT INTO oauth_accounts (
               user_id, provider, provider_subject, provider_email,
               provider_email_verified, provider_display_name, provider_avatar_url,
               created_at, updated_at, last_used_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())`,
            [
              targetUserId,
              provider,
              providerSubject,
              normalizedEmail,
              providerClaims.emailVerified || false,
              providerClaims.displayName || null,
              providerClaims.avatarUrl || null,
            ]
          );
        } catch (dbErr: any) {
          // Handle race conditions caught by DB uniqueness constraints
          if (dbErr.code === '23505') {
            const conflictErr: any = new Error(
              `This ${providerTitle} account is already connected to an account.`
            );
            conflictErr.statusCode = 409;
            conflictErr.code = 'PROVIDER_CONFLICT';
            conflictErr.auditAction = 'ACCOUNT_PROVIDER_CONFLICT';
            conflictErr.auditMetadata = { reason: 'CONCURRENT_PROVIDER_LINK_RACE', provider };
            throw conflictErr;
          }
          throw dbErr;
        }

        // Log successful audit event (Zero secrets, zero raw tokens)
        await AuditLogger.log(
          {
            actorUserId: targetUserId,
            action: 'ACCOUNT_PROVIDER_LINKED',
            entityType: 'OAUTH',
            entityId: provider,
            metadata: {
              provider,
              email: normalizedEmail,
              targetUserId,
            },
          },
          client
        );

        // Create security notification
        await NotificationService.createNotification({
          userId: targetUserId,
          type: 'SECURITY_ALERT',
          title: 'Sign-in Method Connected',
          message: `${providerTitle} was successfully connected to your account.`,
          client,
        });

        // Remove the consumed state row
        await client.query('DELETE FROM oauth_link_states WHERE id = $1', [linkState.id]);

        return {
          status: 'SUCCESS' as const,
          message: `${providerTitle} has been connected.`,
          provider,
          returnUrl: linkState.return_url,
        };
      });

      return linkResult;
    } catch (err: any) {
      if (err.auditAction) {
        await AuditLogger.log({
          actorUserId: targetUserId,
          action: err.auditAction,
          entityType: 'OAUTH',
          entityId: provider,
          metadata: err.auditMetadata || {},
        });
      }
      throw err;
    }
  }

  /**
   * Safe provider unlinking with Last-Authentication-Method Protection:
   * - Enforces row-level locks on user and oauth_accounts.
   * - Calculates remaining valid authentication methods.
   * - Blocks unlinking if remaining_methods would equal 0.
   * - Safely deletes the provider identity and creates audit log + notification.
   */
  static async unlinkProvider(
    userId: string,
    provider: SupportedOAuthProvider,
    passwordConfirmation?: string
  ): Promise<{
    message: string;
    remainingAuthMethods: number;
    hasPassword: boolean;
    provider: string;
  }> {
    if (!['google', 'facebook', 'discord'].includes(provider)) {
      const err: any = new Error(`Unsupported OAuth provider: ${provider}`);
      err.statusCode = 400;
      throw err;
    }

    const providerTitle = this.getProviderTitle(provider);

    await AuditLogger.log({
      actorUserId: userId,
      action: 'ACCOUNT_PROVIDER_UNLINK_STARTED',
      entityType: 'OAUTH',
      entityId: provider,
      metadata: { provider, targetUserId: userId },
    });

    try {
      return await withTransaction(async (client) => {
        // 1. Fetch user password status
        const userRes = await client.query(
          'SELECT id, password_hash, role, status, is_suspended FROM users WHERE id = $1',
          [userId]
        );
        if (userRes.rows.length === 0) {
          const err: any = new Error('User not found.');
          err.statusCode = 404;
          throw err;
        }
        const user = userRes.rows[0];
        if (user.status === 'SUSPENDED' || user.is_suspended === true) {
          const err: any = new Error('Account has been suspended.');
          err.statusCode = 403;
          throw err;
        }

        // Check optional password confirmation if password is set and confirmation provided
        const hasPassword = Boolean(user.password_hash && user.password_hash.trim().length > 0);
        if (hasPassword && passwordConfirmation) {
          const isValidPass = await verifyPassword(user.password_hash, passwordConfirmation);
          if (!isValidPass) {
            const err: any = new Error('Incorrect password confirmation.');
            err.statusCode = 401;
            throw err;
          }
        }

        // 2. Lock and retrieve all connected OAuth accounts for this user
        const oauthRes = await client.query(
          'SELECT id, provider FROM oauth_accounts WHERE user_id = $1 FOR UPDATE',
          [userId]
        );
        const oauthAccounts = oauthRes.rows;

        const targetAccount = oauthAccounts.find((a) => a.provider === provider);
        if (!targetAccount) {
          const err: any = new Error(`${providerTitle} is not connected to this account.`);
          err.statusCode = 404;
          throw err;
        }

        // 3. Last-Authentication-Method Protection calculation
        const otherOAuthAccounts = oauthAccounts.filter((a) => a.provider !== provider);
        const remainingMethods = (hasPassword ? 1 : 0) + otherOAuthAccounts.length;

        if (remainingMethods === 0) {
          const blockErr: any = new Error(
            `You must add another secure sign-in method before disconnecting ${providerTitle}.`
          );
          blockErr.statusCode = 400;
          blockErr.code = 'LAST_AUTH_METHOD_BLOCKED';
          blockErr.auditAction = 'ACCOUNT_PROVIDER_UNLINK_BLOCKED';
          blockErr.auditMetadata = {
            reason: 'LAST_AUTH_METHOD',
            provider,
            targetUserId: userId,
          };
          throw blockErr;
        }

        // 4. Safely delete the provider identity
        await client.query(
          'DELETE FROM oauth_accounts WHERE id = $1',
          [targetAccount.id]
        );

        // 5. Audit log
        await AuditLogger.log(
          {
            actorUserId: userId,
            action: 'ACCOUNT_PROVIDER_UNLINKED',
            entityType: 'OAUTH',
            entityId: provider,
            metadata: {
              provider,
              targetUserId: userId,
              remainingAuthMethods: remainingMethods,
            },
          },
          client
        );

        // 6. Security Notification
        await NotificationService.createNotification({
          userId,
          type: 'SECURITY_ALERT',
          title: 'Sign-in Method Disconnected',
          message: `${providerTitle} was disconnected from your account.`,
          client,
        });

        return {
          message: `${providerTitle} disconnected successfully.`,
          remainingAuthMethods: remainingMethods,
          hasPassword,
          provider,
        };
      });
    } catch (err: any) {
      if (err.auditAction) {
        await AuditLogger.log({
          actorUserId: userId,
          action: err.auditAction,
          entityType: 'OAUTH',
          entityId: provider,
          metadata: err.auditMetadata || {},
        });
      }
      throw err;
    }
  }

  /**
   * Retrieves connected providers for the authenticated user without exposing provider subjects
   */
  static async getConnectedProviders(userId: string): Promise<ConnectedAccountsResponse> {
    const userRes = await query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) {
      const err: any = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }

    const hasPassword = Boolean(
      userRes.rows[0].password_hash && userRes.rows[0].password_hash.trim().length > 0
    );

    const oauthRes = await query(
      `SELECT provider, provider_email, provider_display_name, created_at
       FROM oauth_accounts
       WHERE user_id = $1`,
      [userId]
    );

    const providerMap = new Map<string, any>();
    for (const row of oauthRes.rows) {
      providerMap.set(row.provider, row);
    }

    const totalMethods = (hasPassword ? 1 : 0) + oauthRes.rows.length;

    const buildProviderInfo = (providerName: string): ConnectedProviderInfo => {
      const row = providerMap.get(providerName);
      if (!row) {
        return {
          connected: false,
          email: null,
          displayName: null,
          connectedAt: null,
          canDisconnect: false,
        };
      }
      return {
        connected: true,
        email: row.provider_email || null,
        displayName: row.provider_display_name || null,
        connectedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        canDisconnect: totalMethods > 1,
      };
    };

    return {
      hasPassword,
      authMethodsCount: totalMethods,
      providers: {
        google: buildProviderInfo('google'),
        facebook: buildProviderInfo('facebook'),
        discord: buildProviderInfo('discord'),
      },
    };
  }

  /**
   * Sets initial password for OAuth-only accounts using Argon2id
   */
  static async setInitialPassword(
    userId: string,
    newPassword: string,
    confirmPassword?: string
  ): Promise<{ message: string }> {
    const validation = validatePassword(newPassword, confirmPassword);
    if (!validation.valid) {
      const err: any = new Error(validation.error);
      err.statusCode = 400;
      throw err;
    }

    return await withTransaction(async (client) => {
      const userRes = await client.query(
        'SELECT id, password_hash, role, status FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      if (userRes.rows.length === 0) {
        const err: any = new Error('User not found.');
        err.statusCode = 404;
        throw err;
      }
      const user = userRes.rows[0];

      if (user.password_hash && user.password_hash.trim().length > 0) {
        const err: any = new Error('Password already set. Please use change password to update it.');
        err.statusCode = 400;
        throw err;
      }

      const passwordHash = await hashPassword(newPassword);

      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, userId]
      );

      await AuditLogger.log(
        {
          actorUserId: userId,
          action: 'PASSWORD_SET',
          entityType: 'USER',
          entityId: userId,
          metadata: { userId },
        },
        client
      );

      await NotificationService.createNotification({
        userId,
        type: 'SECURITY_ALERT',
        title: 'Sign-in Password Created',
        message: 'A password has been successfully established for your account.',
        client,
      });

      return { message: 'Password set successfully.' };
    });
  }

  /**
   * Queries explicit cross-account relationships from user_account_links
   * (e.g. Client + Developer accounts owned by the same person)
   */
  static async getAccountRelationships(userId: string) {
    const res = await query(
      `SELECT ual.id, ual.relationship_type, ual.created_at,
              u.uid as linked_user_uid, u.role as linked_user_role
       FROM user_account_links ual
       JOIN users u ON ual.linked_user_id = u.id
       WHERE ual.primary_user_id = $1
       UNION
       SELECT ual.id, ual.relationship_type, ual.created_at,
              u.uid as linked_user_uid, u.role as linked_user_role
       FROM user_account_links ual
       JOIN users u ON ual.primary_user_id = u.id
       WHERE ual.linked_user_id = $1`,
      [userId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      relationshipType: row.relationship_type,
      linkedUid: row.linked_user_uid,
      linkedRole: row.linked_user_role,
      createdAt: row.created_at,
    }));
  }
}
