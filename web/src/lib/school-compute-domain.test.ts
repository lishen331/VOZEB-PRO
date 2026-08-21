import { describe, expect, it } from "vitest";

import { isProductionGroupStatus, isSchoolComputePoolStatus } from "./school-compute-domain";

describe("school compute domain", () => {
    it("accepts only declared pool and group states", () => {
        expect(isSchoolComputePoolStatus("active")).toBe(true);
        expect(isSchoolComputePoolStatus("pending")).toBe(false);
        expect(isProductionGroupStatus("settling")).toBe(true);
        expect(isProductionGroupStatus("deleted")).toBe(false);
    });
});
