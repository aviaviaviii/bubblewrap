import { describe, it, expect, beforeEach } from "vitest";
import {
  FAIL_LIMIT,
  FAIL_WINDOW_MS,
  LOCK_MS,
  clearAdminFailures,
  clientIp,
  isAdminLocked,
  recordAdminFailure,
  resetAdminLockout,
} from "../../src/lib/admin-lockout";

beforeEach(() => resetAdminLockout());

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/gift", { method: "POST", headers });

describe("clientIp", () => {
  it("prefers x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2", "x-vercel-forwarded-for": "3.3.3.3" }))).toBe("1.1.1.1");
  });

  it("then uses x-vercel-forwarded-for, then the first x-forwarded-for hop", () => {
    expect(clientIp(req({ "x-vercel-forwarded-for": "3.3.3.3, 9.9.9.9" }))).toBe("3.3.3.3");
    expect(clientIp(req({ "x-forwarded-for": " 4.4.4.4, 8.8.8.8 " }))).toBe("4.4.4.4");
  });

  it("falls back to unknown when no IP header is present", () => {
    expect(clientIp(req())).toBe("unknown");
  });
});

describe("lockout", () => {
  const now = 1_700_000_000_000;

  it("is unlocked until FAIL_LIMIT failures in the window", () => {
    for (let i = 0; i < FAIL_LIMIT - 1; i++) recordAdminFailure("10.0.0.1", now + i);
    expect(isAdminLocked("10.0.0.1", now + FAIL_LIMIT)).toBe(false);
    recordAdminFailure("10.0.0.1", now + FAIL_LIMIT);
    expect(isAdminLocked("10.0.0.1", now + FAIL_LIMIT + 1)).toBe(true);
  });

  it("keeps other IPs unlocked", () => {
    for (let i = 0; i < FAIL_LIMIT; i++) recordAdminFailure("10.0.0.1", now + i);
    expect(isAdminLocked("10.0.0.2", now + FAIL_LIMIT)).toBe(false);
  });

  it("clears the count on a successful sign-in", () => {
    for (let i = 0; i < FAIL_LIMIT - 1; i++) recordAdminFailure("10.0.0.1", now + i);
    clearAdminFailures("10.0.0.1");
    recordAdminFailure("10.0.0.1", now + FAIL_LIMIT);
    expect(isAdminLocked("10.0.0.1", now + FAIL_LIMIT + 1)).toBe(false);
  });

  it("expires when the lock window has passed", () => {
    for (let i = 0; i < FAIL_LIMIT; i++) recordAdminFailure("10.0.0.1", now);
    expect(isAdminLocked("10.0.0.1", now + LOCK_MS - 1)).toBe(true);
    expect(isAdminLocked("10.0.0.1", now + LOCK_MS)).toBe(false);
  });

  it("ignores failures older than the window when counting toward a lock", () => {
    recordAdminFailure("10.0.0.1", now);
    for (let i = 0; i < FAIL_LIMIT - 1; i++) recordAdminFailure("10.0.0.1", now + FAIL_WINDOW_MS + 1 + i);
    expect(isAdminLocked("10.0.0.1", now + FAIL_WINDOW_MS + FAIL_LIMIT)).toBe(false);
  });

  it("drops stale buckets so the map does not grow forever", () => {
    recordAdminFailure("10.0.0.9", now);
    expect(isAdminLocked("10.0.0.9", now + FAIL_WINDOW_MS + 1)).toBe(false);
    // The stale bucket is pruned on the next check; a fresh IP is also unlocked.
    expect(isAdminLocked("10.0.0.8", now + FAIL_WINDOW_MS + 1)).toBe(false);
  });

  it("leaves an already locked IP locked if another failure is recorded", () => {
    for (let i = 0; i < FAIL_LIMIT; i++) recordAdminFailure("10.0.0.1", now + i);
    recordAdminFailure("10.0.0.1", now + FAIL_LIMIT + 1);
    expect(isAdminLocked("10.0.0.1", now + FAIL_LIMIT + 2)).toBe(true);
  });
});
