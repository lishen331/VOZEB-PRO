import { describe, expect, it } from "vitest";
import { fitVideoReferenceSize, videoReferenceSizeIssues } from "@/lib/video-reference-size";

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
    it("numbers issues from 1 like the prompt labels", () => {
        expect(
            videoReferenceSizeIssues([
                { width: 1824, height: 1024 },
                { width: 511, height: 281 },
            ]).map((issue) => issue.index),
        ).toEqual([2]);
    });
});
