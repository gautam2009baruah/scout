type Counter = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export class InMemoryRateLimiter {
  private readonly counters = new Map<string, Counter>();

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number
  ) {}

  check(key: string): RateLimitResult {
    const now = Date.now();
    const found = this.counters.get(key);

    if (!found || now >= found.resetAt) {
      const resetAt = now + this.windowMs;
      this.counters.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: Math.max(0, this.maxRequests - 1),
        resetAt
      };
    }

    if (found.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: found.resetAt
      };
    }

    found.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - found.count),
      resetAt: found.resetAt
    };
  }
}
