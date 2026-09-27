import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
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

/**
 * Hashes a plaintext password using Argon2id with a unique CSPRNG salt
 * and server-configurable parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string.');
  }

  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: env.ARGON2_MEMORY_COST,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: env.ARGON2_PARALLELISM,
    hashLength: env.ARGON2_HASH_LENGTH,
  });
}

/**
 * Verifies a candidate password against a stored hash using constant-time verification.
 * Automatically identifies hash algorithm:
 * - If Argon2id: verifies using argon2.verify
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
      const match = await argon2.verify(storedHash, candidatePassword);
      return { valid: match, needsRehash: false };
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
