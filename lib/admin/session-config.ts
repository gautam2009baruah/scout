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
