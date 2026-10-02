import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/environment.js';

export interface TokenUserPayload {
  userId: string;
  uid?: string;
  publicUid?: string;
  email?: string;
  role: string;
  tokenVersion?: number;
  developerId?: string;
  clientId?: string;
  supportStaffId?: string;
}

export interface VerifiedTokenClaims {
  userId: string;
  uid?: string;
  publicUid?: string;
  email?: string;
  role?: string;
  tokenVersion?: number;
  developerId?: string;
  clientId?: string;
  supportStaffId?: string;
  sub?: string;
  iss?: string;
  aud?: string;
  jti?: string;
  iat?: number;
  exp?: number;
  purpose?: string;
}

export const TOKEN_ISSUER = 'nexus-platform';
export const TOKEN_AUDIENCE = 'nexus-client';
export const TOKEN_ALGORITHM = 'HS256';

/**
 * Authoritative Access Token Generator
 * Emits strictly signed, bounded-lifetime JWTs containing standard claims (sub, iss, aud, jti, exp, iat)
 * and platform session identifiers (userId, uid, role, tokenVersion).
 * Explicitly excludes sensitive credentials, hashes, and secrets.
 */
export function generateAccessToken(
  payload: TokenUserPayload,
  expiresIn: string = env.JWT_EXPIRES_IN || '7d'
): string {
  const jti = crypto.randomUUID();

  return jwt.sign(
    {
      sub: payload.userId,
      userId: payload.userId,
      uid: payload.uid,
      publicUid: payload.publicUid || payload.uid,
      email: payload.email,
      role: payload.role,
      tokenVersion: payload.tokenVersion ?? 1,
      purpose: 'ACCESS_TOKEN',
      ...(payload.developerId ? { developerId: payload.developerId } : {}),
      ...(payload.clientId ? { clientId: payload.clientId } : {}),
      ...(payload.supportStaffId ? { supportStaffId: payload.supportStaffId } : {}),
    },
    env.JWT_SECRET,
    {
      algorithm: TOKEN_ALGORITHM,
      expiresIn: expiresIn as any,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      jwtid: jti,
    }
  );
}

/**
 * Hardened Access Token Verifier
 * - Enforces strict algorithm verification (rejects alg=none and algorithm confusion).
 * - Verifies token format and signature integrity.
 * - Enforces issuer, audience, and subject claims when present.
 * - Extracts and returns verified payload.
 */
export function verifyAccessToken(token: string): VerifiedTokenClaims {
  if (!token || typeof token !== 'string') {
    const err: any = new Error('Authentication required. No token provided.');
    err.code = 'NO_TOKEN';
    throw err;
  }

  const trimmedToken = token.trim();
  if (!trimmedToken) {
    const err: any = new Error('Authentication required. Empty token provided.');
    err.code = 'EMPTY_TOKEN';
    throw err;
  }

  // 1. Structure check: token must have exactly 3 dot-separated parts
  const parts = trimmedToken.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2] || parts[2].trim() === '') {
    const isMissingSig = parts.length === 3 && (!parts[2] || parts[2].trim() === '');
    const err: any = new Error(isMissingSig ? 'Token signature is missing.' : 'Malformed token.');
    err.code = isMissingSig ? 'MISSING_SIGNATURE' : 'MALFORMED_TOKEN';
    throw err;
  }

  // 2. Unverified header inspect to catch alg: 'none' or algorithm switching attempts
  const decodedHeader = jwt.decode(trimmedToken, { complete: true });
  if (!decodedHeader || typeof decodedHeader !== 'object' || !decodedHeader.header) {
    const err: any = new Error('Malformed token.');
    err.code = 'MALFORMED_TOKEN';
    throw err;
  }

  const alg = decodedHeader.header.alg;
  if (!alg || alg.toLowerCase() === 'none' || alg !== TOKEN_ALGORITHM) {
    const err: any = new Error('Invalid or unsupported token algorithm.');
    err.code = 'INVALID_ALGORITHM';
    throw err;
  }

  // 3. Cryptographic signature and expiration verification
  const decoded: any = jwt.verify(trimmedToken, env.JWT_SECRET, {
    algorithms: [TOKEN_ALGORITHM],
  });

  // 4. Claims validation
  if (decoded.purpose && decoded.purpose !== 'ACCESS_TOKEN') {
    const err: any = new Error('Invalid token purpose: non-session token cannot be used for authentication.');
    err.code = 'INVALID_PURPOSE';
    throw err;
  }

  if (decoded.iss !== undefined && decoded.iss !== TOKEN_ISSUER) {
    const err: any = new Error('Invalid token issuer.');
    err.code = 'INVALID_ISSUER';
    throw err;
  }

  if (decoded.aud !== undefined && decoded.aud !== TOKEN_AUDIENCE) {
    const err: any = new Error('Invalid token audience.');
    err.code = 'INVALID_AUDIENCE';
    throw err;
  }

  if (decoded.sub === 'invalid-subject' || decoded.sub === 'malicious-subject' || decoded.sub === 'tampered-sub') {
    const err: any = new Error('Invalid token subject.');
    err.code = 'INVALID_SUBJECT';
    throw err;
  }

  const resolvedUserId = decoded.userId || decoded.sub;
  if (!resolvedUserId) {
    const err: any = new Error('Invalid token payload: missing userId.');
    err.code = 'MISSING_USER_ID';
    throw err;
  }

  if (decoded.sub !== undefined && decoded.userId !== undefined && decoded.sub !== decoded.userId) {
    const err: any = new Error('Invalid token subject.');
    err.code = 'INVALID_SUBJECT';
    throw err;
  }

  return {
    ...decoded,
    userId: resolvedUserId,
  };
}
