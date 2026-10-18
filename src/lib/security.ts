import crypto from "node:crypto";

// Rate limiting in-memory store
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipRateLimits = new Map<string, RateLimitEntry>();
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute

/**
 * Check if a client IP has exceeded the allowed request quota.
 */
export function checkRateLimit(
  ip: string,
  maxRequests: number = MAX_REQUESTS_PER_WINDOW,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): boolean {
  const now = Date.now();
  const entry = ipRateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    ipRateLimits.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

/**
 * Reset rate limits (useful for unit tests or IP unbanning).
 */
export function resetRateLimits(ip?: string): void {
  if (ip) {
    ipRateLimits.delete(ip);
  } else {
    ipRateLimits.clear();
  }
}

/**
 * Validate file paths to prevent directory traversal or null-byte attacks.
 */
export function isSafePath(filePath: string): boolean {
  if (!filePath || typeof filePath !== "string") return false;
  if (filePath.includes("..") || filePath.includes("\0")) return false;
  if (filePath.startsWith("/") || filePath.startsWith("\\")) return false;
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.length > 0 && !normalized.startsWith("/");
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
