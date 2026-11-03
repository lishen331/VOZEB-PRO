import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin schools section", () => {
    it("uses the typed education API and responsive table/list surfaces", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/schools/components/admin-schools-section.tsx"), "utf8");
        expect(source).toContain("adminEducationApi");
        expect(source).not.toContain("fetch(");
        expect(source).toContain("学校管理");
        expect(source).toContain("首位管理员");
        expect(source).toContain("ID：");
        expect(source).toContain("md:hidden");
        expect(source).toContain("hidden md:block");
        expect(source).toContain("size={Math.min(560");
        // 不再用 forceRender：关闭态预挂载会让点击打开的同一次事件被当成点击外部而立即关闭
        expect(source).not.toContain("forceRender");
        expect(source).toContain("currentUser");
        expect(source).toContain("hasAdminPermission");
        expect(source).toContain("canManageEducation");
        expect(source).toContain("成员");
        expect(source).toContain("AdminSchoolMembersList");
        expect(source).toContain("pageSizeOptions");
        expect(source).toContain("showSizeChanger");
        expect(source).toContain("onShowSizeChange");
    });
});
