import { describe, expect, it } from "vitest";

import type { SchoolContext } from "@/lib/school-domain";

import { landingNavigationTools, navigationGroups, navigationToolForPathname, navigationTools, schoolNavigationTools } from "./navigation-tools";

describe("user navigation order", () => {
    it("keeps the landing page entries in their dedicated order", () => {
        expect(landingNavigationTools).toEqual([
            { slug: "create", label: "Agent" },
            { slug: "drama", label: "短剧" },
            { slug: "gallery", label: "广场" },
        ]);
    });

    it("keeps the unified Agent as the only generation entry in workspace navigation", () => {
        expect(navigationGroups.map((group) => group.label)).toEqual(["创作", "项目", "资产", "社区"]);
        expect(navigationTools.map((tool) => tool.slug)).not.toContain("image");
        expect(navigationTools.map((tool) => tool.slug)).not.toContain("video");
    });

    it("keeps published works and personal assets in the requested asset order", () => {
        expect(navigationTools.filter((tool) => tool.group === "assets").map((tool) => tool.label)).toEqual(["作品", "素材", "提示词", "词库"]);
        expect(navigationTools.filter((tool) => tool.group === "community").map((tool) => tool.label)).toEqual(["广场", "主页"]);
        expect(navigationTools.find((tool) => tool.group === "community")?.slug).toBe("community");
    });

    it("adds role-specific school tools without changing ordinary navigation", () => {
        expect(schoolNavigationTools(null)).toEqual([]);
        expect(schoolNavigationTools(context("student", false)).map((tool) => tool.slug)).toEqual(["learning"]);
        expect(schoolNavigationTools(context("teacher", false)).map((tool) => tool.slug)).toEqual(["teaching"]);
        expect(schoolNavigationTools(context("teacher", true)).map((tool) => tool.slug)).toEqual(["teaching", "school"]);
        expect(navigationToolForPathname("/school/classes", context("teacher", true))?.label).toBe("学校管理");
    });
});

function context(role: "teacher" | "student", canManageSchool: boolean): SchoolContext {
    return {
        school: { id: "school-a", name: "甲学校", status: "active" as const },
        membership: { id: "membership-a", role, permissions: canManageSchool ? ["school.manage"] : [], status: "active" as const },
        canManageSchool,
    };
}
