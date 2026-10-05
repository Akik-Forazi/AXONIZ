/**
 * Local rate limiting using an in-memory store. No Redis or external services required.
 * Port of axoniz/core/rate_limit.py (sliding-window log, single-threaded JS event loop).
 */

export class RateLimiter {
  protected readonly buckets = new Map<string, number[]>();

  /**
   * Check whether a request is allowed under the rate limit.
   * Records the request when allowed, mirroring the Python implementation.
   */
  isAllowed(key: string, maxRequests = 100, windowSeconds = 60): boolean {
    const now = Date.now() / 1000;
    const cutoff = now - windowSeconds;

    let requests = this.buckets.get(key);
    if (!requests) {
      requests = [];
      this.buckets.set(key, requests);
    }

    // Drop entries outside the window (oldest first, so shift from the front).
    let drop = 0;
    while (drop < requests.length && requests[drop] < cutoff) drop++;
    if (drop > 0) requests.splice(0, drop);

    if (requests.length < maxRequests) {
      requests.push(now);
      return true;
    }
    return false;
  }

  /** Remaining requests for a key within the current window. */
  getRemaining(key: string, maxRequests = 100, windowSeconds = 60): number {
    const now = Date.now() / 1000;
    const cutoff = now - windowSeconds;
    const requests = this.buckets.get(key) ?? [];
    const current = requests.filter((t) => t > cutoff).length;
    return Math.max(0, maxRequests - current);
  }

  /** Seconds until the oldest request in the window expires (0 when not limited). */
  getRetryAfter(key: string, windowSeconds = 60): number {
    const requests = this.buckets.get(key) ?? [];
    if (requests.length === 0) return 0;
    const elapsed = Date.now() / 1000 - requests[0];
    return Math.max(0, Math.ceil(windowSeconds - elapsed));
  }

  /** Reset rate limit for a key. */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Number of tracked keys (useful for metrics/tests). */
  size(): number {
    return this.buckets.size;
  }
}

/* Global rate limiter instance */
const limiter = new RateLimiter();

/** Get the global rate limiter instance. */
export function getRateLimiter(): RateLimiter {
  return limiter;
}
