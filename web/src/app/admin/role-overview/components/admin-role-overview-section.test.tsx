import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { roleNavigationOverview } from "@/constant/navigation-tools";

import { roleOverviewPreviewItems } from "./admin-role-overview-section";

describe("admin role overview", () => {
    it("shows the shared project entries for school roles only", () => {
        expect(roleOverviewPreviewItems("teacher").map((item) => item.label)).toContain("无限练习");
        expect(roleOverviewPreviewItems("student").map((item) => item.label)).toContain("无限练习");
        expect(roleOverviewPreviewItems("schoolAdmin").map((item) => item.label)).toContain("学校管理");
        expect(roleOverviewPreviewItems("public").map((item) => item.label)).not.toContain("无限练习");
        expect(roleNavigationOverview.teacher.items.find((item) => item.slug === "practice")?.route).toBe("/practice");
        expect(
            roleOverviewPreviewItems("teacher")
                .filter((item) => item.group === "projects")
                .map((item) => item.label),
        ).toEqual(["画布", "短剧", "无限练习"]);
        expect(
            roleOverviewPreviewItems("student")
                .filter((item) => item.group === "projects")
                .map((item) => item.label),
        ).toEqual(["画布", "短剧", "无限练习"]);
    });

    it("keeps the preview read-only", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/role-overview/components/admin-role-overview-section.tsx"), "utf8");
        expect(source).not.toContain("practiceApi");
        expect(source).toContain("不会执行写操作");
    });
});
