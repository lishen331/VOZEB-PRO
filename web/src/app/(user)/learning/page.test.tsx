import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("learning center", () => {
    it("supports course reading, owned-result selection, submission and feedback", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/learning/page.tsx"), "utf8");

        expect(source).toContain("coursesApi.listTeachingCourses");
        expect(source).toContain("coursesApi.listTeachingAssignments");
        expect(source).toContain("coursesApi.listOwnSubmissions");
        expect(source).not.toContain("assignmentPage.items.map(async");
        expect(source).toContain("coursesApi.submitAssignment");
        expect(source).toContain("listWorkPublications");
        expect(source).toContain("listCanvasProjectSummaries");
        expect(source).toContain("listDramaProjectSummaries");
        expect(source).toContain("listLibraryAssetPage");
        expect(source).toContain("我的课程");
        expect(source).toContain("课时");
        expect(source).toContain("待交作业");
        expect(source).toContain("已交作业");
        expect(source).toContain("实训");
        expect(source).toContain("反馈");
        expect(source).toContain("contentReferences");
        expect(source).toContain("new AbortController()");
        expect(source).toContain('size="min(720px, 100vw)"');
        expect(source).toContain("afterOpenChange");
        expect(source).toContain('Boolean(submission) && (item.status === "closed"');
        expect(source).toContain("课程附件");
        expect(source).not.toContain('<Drawer title={viewingCourse?.title || "课程详情"} open={Boolean(viewingCourse)} destroyOnHidden width=');
        expect(source).not.toContain("typeof window");
        expect(source).not.toContain("forceRender");
        expect(source).not.toContain("教学进度");
        expect(source).not.toContain("结算");
    });
});
