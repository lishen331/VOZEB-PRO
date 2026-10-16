import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "src/app/(user)/teaching");
const read = (file: string) => readFile(resolve(root, file), "utf8");

describe("teaching center", () => {
    it("supports the teacher course, assignment and review loop", async () => {
        const [page, modal] = await Promise.all([read("page.tsx"), read("teaching-assignment-modal.tsx")]);
        const source = `${page}\n${modal}`;

        expect(source).toContain("coursesApi.listTeachingOfferings");
        expect(source).toContain("coursesApi.listTeachingCourses");
        expect(source).toContain("coursesApi.listTeachingAssignments");
        expect(source).toContain("coursesApi.createTeachingAssignment");
        expect(source).toContain("coursesApi.updateTeachingAssignment");
        expect(source).toContain("coursesApi.listSubmissions");
        expect(source).toContain("coursesApi.reviewSubmission");
        expect(source).toContain("commercialOrdersApi.listTeachingCommercialOrders");
        expect(source).toContain("commercialOrdersApi.configureCommercialOrderParticipants");
        expect(source).toContain("commercialOrdersApi.listCommercialOrderParticipantCandidates");
        expect(source).toContain("commercialOrdersApi.submitCommercialOrderDelivery");
        expect(source).toContain('order.status !== "accepted"');
        expect(source).toContain("正式交付");
        expect(source).toContain("批改通过");
        expect(source).toContain("退回修改");
        expect(source).toContain("offering.courseTitle");
        expect(source).toContain("offering.className");
        expect(source).toContain("submission.student.displayName");
        expect(source).toContain("SubmissionReferenceList");
        expect(source).toContain("resolvedContentReferences");
        expect(source).not.toContain("courseByAssignment");
        expect(source).not.toContain("shortId(");
        expect(page).toContain("new AbortController()");
        expect(page).toContain("submissionRequestSequence");
        expect(page).toContain("const selectAssignment = useCallback");
        expect(page).toContain("submissionAbortController.current?.abort();\n        submissionRequestSequence.current += 1;\n        setSubmissions([]);");
        expect(page).toContain("setSubmissionSelectionRevision((revision) => revision + 1);");
        expect(page).toContain("[loadSubmissions, selectedAssignmentId, submissionSelectionRevision]");
        expect(page).toContain("selectAssignment(assignment.id);");
        expect(page).toContain("onChange={selectAssignment}");
        expect(page).toContain('size="min(720px, 100vw)"');
        expect(modal).toContain("destroyOnHidden");
        expect(modal).toContain("initialValues={{");
        expect(source).not.toContain("typeof window");
        expect(source).not.toContain("forceRender");
        expect(source).not.toContain("教学进度");
        expect(source).not.toContain("结算");
    });

    it("keeps the tab in the URL and links classes and courses into the course prep page", async () => {
        const [page, board, routes] = await Promise.all([read("page.tsx"), read("teaching-prep-board.tsx"), read("teaching-routes.ts")]);

        expect(page).toContain('parseTeachingTab(searchParams.get("tab"))');
        expect(page).toContain("router.replace(teachingHref(");
        expect(page).toContain('teachingCourseHref(offering.assignmentId, { from: "classes" })');
        expect(board).toContain("teachingCourseHref(item.id)");
        for (const label of ["备课", "我的班级", "作业", "学生提交", "商单任务"]) expect(routes).toContain(`"${label}"`);
    });

    it("course prep page goes back to its source tab and swaps lessons without new history entries", async () => {
        const [prep, layout] = await Promise.all([read("courses/[assignmentId]/teaching-course-prep.tsx"), read("courses/[assignmentId]/prep-layout.tsx")]);

        expect(prep).toContain('prepBackHref(search.get("from"))');
        expect(prep).toContain("router.replace(teachingCourseHref(assignmentId, { lessonId, from: fromTab })");
        expect(prep).toContain("coursesApi.getSchoolCourseTree(assignmentId)");
        expect(prep).toContain("coursesApi.createSchoolCourseMaterial");
        expect(prep).toContain("coursesApi.deleteSchoolCourseAttachment");
        expect(layout).toContain('aria-label="当前位置"');
        expect(layout).toContain("PrepBackLink");
    });
});
