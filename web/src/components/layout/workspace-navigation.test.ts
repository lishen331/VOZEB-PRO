import { describe, expect, it } from "vitest";

import { DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS, normalizeFeatureModuleSettings, type UserNavigationMenuPermission } from "@/lib/feature-modules";
import type { SchoolContext } from "@/lib/school-domain";
import { isHelpCenterVisible, workspaceNavActiveKey, workspaceNavItems } from "./workspace-navigation";

const ALL_MODULES = normalizeFeatureModuleSettings({});

function context(role: "teacher" | "student", canManageSchool: boolean): SchoolContext {
    return {
        school: { id: "school-a", name: "甲学校", status: "active" },
        membership: { id: "membership-a", role, permissions: canManageSchool ? ["school.manage"] : [], status: "active" },
        canManageSchool,
    };
}

const keys = (options: Parameters<typeof workspaceNavItems>[0]) => workspaceNavItems(options).map((item) => item.key);

describe("workspaceNavItems", () => {
    it("shows every creator entry for a normal user, grouped like the home sidebar", () => {
        const items = workspaceNavItems({ featureModules: ALL_MODULES, menuPermissions: DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS });
        expect(items.map((item) => item.key)).toEqual(["home", "create", "drama", "canvas", "drama-lab", "one-click-film", "works", "assets", "my-prompts", "prompts", "ip-library", "me"]);
        expect(items[0]).toMatchObject({ key: "home", href: "/", group: "create" });
        // 作品广场（/gallery、/community）不进侧栏
        expect(items.some((item) => item.key === "gallery" || item.key === "community")).toBe(false);
        // 普通用户看不到学校入口
        expect(items.some((item) => item.group === "school")).toBe(false);
    });

    it("hides modules switched off in the admin feature settings", () => {
        const modules = normalizeFeatureModuleSettings({ canvas: false, "drama-lab": false, "one-click-film": false, "ip-library": false });
        const result = keys({ featureModules: modules, menuPermissions: DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS });
        expect(result).not.toContain("canvas");
        expect(result).not.toContain("drama-lab");
        expect(result).not.toContain("one-click-film");
        expect(result).not.toContain("ip-library");
        expect(result).toContain("create");
    });

    it("respects the role menu permissions", () => {
        const menuPermissions: UserNavigationMenuPermission[] = ["creative-agent", "assets", "community"];
        expect(keys({ featureModules: ALL_MODULES, menuPermissions })).toEqual(["home", "create", "assets"]);
    });

    it("keeps only home when every module is off", () => {
        const modules = normalizeFeatureModuleSettings(Object.fromEntries(Object.keys(ALL_MODULES).map((id) => [id, false])));
        expect(keys({ featureModules: modules, menuPermissions: DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS })).toEqual(["home"]);
    });

    it("separates the student's school entry from 无限练习 with its own group", () => {
        const items = workspaceNavItems({ schoolContext: context("student", false), featureModules: ALL_MODULES, menuPermissions: DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS });
        expect(items.slice(0, 3).map((item) => [item.key, item.group])).toEqual([
            ["home", "home"],
            ["learning", "school"],
            ["practice", "practice"],
        ]);
        expect(items.map((item) => item.key)).not.toContain("teaching");
    });

    it("puts the teacher's 教学中心 first and keeps the school block apart from practice", () => {
        expect(
            workspaceNavItems({ schoolContext: context("teacher", false), featureModules: ALL_MODULES, menuPermissions: DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS })
                .slice(0, 3)
                .map((item) => [item.key, item.group]),
        ).toEqual([
            ["home", "home"],
            ["teaching", "school"],
            ["practice", "practice"],
        ]);
        expect(keys({ schoolContext: context("teacher", true), featureModules: ALL_MODULES, menuPermissions: DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS }).slice(0, 4)).toEqual(["home", "teaching", "school", "practice"]);
    });

    it("shows everything to guests on the home page (protected pages ask for login)", () => {
        expect(keys({ featureModules: ALL_MODULES })).toContain("works");
    });
});

describe("isHelpCenterVisible", () => {
    it("needs both the module switch and the role permission", () => {
        expect(isHelpCenterVisible(ALL_MODULES, ["help-center"])).toBe(true);
        expect(isHelpCenterVisible(ALL_MODULES, ["creative-agent"])).toBe(false);
        expect(isHelpCenterVisible(normalizeFeatureModuleSettings({ "help-center": false }), ["help-center"])).toBe(false);
        expect(isHelpCenterVisible(ALL_MODULES, undefined)).toBe(true);
    });
});

describe("workspaceNavActiveKey", () => {
    const items = workspaceNavItems({ featureModules: ALL_MODULES, menuPermissions: DEFAULT_USER_NAVIGATION_MENU_PERMISSIONS });
    it("matches the first path segment", () => {
        expect(workspaceNavActiveKey("/", items)).toBe("home");
        expect(workspaceNavActiveKey("/assets", items)).toBe("assets");
        expect(workspaceNavActiveKey("/my-prompts/abc", items)).toBe("my-prompts");
        expect(workspaceNavActiveKey("/profile", items)).toBe("");
        expect(workspaceNavActiveKey("/gallery", items)).toBe("");
        expect(workspaceNavActiveKey("/community", items)).toBe("");
    });
});
