import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("teaching center", () => {
    it("supports the teacher course, assignment and review loop", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/teaching/page.tsx"), "utf8");

        expect(source).toContain("coursesApi.listTeachingOfferings");
        expect(source).toContain("coursesApi.listTeachingCourses");
        expect(source).toContain("coursesApi.listTeachingAssignments");
        expect(source).toContain("coursesApi.createTeachingAssignment");
        expect(source).toContain("coursesApi.updateTeachingAssignment");
        expect(source).toContain("coursesApi.listSubmissions");
        expect(source).toContain("coursesApi.reviewSubmission");
        expect(source).toContain("commercialOrdersApi.listTeachingCommercialOrders");
        expect(source).toContain("commercialOrdersApi.configureCommercialOrderParticipants");
        expect(source).toContain("commercialOrdersApi.submitCommercialOrderDelivery");
        expect(source).toContain('order.status !== "accepted"');
        expect(source).toContain("商单任务");
        expect(source).toContain("正式交付");
        expect(source).toContain("我的班级");
        expect(source).toContain("我的课程");
        expect(source).toContain("学生提交");
        expect(source).toContain("批改通过");
        expect(source).toContain("退回修改");
        expect(source).toContain("offering.courseTitle");
        expect(source).toContain("offering.className");
        expect(source).toContain("submission.student.displayName");
        expect(source).not.toContain("courseByAssignment");
        expect(source).not.toContain("shortId(");
        expect(source).toContain("new AbortController()");
        expect(source).toContain("submissionRequestSequence");
        expect(source).toContain("const selectAssignment = useCallback");
        expect(source).toContain("submissionAbortController.current?.abort();\n        submissionRequestSequence.current += 1;\n        setSubmissions([]);");
        expect(source).toContain("setSubmissionSelectionRevision((revision) => revision + 1);");
        expect(source).toContain("[loadSubmissions, selectedAssignmentId, submissionSelectionRevision]");
        expect(source).toContain("selectAssignment(assignment.id);");
        expect(source).toContain("onChange={selectAssignment}");
        expect(source).toContain('size="min(720px, 100vw)"');
        expect(source).toContain("afterOpenChange");
        expect(source).toContain("课程附件");
        expect(source).not.toContain('<Drawer title="课程安排详情" open={Boolean(viewingOffering)} destroyOnHidden width=');
        expect(source).not.toContain("typeof window");
        expect(source).not.toContain("forceRender");
        expect(source).not.toContain("教学进度");
        expect(source).not.toContain("结算");
    });
});
