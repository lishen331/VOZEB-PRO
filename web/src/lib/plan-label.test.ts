import { describe, expect, it } from "vitest";

import { planDisplayName } from "./plan-label";

describe("planDisplayName", () => {
    it("shows the existing free plan to users as the experience tier without changing the stored value", () => {
        expect(planDisplayName("免费版")).toBe("体验版");
        expect(planDisplayName("专业版")).toBe("专业版");
        expect(planDisplayName(undefined)).toBe("体验版");
    });
});
