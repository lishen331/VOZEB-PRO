import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetChannelRateLimits, takeChannelRateToken } from "./channel-rate-limit";

const limit = { requestsPerMinute: 600, burst: 3 };

beforeEach(() => {
    vi.stubEnv("VOZEB_PRO_DATABASE_PROVIDER", "file");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
    resetChannelRateLimits();
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe("channel rate limit", () => {
    it("allows the burst, then rejects until tokens refill", async () => {
        for (let i = 0; i < 3; i += 1) await expect(takeChannelRateToken("image", "c1", "m1", limit)).resolves.toBe(true);
        await expect(takeChannelRateToken("image", "c1", "m1", limit)).resolves.toBe(false);

        vi.advanceTimersByTime(100);
        await expect(takeChannelRateToken("image", "c1", "m1", limit)).resolves.toBe(true);
        await expect(takeChannelRateToken("image", "c1", "m1", limit)).resolves.toBe(false);
    });

    it("never refills above the burst", async () => {
        vi.advanceTimersByTime(60_000);
        for (let i = 0; i < 3; i += 1) await expect(takeChannelRateToken("image", "c1", "m1", limit)).resolves.toBe(true);
        await expect(takeChannelRateToken("image", "c1", "m1", limit)).resolves.toBe(false);
    });

    it("keeps channels and upstream models independent", async () => {
        const one = { requestsPerMinute: 60, burst: 1 };
        await expect(takeChannelRateToken("image", "c1", "m1", one)).resolves.toBe(true);
        await expect(takeChannelRateToken("image", "c1", "m1", one)).resolves.toBe(false);
        await expect(takeChannelRateToken("image", "c1", "m2", one)).resolves.toBe(true);
        await expect(takeChannelRateToken("image", "c2", "m1", one)).resolves.toBe(true);
        await expect(takeChannelRateToken("video", "c1", "m1", one)).resolves.toBe(true);
    });
});
