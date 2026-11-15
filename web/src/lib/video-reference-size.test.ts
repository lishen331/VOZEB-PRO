import { describe, expect, it } from "vitest";
import { fitVideoReferenceForVideo, fitVideoReferenceSize, videoReferenceSizeIssues } from "@/lib/video-reference-size";

describe("fitVideoReferenceSize", () => {
    it("upscales the short side to 300 keeping ratio", () => {
        expect(fitVideoReferenceSize(444, 283)).toEqual({ width: 471, height: 300 });
        expect(fitVideoReferenceSize(499, 280)).toEqual({ width: 535, height: 300 });
    });
    it("downscales the long side to 6000", () => {
        expect(fitVideoReferenceSize(8000, 2000)).toEqual({ width: 6000, height: 1500 });
    });
    it("leaves in-range images alone", () => {
        expect(fitVideoReferenceSize(1824, 1024)).toBeNull();
        expect(fitVideoReferenceSize(undefined, 300)).toBeNull();
    });
    it("rejects ratios wider than 20:1", () => {
        expect(fitVideoReferenceSize(6100, 300)).toBe("impossible");
    });
    it("pads rather than stretches a wide image to ratio 2.5", () => {
        expect(fitVideoReferenceForVideo(900, 300)).toEqual({ width: 900, height: 360 });
    });
    it("pads rather than stretches a tall image to ratio 0.4", () => {
        expect(fitVideoReferenceForVideo(200, 800)).toEqual({ width: 320, height: 800 });
    });
    it("keeps the padded canvas within the upstream maximum size", () => {
        expect(fitVideoReferenceForVideo(90000, 300)).toEqual({ width: 6000, height: 2400 });
        expect(fitVideoReferenceForVideo(300, 90000)).toEqual({ width: 2400, height: 6000 });
    });
    it("numbers issues from 1 like the prompt labels", () => {
        expect(
            videoReferenceSizeIssues([
                { width: 1824, height: 1024 },
                { width: 511, height: 281 },
            ]).map((issue) => issue.index),
        ).toEqual([2]);
    });
});
