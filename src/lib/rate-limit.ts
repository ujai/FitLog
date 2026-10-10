/**
 * In-memory sliding-window rate limiter. Fine for this app's single-node
 * deployment (systemd service) — on serverless it would be per-instance,
 * which is acceptable at this scale. Keys are authenticated user ids, so the
 * bucket map stays bounded.
 */
const buckets = new Map<string, number[]>();

/** Returns true when the call is allowed. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
