import crypto from 'crypto';

/**
 * Base62 character alphabet: Exactly [A-Za-z0-9]
 * 26 uppercase + 26 lowercase + 10 digits = 62 characters.
 */
const BASE62_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CHARS_LEN = BASE62_CHARS.length; // 62
// Rejection sampling ceiling: 62 * 4 = 248. Bytes >= 248 are discarded to guarantee 0 modulo bias.
const REJECTION_LIMIT = 248;

/**
 * Generates an immutable, cryptographically secure 16-character public UID.
 *
 * Properties:
 * - Length: Exactly 16 characters
 * - Alphabet: [A-Za-z0-9] (Base62)
 * - Cryptographic entropy: 62^16 = ~4.767 x 10^28 combinations
 * - Unbiased: Perfect uniform distribution via rejection sampling
 *
 * Example: 'A7kP92xLmQ4vT8Nz'
 */
export function generateUserUid(): string {
  let uid = '';
  // Generate random bytes in batches
  while (uid.length < 16) {
    const bytes = crypto.randomBytes(32);
    for (let i = 0; i < bytes.length && uid.length < 16; i++) {
      const b = bytes[i];
      if (b < REJECTION_LIMIT) {
        uid += BASE62_CHARS[b % CHARS_LEN];
      }
    }
  }
  return uid;
}

/**
 * Validates whether a candidate string conforms to the 16-character Base62 UID specification.
 */
export function isValidUserUid(candidate: string | null | undefined): boolean {
  if (!candidate || typeof candidate !== 'string') {
    return false;
  }
  return /^[A-Za-z0-9]{16}$/.test(candidate);
}
