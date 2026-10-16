import crypto from "node:crypto";

interface AttemptRecord {
  count: number;
  lockedUntil: number;
  lastAttempt: number;
}

// In-memory brute-force protection tracking failed passcode attempts per client IP
const failedAttempts = new Map<string, AttemptRecord>();
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const WINDOW_DURATION_MS = 15 * 60 * 1000; // 15 minutes window

export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function registerFailedAttempt(clientIp: string, now: number = Date.now()): void {
  const existing = failedAttempts.get(clientIp) || {
    count: 0,
    lockedUntil: 0,
    lastAttempt: now,
  };
  existing.count += 1;
  existing.lastAttempt = now;
  if (existing.count >= MAX_FAILED_ATTEMPTS) {
    existing.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
  failedAttempts.set(clientIp, existing);
}

export function resetFailedAttempts(clientIp?: string): void {
  if (clientIp) {
    failedAttempts.delete(clientIp);
  } else {
    failedAttempts.clear();
  }
}

/**
 * Strict passcode verification.
 * - UPLOAD_SECRET is mandatory on the server.
 * - Missing or incorrect secrets are rejected.
 * - Rate limits failed attempts to prevent brute-force attacks.
 */
export function verifyPasscode(
  clientIp: string,
  providedSecret?: string
): { success: boolean; status: number; error?: string } {
  const configuredSecret = process.env.UPLOAD_SECRET?.trim();

  // 1. Mandatory server-side UPLOAD_SECRET configuration
  if (!configuredSecret) {
    return {
      success: false,
      status: 503,
      error:
        "Upload passcode (UPLOAD_SECRET) is not configured on the server. Uploads and deletions are disabled until UPLOAD_SECRET is set in server environment variables.",
    };
  }

  const now = Date.now();

  // 2. Check for active lockout
  const record = failedAttempts.get(clientIp);
  if (record) {
    if (record.lockedUntil > now) {
      const minutesRemaining = Math.ceil((record.lockedUntil - now) / 60000);
      return {
        success: false,
        status: 429,
        error: `Too many failed passcode attempts. Temporarily locked out for security. Please try again in ${minutesRemaining} minute(s).`,
      };
    }
    // Expire old attempt window
    if (now - record.lastAttempt > WINDOW_DURATION_MS) {
      failedAttempts.delete(clientIp);
    }
  }

  // 3. Reject missing secret
  if (!providedSecret || !providedSecret.trim()) {
    registerFailedAttempt(clientIp, now);
    return {
      success: false,
      status: 401,
      error: "Unauthorized: Missing upload passcode. Please provide the upload passcode.",
    };
  }

  // 4. Timing-safe comparison to prevent timing attacks
  const isMatch = timingSafeEqualStr(providedSecret.trim(), configuredSecret);

  if (!isMatch) {
    registerFailedAttempt(clientIp, now);
    return {
      success: false,
      status: 401,
      error: "Unauthorized: Incorrect upload passcode.",
    };
  }

  // 5. Success: clear failure history for this IP
  failedAttempts.delete(clientIp);
  return { success: true, status: 200 };
}
