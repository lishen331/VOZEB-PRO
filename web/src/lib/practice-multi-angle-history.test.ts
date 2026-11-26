import { describe, expect, it } from "vitest";

import { parseMultiAngleHistoryShot } from "./practice-multi-angle-history";

const shot = { batchId: "d25305d1-852f-460c-bcd6-099281a1df4a", shotIndex: 3, mode: "subject", h: -45, p: 20, d: 4.8, fisheye: false, preset: "left", batch: 4, promptOn: true, prompt: "  保留原文字  " };

describe("multi-angle history snapshot", () => {
    it("round trips exact parameters, retaining the original prompt and fractional distance", () => {
        expect(parseMultiAngleHistoryShot({ ...shot, channelId: "not persisted" })).toEqual(shot);
    });

    it("rejects missing, mismatched or out-of-range metadata", () => {
        expect(parseMultiAngleHistoryShot(null)).toBeNull();
        expect(parseMultiAngleHistoryShot({ ...shot, shotIndex: 4 })).toBeNull();
        expect(parseMultiAngleHistoryShot({ ...shot, mode: "camera" })).toBeNull();
        expect(parseMultiAngleHistoryShot({ ...shot, d: NaN })).toBeNull();
        expect(parseMultiAngleHistoryShot({ ...shot, batchId: "arbitrary" })).toBeNull();
    });
});
