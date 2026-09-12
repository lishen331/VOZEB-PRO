import { describe, expect, it } from "vitest";

import type { SchoolContext } from "@/lib/school-domain";

import { landingNavigationTools, navigationGroups, navigationToolForPathname, navigationTools, navigationToolsForContext, roleNavigationOverview, schoolNavigationTools } from "./navigation-tools";
import { normalizeFeatureModuleSettings } from "@/lib/feature-modules";

describe("user navigation order", () => {
    it("keeps the landing page entries in their dedicated order", () => {
        expect(landingNavigationTools).toEqual([
            { slug: "create", label: "Agent" },
            { slug: "drama", label: "短剧" },
            { slug: "gallery", label: "广场" },
        ]);
    });

    it("keeps the unified Agent as the only generation entry in workspace navigation", () => {
        expect(navigationGroups.map((group) => group.label)).toEqual(["无限练习", "创作", "项目", "资产", "社区"]);
        expect(navigationTools.map((tool) => tool.slug)).not.toContain("image");
        expect(navigationTools.map((tool) => tool.slug)).not.toContain("video");
    });

    it("keeps published works and personal assets in the requested asset order", () => {
        expect(navigationTools.filter((tool) => tool.group === "assets").map((tool) => tool.label)).toEqual(["作品", "素材", "提示词", "词库"]);
        expect(navigationTools.filter((tool) => tool.group === "community").map((tool) => tool.label)).toEqual(["广场", "IP库", "主页"]);
        expect(navigationTools.find((tool) => tool.group === "community")?.slug).toBe("community");
    });

    it("puts practice beside Canvas and Drama for active school members", () => {
        expect(schoolNavigationTools(null)).toEqual([]);
        expect(schoolNavigationTools(context("student", false)).map((tool) => tool.slug)).toEqual(["learning"]);
        expect(schoolNavigationTools(context("teacher", false)).map((tool) => tool.slug)).toEqual(["teaching"]);
        expect(schoolNavigationTools(context("teacher", true)).map((tool) => tool.slug)).toEqual(["teaching", "school"]);
        expect(navigationToolForPathname("/practice", context("student", false))).toMatchObject({ label: "无限练习", group: "practice" });
        expect(navigationToolForPathname("/practice", null)).toBeUndefined();
        expect(
            navigationToolsForContext(context("teacher", true))
                .filter((tool) => tool.group === "projects")
                .map((tool) => tool.label),
        ).toEqual(["画布", "短剧", "创作工坊"]);
        const disabledContext = { ...context("teacher", true), school: { ...context("teacher", true).school, status: "disabled" as const } };
        expect(navigationToolsForContext(disabledContext).some((tool) => tool.slug === "practice")).toBe(false);
    });

    it("shows the drama workflow lab by default and supports hiding it", () => {
        expect(navigationToolsForContext(null).find((tool) => tool.slug === "drama-lab")).toMatchObject({ group: "projects", label: "创作工坊" });
        expect(navigationToolsForContext(null, { includeDramaWorkflowLab: false }).some((tool) => tool.slug === "drama-lab")).toBe(false);
        expect(navigationToolForPathname("/drama-lab", null)?.slug).toBe("drama-lab");
        expect(navigationToolForPathname("/drama-lab", null, { includeDramaWorkflowLab: false })).toBeUndefined();
    });

    it("puts the standalone practice section first and removes empty disabled groups", () => {
        const featureModules = normalizeFeatureModuleSettings({
            "creative-agent": false,
            canvas: false,
            drama: false,
            works: false,
            assets: false,
            "my-prompts": false,
            "prompt-library": false,
            community: false,
            "ip-library": false,
            "creator-home": false,
        });
        const tools = navigationToolsForContext(context("student", false), { featureModules });
        expect(tools[0]).toMatchObject({ slug: "practice", label: "无限练习", group: "practice" });
        expect(tools.some((tool) => tool.group === "create")).toBe(false);
        expect(tools.some((tool) => tool.group === "community")).toBe(false);
    });
    it("filters every navigation entry through the global feature module switches", () => {
        const featureModules = normalizeFeatureModuleSettings({ "drama-lab": false, "ip-library": false });
        const tools = navigationToolsForContext(context("teacher", true), { featureModules });
        expect(tools.map((tool) => tool.slug)).not.toEqual(expect.arrayContaining(["drama-lab", "ip-library"]));
        expect(tools.map((tool) => tool.slug)).toEqual(expect.arrayContaining(["canvas", "teaching"]));
    });

    it("exposes the same practice entry in role overview metadata", () => {
        expect(roleNavigationOverview.teacher.items.map((item) => item.label)).toContain("无限练习");
        expect(roleNavigationOverview.student.items.map((item) => item.label)).toContain("无限练习");
        expect(roleNavigationOverview.schoolAdmin.items.map((item) => item.label)).toContain("无限练习");
        expect(roleNavigationOverview.public.items.map((item) => item.label)).not.toContain("无限练习");
        expect(roleNavigationOverview.schoolAdmin.items.map((item) => item.label)).toEqual(expect.arrayContaining(["教学中心", "学校管理"]));
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
