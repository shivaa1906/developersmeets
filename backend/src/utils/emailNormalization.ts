/**
 * Canonical Email Normalization & Validation Utility
 * Enforces uniform email trimming, lowercasing, and RFC-compliant format validation
 * across all authentication providers, registrations, transitions, and database queries.
 */

export class InvalidEmailError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string = 'Invalid email address format.') {
    super(message);
    this.name = 'InvalidEmailError';
    this.statusCode = 400;
    this.code = 'INVALID_EMAIL_FORMAT';
  }
}

// RFC 5322 compatible regex for email format validation
// Matches standard local-part@domain.tld structure without arbitrary spaces or invalid punctuation
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Checks whether an input string represents a syntactically valid email address.
 */
export function isValidEmail(email: any): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) {
    return false;
  }
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Normalizes an email address to its canonical representation:
 * - Trims leading and trailing whitespace
 * - Enforces lowercase casing across entire address
 * - Rejects malformed or invalid email formats with a structured error
 */
export function normalizeEmail(email: any): string {
  if (email === undefined || email === null || typeof email !== 'string') {
    throw new InvalidEmailError('Email is required and must be a string.');
  }

  const trimmed = email.trim();
  if (trimmed.length === 0) {
    throw new InvalidEmailError('Email address cannot be empty.');
  }

  if (trimmed.length > 254) {
    throw new InvalidEmailError('Email address exceeds maximum allowable length of 254 characters.');
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    throw new InvalidEmailError('Invalid email address format.');
  }

  return trimmed.toLowerCase();
}
