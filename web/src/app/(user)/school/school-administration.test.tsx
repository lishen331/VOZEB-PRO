import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("school administration", () => {
    it("uses the tenant API, fixed CSV columns and responsive management surfaces", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/school/school-administration.tsx"), "utf8");
        const csvSource = await readFile(resolve(process.cwd(), "src/app/(user)/school/school-csv.ts"), "utf8");
        expect(source).toContain("schoolApi");
        expect(source).not.toContain("fetch(");
        expect(csvSource).toContain('from "papaparse"');
        expect(csvSource).toContain('["username", "displayName", "password", "role"]');
        expect(source).toContain("学校资料");
        expect(source).toContain("成员管理");
        expect(source).toContain("班级管理");
        expect(source).toContain("课程安排");
        expect(source).toContain("coursesApi.listSchoolCourses");
        expect(source).toContain("coursesApi.listCourseOfferings");
        expect(source).toContain("current={offeringPage}");
        expect(source).toContain("total={offeringTotal}");
        expect(source).toContain("offeringRequestSequence");
        expect(source).toContain("filterOption={false}");
        expect(source).toContain("offering.courseTitle");
        expect(source).toContain("offering.className");
        expect(source).not.toContain("shortId(offering");
        expect(source).not.toContain("while (true)");
        expect(source).toContain("coursesApi.createCourseOffering");
        expect(source).toContain("平台课程内容只读");
        expect(source).toContain("课程已停用，不能创建新的教学安排");
        expect(source).toContain('size="min(640px, 100vw)"');
        expect(source).toContain("afterOpenChange");
        expect(source).toContain("课程附件");
        expect(source).not.toContain('<Drawer\n                title={editing?.name || "班级详情"}\n                open={Boolean(editing)}\n                destroyOnHidden\n                width=');
        expect(source).not.toContain("typeof window");
        expect(source).not.toContain("forceRender");
        expect(source).toContain("md:hidden");
        expect(source).toContain("hidden md:block");
        expect(source).not.toContain("教学进度");
        expect(source).not.toContain("结算");
    });

    it("enforces school manager access on the server page", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/school/page.tsx"), "utf8");
        expect(source).toContain("requireSchoolManager");
        expect(source).toContain('redirect("/create")');
    });
});
