import { describe, expect, it } from "vitest";

import { adminSectionGroups } from "./admin-section-nav";

describe("admin navigation order", () => {
    it("keeps drama management and school compute in their business groups", () => {
        const groups = adminSectionGroups.map((group) => group.items.map((item) => item.key));
        expect(groups).toEqual(expect.arrayContaining([expect.arrayContaining(["generationOperations", "dramaProjects"]), expect.arrayContaining(["schools", "schoolCompute"])]));
    });

    it("places role features in system management", () => {
        expect(adminSectionGroups.some((group) => group.items.some((item) => item.key === "roleOverview"))).toBe(true);
    });
});
