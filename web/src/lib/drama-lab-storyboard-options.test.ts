import { describe, expect, it } from "vitest";
import { normalizeDramaLabStoryboardOptions, dramaLabStoryboardConstraintText } from "./drama-lab-storyboard-options";
describe("production storyboard count and duration", () => {
    it("leaves empty inputs to the model without inventing defaults", () => {
        expect(normalizeDramaLabStoryboardOptions({ shotCount: "", totalDuration: null })).toEqual({});
        expect(dramaLabStoryboardConstraintText({})).toBe("");
    });
    it("retains a whole shot count and fractional duration", () => {
        const options = normalizeDramaLabStoryboardOptions({ shotCount: "12", totalDuration: "90.5" });
        expect(options).toEqual({ shotCount: 12, totalDuration: 90.5 });
        expect(dramaLabStoryboardConstraintText(options)).toContain("12");
        expect(dramaLabStoryboardConstraintText(options)).toContain("90.5");
        expect(dramaLabStoryboardConstraintText(options)).toContain("±20%");
        expect(dramaLabStoryboardConstraintText(options)).toContain("±10%");
    });
    it.each([{ shotCount: -1 }, { shotCount: 1.5 }, { totalDuration: 0 }, { totalDuration: "Infinity" }, { shotCount: true }, { totalDuration: [] }])("rejects invalid values: %j", (options) => {
        expect(() => normalizeDramaLabStoryboardOptions(options)).toThrow();
    });
});

describe("storyboard modes", () => {
    it("keeps explicit mode and narration intent", () => {
        expect(normalizeDramaLabStoryboardOptions({ creationMode: "universal", generateNarration: true })).toEqual({ creationMode: "universal", generateNarration: true });
        expect(normalizeDramaLabStoryboardOptions({ creationMode: "classic", generateNarration: false })).toEqual({ creationMode: "classic", generateNarration: false });
    });
    it.each([{ creationMode: "other" }, { generateNarration: "false" }, { generateNarration: 1 }])("rejects ambiguous values: %j", (value) => {
        expect(() => normalizeDramaLabStoryboardOptions(value)).toThrow();
    });
});

 describe("image-stage options are not extraction constraints", () => {
    it.each(["single", "quad_grid", "nine_grid", "first_last"])("does not persist or inject image mode %s into script extraction", (sequenceMode) => {
        const options = normalizeDramaLabStoryboardOptions({ sequenceMode, storyboardFrameMode: "first_last", shotCount: "12" });
        expect(options).toEqual({ shotCount: 12 });
        expect(dramaLabStoryboardConstraintText(options)).not.toContain("序列图");
        expect(dramaLabStoryboardConstraintText({})).toBe("");
    });
    it("does not introduce L UI maxima or discard valid small fractional durations", () => {
        expect(normalizeDramaLabStoryboardOptions({ shotCount: "201", totalDuration: "600.5" })).toEqual({ shotCount: 201, totalDuration: 600.5 });
        expect(normalizeDramaLabStoryboardOptions({ totalDuration: "0.5" })).toEqual({ totalDuration: 0.5 });
    });
});