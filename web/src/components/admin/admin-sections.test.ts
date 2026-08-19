import { describe, expect, it } from "vitest";

import { adminSectionHref, allowedAdminSections, canAccessAdminSection, parseAdminSection, resolveAdminSection } from "./admin-sections";

describe("admin sections", () => {
    it("parses a valid section and falls back to overview", () => {
        expect(parseAdminSection("channels")).toBe("channels");
        expect(parseAdminSection(["skills", "channels"])).toBe("skills");
        expect(parseAdminSection("missing")).toBe("overview");
    });

    it("keeps unrelated query parameters while updating the current section", () => {
        expect(adminSectionHref("channels", "https://example.com/admin?from=notice#top")).toBe("/admin?from=notice&section=channels#top");
        expect(adminSectionHref("overview", "https://example.com/admin?section=channels&from=notice#top")).toBe("/admin?from=notice#top");
    });

    it("shows only sections allowed by the administrator duties", () => {
        const auditor = { role: "admin", status: "active", adminPermissions: ["audit.read"] };

        expect(canAccessAdminSection(auditor, "backup")).toBe(false);
        expect(allowedAdminSections(auditor)).toEqual(["updates", "adminHelp"]);
        expect(resolveAdminSection(auditor, "backup")).toBe("updates");
    });

    it("limits school operations to the education duty", () => {
        const educator = { role: "admin", status: "active", adminPermissions: ["education.manage"] };
        expect(canAccessAdminSection(educator, "schools")).toBe(true);
        expect(canAccessAdminSection(educator, "courses")).toBe(true);
        expect(canAccessAdminSection(educator, "commercialOrders")).toBe(true);
        expect(allowedAdminSections(educator)).toContain("schools");
        expect(allowedAdminSections(educator)).toContain("courses");
        expect(allowedAdminSections(educator)).toContain("commercialOrders");
        expect(canAccessAdminSection({ ...educator, adminPermissions: ["users.manage"] }, "schools")).toBe(false);
        expect(canAccessAdminSection({ ...educator, adminPermissions: ["users.manage"] }, "courses")).toBe(false);
        expect(canAccessAdminSection({ ...educator, adminPermissions: ["users.manage"] }, "commercialOrders")).toBe(false);
    });

    it("limits role feature overview to system managers", () => {
        const systemAdmin = { role: "admin", status: "active", adminPermissions: ["system.manage"] };
        expect(canAccessAdminSection(systemAdmin, "roleOverview")).toBe(true);
        expect(canAccessAdminSection({ ...systemAdmin, adminPermissions: ["education.manage"] }, "roleOverview")).toBe(false);
        expect(allowedAdminSections(systemAdmin)).toContain("roleOverview");
    });
});
