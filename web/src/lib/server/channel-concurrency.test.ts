import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { channelHasCapacity, channelInFlight, releaseChannelReservations, releaseTerminalTaskReservations, renewChannelReservations, reserveChannelSlot, resetChannelConcurrency } from "./channel-concurrency";

beforeEach(() => {
    vi.stubEnv("VOZEB_PRO_DATABASE_PROVIDER", "file");
    resetChannelConcurrency();
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe("channel concurrency", () => {
    it("never limits a channel without a configured limit", async () => {
        for (let i = 0; i < 50; i += 1) expect(await reserveChannelSlot("image", "c1", "m1", `r${i}`)).toBe(true);
        expect(channelInFlight("image", "c1", "m1")).toBe(0);
        expect(channelHasCapacity("image", "c1", "m1", 0)).toBe(true);
    });

    it("rejects the request after the limit is reached", async () => {
        expect(await reserveChannelSlot("image", "c1", "m1", "a", 2)).toBe(true);
        expect(await reserveChannelSlot("image", "c1", "m1", "b", 2)).toBe(true);
        expect(await reserveChannelSlot("image", "c1", "m1", "c", 2)).toBe(false);
        expect(channelInFlight("image", "c1", "m1")).toBe(2);
        expect(channelHasCapacity("image", "c1", "m1", 2)).toBe(false);
    });

    it("counts one user holding several slots the same as several users", async () => {
        expect(await reserveChannelSlot("text", "c1", "m1", "user-a#1", 2)).toBe(true);
        expect(await reserveChannelSlot("text", "c1", "m1", "user-a#2", 2)).toBe(true);
        expect(await reserveChannelSlot("text", "c1", "m1", "user-b#1", 2)).toBe(false);
    });

    it("is idempotent for the same request id", async () => {
        expect(await reserveChannelSlot("image", "c1", "m1", "a", 1)).toBe(true);
        expect(await reserveChannelSlot("image", "c1", "m1", "a", 1)).toBe(true);
        expect(channelInFlight("image", "c1", "m1")).toBe(1);
    });

    it("keeps capability, channel and upstream model independent", async () => {
        expect(await reserveChannelSlot("video", "c1", "veo", "a", 1)).toBe(true);
        expect(channelHasCapacity("image", "c1", "veo", 1)).toBe(true);
        expect(channelHasCapacity("video", "c1", "other", 1)).toBe(true);
        expect(channelHasCapacity("video", "c2", "veo", 1)).toBe(true);
        expect(channelHasCapacity("video", "c1", "veo", 1)).toBe(false);
    });

    it("frees the slot on release and tolerates double release", async () => {
        await reserveChannelSlot("image", "c1", "m1", "a", 1);
        await releaseChannelReservations(["a"]);
        await releaseChannelReservations(["a"]);
        expect(channelInFlight("image", "c1", "m1")).toBe(0);
        expect(await reserveChannelSlot("image", "c1", "m1", "b", 1)).toBe(true);
    });

    it("expires stale reservations and lets renewal keep live ones", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        await reserveChannelSlot("video", "c1", "m1", "kept", 2, 1000);
        await reserveChannelSlot("video", "c1", "m1", "dropped", 2, 1000);
        vi.setSystemTime(900);
        await renewChannelReservations(["kept"], 1000);
        vi.setSystemTime(1500);
        expect(channelInFlight("video", "c1", "m1")).toBe(1);
        await renewChannelReservations(["dropped"], 1000);
        expect(channelInFlight("video", "c1", "m1")).toBe(1);
    });

    it("releases every attempt reservation once a task is terminal", async () => {
        await reserveChannelSlot("image", "c1", "m1", "image:t1#1", 5);
        await reserveChannelSlot("image", "c2", "m1", "image:t1#2", 5);
        await releaseTerminalTaskReservations({ status: "running", attempts: [{ reservationId: "image:t1#1" }, { reservationId: "image:t1#2" }] });
        expect(channelInFlight("image", "c1", "m1")).toBe(1);
        await releaseTerminalTaskReservations({ status: "cancelled", attempts: [{ reservationId: "image:t1#1" }, { reservationId: "image:t1#2" }] });
        expect(channelInFlight("image", "c1", "m1")).toBe(0);
        expect(channelInFlight("image", "c2", "m1")).toBe(0);
    });
});
