import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

interface FailedAttemptRecord {
  attempts: number;
  lockedUntil?: number;
}

// In-memory sliding window caches (IP-keyed)
const generalLimitCache = new Map<string, RateLimitRecord>();
const authLimitCache = new Map<string, RateLimitRecord>();
const failedLoginAttempts = new Map<string, FailedAttemptRecord>();

// Clean up expired records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of generalLimitCache.entries()) {
    if (record.resetAt <= now) generalLimitCache.delete(key);
  }
  for (const [key, record] of authLimitCache.entries()) {
    if (record.resetAt <= now) authLimitCache.delete(key);
  }
  for (const [key, record] of failedLoginAttempts.entries()) {
    if (record.lockedUntil && record.lockedUntil <= now) failedLoginAttempts.delete(key);
  }
}, 5 * 60 * 1000).unref();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * General API Rate Limiter
 * Defaults to 500 requests per 15 minutes per IP
 */
export function apiRateLimiter(
  maxRequests = 500,
  windowMs = 15 * 60 * 1000
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Exclude health check and tests if desired
    if (req.path === '/api/health') {
      next();
      return;
    }

    const ip = getClientIp(req);
    const now = Date.now();
    let record = generalLimitCache.get(ip);

    if (!record || record.resetAt <= now) {
      record = { count: 1, resetAt: now + windowMs };
      generalLimitCache.set(ip, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please slow down and try again later.',
        retryAfter: resetSeconds,
      });
      return;
    }

    next();
  };
}

/**
 * Strict Auth Rate Limiter
 * Defaults to 25 requests per 15 minutes per IP
 */
export function authRateLimiter(
  maxRequests = 25,
  windowMs = 15 * 60 * 1000
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const now = Date.now();
    let record = authLimitCache.get(ip);

    if (!record || record.resetAt <= now) {
      record = { count: 1, resetAt: now + windowMs };
      authLimitCache.set(ip, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > maxRequests) {
      res.status(429).json({
        error: 'Too many authentication attempts. Please try again later.',
        retryAfter: resetSeconds,
      });
      return;
    }

    next();
  };
}

/**
 * Brute-force protection tracker
 */
export class BruteForceProtection {
  private static MAX_FAILED_ATTEMPTS = 5;
  private static LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  static isLocked(key: string): { locked: boolean; remainingSeconds?: number } {
    const record = failedLoginAttempts.get(key);
    if (!record || !record.lockedUntil) {
      return { locked: false };
    }

    const now = Date.now();
    if (record.lockedUntil > now) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return { locked: true, remainingSeconds };
    }

    // Lockout expired
    failedLoginAttempts.delete(key);
    return { locked: false };
  }

  static recordFailedAttempt(key: string): { locked: boolean; remainingAttempts: number } {
    const record = failedLoginAttempts.get(key) || { attempts: 0 };
    record.attempts++;

    if (record.attempts >= this.MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = Date.now() + this.LOCKOUT_DURATION_MS;
      failedLoginAttempts.set(key, record);
      return { locked: true, remainingAttempts: 0 };
    }

    failedLoginAttempts.set(key, record);
    return {
      locked: false,
      remainingAttempts: this.MAX_FAILED_ATTEMPTS - record.attempts,
    };
  }

  static clear(key: string): void {
    failedLoginAttempts.delete(key);
  }

  // Testing helper
  static resetAll(): void {
    generalLimitCache.clear();
    authLimitCache.clear();
    failedLoginAttempts.clear();
  }
}
