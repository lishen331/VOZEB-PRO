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
