import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { argon2id as wasmArgon2id } from 'hash-wasm';
import { env } from '../config/environment.js';

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export interface PasswordVerificationResult {
  valid: boolean;
  needsRehash: boolean;
}

/**
 * Validates password input against security constraints:
 * - Minimum length: 8 characters
 * - Maximum length: 128 characters (prevents DoS via enormous strings)
 * - Confirmation matching (when confirmation is provided)
 * - Allows full character range (supports password managers, symbols, unicode, emojis)
 */
export function validatePassword(
  password: unknown,
  confirmPassword?: unknown
): PasswordValidationResult {
  if (typeof password !== 'string' || !password) {
    return { valid: false, error: 'Password is required.' };
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }

  if (password.length > 128) {
    return { valid: false, error: 'Password must not exceed 128 characters.' };
  }

  if (confirmPassword !== undefined) {
    if (typeof confirmPassword !== 'string' || password !== confirmPassword) {
      return { valid: false, error: 'Passwords do not match.' };
    }
  }

  return { valid: true };
}

/**
 * Checks whether a hash string is an Argon2 hash
 */
export function isArgon2Hash(hash: string | null | undefined): boolean {
  if (!hash || typeof hash !== 'string') return false;
  return hash.startsWith('$argon2id$') || hash.startsWith('$argon2i$') || hash.startsWith('$argon2d$');
}

/**
 * Checks whether a hash string is a legacy bcrypt hash ($2a$, $2b$, $2y$)
 */
export function isBcryptHash(hash: string | null | undefined): boolean {
  if (!hash || typeof hash !== 'string') return false;
  return (
    hash.startsWith('$2a$') ||
    hash.startsWith('$2b$') ||
    hash.startsWith('$2y$') ||
    hash.startsWith('$2x$')
  );
}

// Lazy-loaded native argon2 loader with safe fallback
let nativeArgon2: any = null;
let nativeArgon2Attempted = false;

async function getNativeArgon2(): Promise<any> {
  if (nativeArgon2Attempted) return nativeArgon2;
  nativeArgon2Attempted = true;
  try {
    const mod = await import('argon2');
    nativeArgon2 = mod.default || mod;
  } catch {
    // Native argon2 binary blocked by OS Application Control (Windows SmartApp Control) or unavailable
    nativeArgon2 = null;
  }
  return nativeArgon2;
}

/**
 * Hashes a plaintext password using Argon2id with a unique CSPRNG salt
 * and server-configurable parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string.');
  }

  const argon = await getNativeArgon2();
  if (argon) {
    return await argon.hash(password, {
      type: argon.argon2id,
      memoryCost: env.ARGON2_MEMORY_COST,
      timeCost: env.ARGON2_TIME_COST,
      parallelism: env.ARGON2_PARALLELISM,
      hashLength: env.ARGON2_HASH_LENGTH,
    });
  }

  // Pure WebAssembly Argon2id fallback: RFC 9106 compliant, platform-independent, zero native DLL blocking
  const salt = crypto.randomBytes(16);
  return await wasmArgon2id({
    password,
    salt,
    iterations: env.ARGON2_TIME_COST,
    memorySize: env.ARGON2_MEMORY_COST,
    parallelism: env.ARGON2_PARALLELISM,
    hashLength: env.ARGON2_HASH_LENGTH,
    outputType: 'encoded',
  });
}

/**
 * Verifies a candidate password against a stored hash using constant-time verification.
 * Automatically identifies hash algorithm:
 * - If Argon2id: verifies using argon2.verify or wasmArgon2id with timingSafeEqual
 * - If legacy bcrypt ($2a$, $2b$, $2y$): verifies using bcrypt.compare and flags needsRehash = true
 * - If unknown/invalid: safely returns valid = false without throwing or leaking internal info
 */
export async function verifyPassword(
  candidatePassword: unknown,
  storedHash: unknown
): Promise<PasswordVerificationResult> {
  if (
    typeof candidatePassword !== 'string' ||
    !candidatePassword ||
    typeof storedHash !== 'string' ||
    !storedHash
  ) {
    return { valid: false, needsRehash: false };
  }

  try {
    if (isArgon2Hash(storedHash)) {
      const argon = await getNativeArgon2();
      if (argon) {
        const match = await argon.verify(storedHash, candidatePassword);
        return { valid: match, needsRehash: false };
      }

      // Wasm-based constant-time Argon2 verification
      const parts = storedHash.split('$');
      if (parts.length >= 6) {
        const params = parts[3].split(',').reduce((acc: any, p: string) => {
          const [k, v] = p.split('=');
          acc[k] = parseInt(v, 10);
          return acc;
        }, {});
        const salt = Buffer.from(parts[4], 'base64');
        const expectedHashBuf = Buffer.from(parts[5], 'base64');
        const computed = await wasmArgon2id({
          password: candidatePassword,
          salt,
          iterations: params.t,
          memorySize: params.m,
          parallelism: params.p,
          hashLength: expectedHashBuf.length,
          outputType: 'encoded',
        });
        const computedParts = computed.split('$');
        const computedHashBuf = Buffer.from(computedParts[5], 'base64');
        const match =
          expectedHashBuf.length === computedHashBuf.length &&
          crypto.timingSafeEqual(expectedHashBuf, computedHashBuf);
        return { valid: match, needsRehash: false };
      }
      return { valid: false, needsRehash: false };
    }

    if (isBcryptHash(storedHash)) {
      const match = await bcrypt.compare(candidatePassword, storedHash);
      return { valid: match, needsRehash: match };
    }

    // Unrecognized or invalid hash format (e.g. mock test tokens)
    return { valid: false, needsRehash: false };
  } catch (_error) {
    // Constant-time failure handling: never leak cryptographic exception details
    return { valid: false, needsRehash: false };
  }
}
