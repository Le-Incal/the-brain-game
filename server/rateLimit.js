/** Fixed-window rate limiter keyed by network address. */

// Twenty, not fewer: schools put a whole class behind one address.
export const TOKEN_RATE_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };

export function createRateLimiter({ max, windowMs, now = Date.now }) {
  const windows = new Map();
  return {
    take(key) {
      const current = now();
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (current >= w.resetAt) windows.delete(k);
      }
      let window = windows.get(key);
      if (!window || current >= window.resetAt) {
        window = { count: 0, resetAt: current + windowMs };
        windows.set(key, window);
      }
      if (window.count >= max) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - current) / 1000)) };
      }
      window.count += 1;
      return { allowed: true };
    },
  };
}
