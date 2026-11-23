// Best-effort per-IP lockout for failed /admin passwords.
//
// Vercel serverless instances do not share memory, so this only holds inside
// one isolate. A cold start, or the same attacker hitting another instance,
// starts a fresh count. There is no free shared store on the Hobby plan, so
// this is the in-app limit. A Vercel Firewall rate-limit rule (one is included
// on Hobby) is the follow-up that holds across instances; it has to be turned
// on in the dashboard, which this change does not do.

export const FAIL_LIMIT = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const FAIL_WINDOW_MS = 15 * 60 * 1000;

type Bucket = { failures: number[]; lockedUntil: number };

const buckets = new Map<string, Bucket>();

export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const vercel = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercel) return vercel.split(",")[0].trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return "unknown";
}

export function resetAdminLockout(): void {
  buckets.clear();
}

function prune(now: number): void {
  for (const [ip, b] of buckets) {
    if (b.lockedUntil <= now && b.failures.every((t) => t <= now - FAIL_WINDOW_MS)) {
      buckets.delete(ip);
    }
  }
}

export function isAdminLocked(ip: string, now = Date.now()): boolean {
  prune(now);
  const b = buckets.get(ip);
  return !!b && b.lockedUntil > now;
}

export function recordAdminFailure(ip: string, now = Date.now()): void {
  prune(now);
  const b = buckets.get(ip) ?? { failures: [], lockedUntil: 0 };
  if (b.lockedUntil > now) {
    buckets.set(ip, b);
    return;
  }
  b.failures = b.failures.filter((t) => t > now - FAIL_WINDOW_MS);
  b.failures.push(now);
  if (b.failures.length >= FAIL_LIMIT) {
    b.lockedUntil = now + LOCK_MS;
    b.failures = [];
  }
  buckets.set(ip, b);
}

export function clearAdminFailures(ip: string): void {
  buckets.delete(ip);
}
