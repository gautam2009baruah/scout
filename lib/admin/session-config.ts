const DEFAULT_ADMIN_SESSION_TIMEOUT_MINUTES = 15;

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Server-side session configuration.
 *
 * Set ADMIN_SESSION_TIMEOUT_MINUTES in the runtime environment to override the
 * default. A missing or invalid value safely falls back to 15 minutes.
 */
export const ADMIN_SESSION_MINUTES = readPositiveInteger(
  process.env.ADMIN_SESSION_TIMEOUT_MINUTES,
  DEFAULT_ADMIN_SESSION_TIMEOUT_MINUTES,
);

/**
 * Whether the admin session cookie should be marked Secure (HTTPS-only).
 *
 * Defaults to true in production (the safe default — browsers silently
 * refuse to store/send Secure cookies over plain HTTP, so this must stay
 * true for any real deployment). Set ALLOW_INSECURE_ADMIN_COOKIES=true to
 * explicitly opt out, e.g. while bringing up a fresh deployment on a bare
 * IP before a domain/HTTPS is configured. Remove that env var once HTTPS is
 * in place — this is a deliberate temporary escape hatch, not a permanent
 * production setting.
 */
export const ADMIN_SESSION_COOKIE_SECURE =
  process.env.NODE_ENV === "production" &&
  process.env.ALLOW_INSECURE_ADMIN_COOKIES !== "true";
