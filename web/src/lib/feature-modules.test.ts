import { describe, expect, it } from "vitest";

import type { SchoolContext } from "@/lib/school-domain";

import { DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS, FEATURE_MODULE_IDS, featureModuleForPathname, isUserNavigationPathAllowed, normalizeFeatureModuleSettings } from "./feature-modules";

describe("feature module registry", () => {
    it("keeps every built-in module enabled when no stored configuration exists", () => {
        const settings = normalizeFeatureModuleSettings(undefined);
        expect(FEATURE_MODULE_IDS.every((id) => settings[id])).toBe(true);
    });

    it("only accepts known module switches and defaults omitted entries to enabled", () => {
        expect(normalizeFeatureModuleSettings({ canvas: false, unknown: false })).toMatchObject({ canvas: false, drama: true });
    });

    it("resolves protected page roots to their module", () => {
        expect(featureModuleForPathname("/drama-lab/project-1/outline")).toBe("drama-lab");
        expect(featureModuleForPathname("/profile")).toBeUndefined();
    });

    it("makes teaching and learning centers configurable menus with matching school identities", () => {
        const settings = normalizeFeatureModuleSettings(undefined);
        expect(DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS).toEqual(expect.arrayContaining(["teaching", "learning"]));
        expect(isUserNavigationPathAllowed("/teaching", ["teaching"], settings, schoolContext("teacher"))).toBe(true);
        expect(isUserNavigationPathAllowed("/learning", ["learning"], settings, schoolContext("student"))).toBe(true);
        expect(isUserNavigationPathAllowed("/teaching", ["teaching"], settings, schoolContext("student"))).toBe(false);
        expect(isUserNavigationPathAllowed("/learning", [], settings, schoolContext("student"))).toBe(false);
    });
});

function schoolContext(role: "teacher" | "student"): SchoolContext {
    return {
        school: { id: "school-a", name: "甲学校", status: "active" },
        membership: { id: "member-a", role, permissions: [], status: "active" },
        canManageSchool: false,
    };
}
