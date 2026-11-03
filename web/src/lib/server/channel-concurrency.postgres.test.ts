import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { ensurePostgresSchema, postgresQuery } from "@/lib/server/database";

import { releaseChannelReservations, releaseTerminalTaskReservations, renewChannelReservations, reserveChannelSlot, resetChannelConcurrency } from "./channel-concurrency";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;
const channel = `it-${randomUUID()}`;
const slot = `image:${channel}`;

async function rows() {
    const result = await postgresQuery<{ request_id: string; expires_at: Date }>("SELECT request_id, expires_at FROM channel_concurrency_reservations WHERE channel_id = $1 ORDER BY request_id", [slot]);
    return result.rows;
}

describe("channel concurrency PostgreSQL integration", () => {
    afterEach(async () => {
        resetChannelConcurrency();
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1") await postgresQuery("DELETE FROM channel_concurrency_reservations WHERE channel_id = $1", [slot]);
    });

    postgresIt("enforces the limit, is idempotent per request, and releases in bulk", async () => {
        await ensurePostgresSchema();
        await expect(reserveChannelSlot("image", channel, "m1", "r1", 2)).resolves.toBe(true);
        await expect(reserveChannelSlot("image", channel, "m1", "r1", 2)).resolves.toBe(true);
        await expect(reserveChannelSlot("image", channel, "m1", "r2", 2)).resolves.toBe(true);
        await expect(reserveChannelSlot("image", channel, "m1", "r3", 2)).resolves.toBe(false);
        await expect(reserveChannelSlot("image", channel, "m2", "r4", 1)).resolves.toBe(true);
        expect((await rows()).map((row) => row.request_id)).toEqual(["r1", "r2", "r4"]);

        await releaseChannelReservations(["r1", "r2"]);
        expect((await rows()).map((row) => row.request_id)).toEqual(["r4"]);
        await expect(reserveChannelSlot("image", channel, "m1", "r3", 2)).resolves.toBe(true);
    });

    postgresIt("admits exactly the limit under concurrent reservations across connections", async () => {
        await ensurePostgresSchema();
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => reserveChannelSlot("image", channel, "m1", `c${i}`, 5)));
        expect(results.filter(Boolean)).toHaveLength(5);
        expect(await rows()).toHaveLength(5);
    });

    postgresIt("reclaims expired reservations and does not resurrect them on renewal", async () => {
        await ensurePostgresSchema();
        await expect(reserveChannelSlot("image", channel, "m1", "old", 1, 1)).resolves.toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 20));
        await renewChannelReservations(["old"]);
        resetChannelConcurrency();
        await expect(reserveChannelSlot("image", channel, "m1", "new", 1)).resolves.toBe(true);
        expect((await rows()).map((row) => row.request_id)).toEqual(["new"]);
    });

    postgresIt("extends live reservations on renewal", async () => {
        await ensurePostgresSchema();
        await reserveChannelSlot("image", channel, "m1", "live", 1, 60_000);
        const before = (await rows())[0].expires_at.getTime();
        await renewChannelReservations(["live"], 600_000);
        expect((await rows())[0].expires_at.getTime()).toBeGreaterThan(before + 60_000);
    });

    postgresIt("releases every attempt reservation when a task reaches a terminal status", async () => {
        await ensurePostgresSchema();
        await reserveChannelSlot("image", channel, "m1", "a1", 3);
        await reserveChannelSlot("image", channel, "m1", "a2", 3);
        await releaseTerminalTaskReservations({ status: "running", attempts: [{ reservationId: "a1" }, { reservationId: "a2" }] });
        expect(await rows()).toHaveLength(2);
        await releaseTerminalTaskReservations({ status: "error", attempts: [{ reservationId: "a1" }, { reservationId: "a2" }] });
        expect(await rows()).toHaveLength(0);
    });
});
