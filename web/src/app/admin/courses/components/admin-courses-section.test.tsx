import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin courses section", () => {
    it("keeps the complete platform course workflow in one responsive section", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/courses/components/admin-courses-section.tsx"), "utf8");

        expect(source).toContain("coursesApi.listPlatformCourses");
        expect(source).toContain("coursesApi.createPlatformCourse");
        expect(source).toContain("coursesApi.updatePlatformCourse");
        expect(source).toContain("coursesApi.assignCourseToSchools");
        expect(source).toContain("adminEducationApi.listSchools");
        expect(source).toContain("创建课程");
        expect(source).toContain("发布");
        expect(source).toContain("停用");
        expect(source).toContain("分配学校");
        expect(source).toContain("Form.List");
        expect(source).toContain("md:hidden");
        expect(source).toContain("hidden md:block");
        expect(source).toContain('size="min(720px, 100vw)"');
        expect(source).toContain("afterOpenChange");
        expect(source).not.toContain('<Drawer\n                title={editing ? "编辑课程" : "创建课程"}\n                open={editorOpen}\n                destroyOnHidden\n                width=');
        expect(source).toContain('course.status === "draft"');
        expect(source).not.toContain("typeof window");
        expect(source).not.toContain("forceRender");
        expect(source).not.toContain("fetch(");
        expect(source).not.toContain("教学进度");
        expect(source).not.toContain("结算");
    });
});
