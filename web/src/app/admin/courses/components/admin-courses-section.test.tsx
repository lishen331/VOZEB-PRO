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
        expect(source).toContain("coursesApi.uploadPlatformCourseCover");
        expect(source).toContain('type="file"');
        expect(source).toContain("coverStorageKey: coverKey");
        expect(source).toContain("...editing?.content");
        expect(source).toContain("发布");
        expect(source).toContain("停用");
        expect(source).toContain("分配学校");
        expect(source).toContain("Form.List");
        expect(source).toContain("md:hidden");
        expect(source).toContain("hidden md:block");
        expect(source).toContain('width="min(920px, calc(100vw - 24px))"');
        expect(source).toContain("coursesApi.uploadPlatformCourseAttachment");
        expect(source).toContain("if (!committed && uploadedKeys.length)");
        expect(source).toContain("COURSE_ATTACHMENT_ACCEPT");
        expect(source).toContain("multiple");
        expect(source).not.toContain("Drawer");
        expect(source).not.toContain('type: "url"');
        expect(source).not.toContain('placeholder="https://"');
        expect(source).toContain('course.status === "draft"');
        expect(source).not.toContain("typeof window");
        expect(source).not.toContain("forceRender");
        expect(source).not.toContain("fetch(");
        expect(source).not.toContain("教学进度");
        expect(source).not.toContain("结算");
    });
});
