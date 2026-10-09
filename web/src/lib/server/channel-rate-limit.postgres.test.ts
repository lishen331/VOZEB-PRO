import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { ensurePostgresSchema, postgresQuery } from "@/lib/server/database";

import { takeChannelRateToken } from "./channel-rate-limit";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;
const channel = `it-${randomUUID()}`;

describe("channel rate limit PostgreSQL integration", () => {
    afterEach(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1") await postgresQuery("DELETE FROM channel_rate_limits WHERE channel_id = $1", [`image:${channel}`]);
    });

    postgresIt("admits exactly the burst under concurrent requests across connections", async () => {
        await ensurePostgresSchema();
        const results = await Promise.all(Array.from({ length: 30 }, () => takeChannelRateToken("image", channel, "m1", { requestsPerMinute: 1, burst: 10 })));
        expect(results.filter(Boolean)).toHaveLength(10);
        await expect(takeChannelRateToken("image", channel, "m2", { requestsPerMinute: 1, burst: 10 })).resolves.toBe(true);
    });
});
