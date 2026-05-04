export interface RateLimiterOptions {
  /** Maximum tokens in the bucket */
  tokensPerInterval: number;
  /** Interval in milliseconds after which tokens refill */
  interval: number;
}

export interface RateLimiter {
  /** Try to consume a token for the given key. Returns true if allowed. */
  consume(key: string): boolean;
  /** Reset all buckets */
  reset(): void;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, { tokens: number; lastRefill: number }>();

  function consume(key: string): boolean {
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = { tokens: options.tokensPerInterval - 1, lastRefill: now };
      buckets.set(key, bucket);
      return true;
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refillCycles = Math.floor(elapsed / options.interval);
    if (refillCycles > 0) {
      bucket.tokens = Math.min(
        options.tokensPerInterval,
        bucket.tokens + refillCycles * options.tokensPerInterval,
      );
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }

    return false;
  }

  function reset(): void {
    buckets.clear();
  }

  return { consume, reset };
}
