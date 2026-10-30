import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    files: new Map<string, unknown>(),
    requireEducationAdmin: vi.fn(),
    requireTeacher: vi.fn(),
    repository: { getCourseLesson: vi.fn(), getPlatformCourse: vi.fn(), getSchoolCourseAssignment: vi.fn() },
}));

vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(mocks.files.has(name) ? mocks.files.get(name) : fallback)),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => mocks.files.set(name, structuredClone(value))),
    withJsonDataFileLock: vi.fn(async (_name: string, operation: () => Promise<unknown>) => operation()),
}));
vi.mock("@/lib/server/database/postgres", () => ({ getDatabaseProvider: () => "file", isPostgresDatabaseEnabled: () => false, ensurePostgresSchema: vi.fn(), postgresQuery: vi.fn() }));
vi.mock("@/lib/server/school-domain-repository", () => ({ createSchoolDomainRepository: () => mocks.repository }));
vi.mock("@/lib/server/school-course-service", () => ({ requireEducationAdmin: mocks.requireEducationAdmin }));
vi.mock("@/lib/server/school-access-service", () => ({
    requireTeacher: mocks.requireTeacher,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));

import { starterLessonPlan } from "@/lib/teaching-lesson-plan";
import { deletePlatformLessonTemplate, getPlatformLessonTemplate, savePlatformLessonTemplate } from "./platform-lesson-template-service";
import { getLessonTemplateForTeacher } from "./teaching-lesson-plan-service";

const lesson = { id: "lesson-1", courseId: "course-1", chapterId: "chapter-1", title: "空间效果图", description: "", sortOrder: 0, createdAt: "", updatedAt: "" };

describe("platform lesson templates", () => {
    beforeEach(() => {
        mocks.files.clear();
        vi.clearAllMocks();
        mocks.repository.getCourseLesson.mockResolvedValue(lesson);
        mocks.repository.getPlatformCourse.mockResolvedValue({ id: "course-1", status: "published" });
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue({ id: "assign-1", schoolId: "school-1", courseId: "course-1", status: "active" });
        mocks.requireTeacher.mockResolvedValue({ school: { id: "school-1" }, membership: { id: "teacher-1", role: "teacher" } });
    });

    it("saves a template without reflection or phase materials and keeps createdAt on update", async () => {
        const content = { ...starterLessonPlan(lesson, ["m1"]), reflection: "不该保存" };
        const created = await savePlatformLessonTemplate("admin-1", "lesson-1", content);
        expect(created?.content.reflection).toBe("");
        expect(created?.content.phases.every((phase) => phase.materialIds.length === 0)).toBe(true);

        await new Promise((resolve) => setTimeout(resolve, 2));
        const updated = await savePlatformLessonTemplate("admin-1", "lesson-1", { ...content, keyPoints: "改过" });
        expect(updated?.createdAt).toBe(created?.createdAt);
        expect(updated?.updatedAt).not.toBe(created?.updatedAt);
        await expect(getPlatformLessonTemplate("admin-1", "lesson-1")).resolves.toMatchObject({ content: { keyPoints: "改过" } });
    });

    it("treats an all-empty template as delete", async () => {
        await savePlatformLessonTemplate("admin-1", "lesson-1", starterLessonPlan(lesson));
        await expect(savePlatformLessonTemplate("admin-1", "lesson-1", { phases: [{ name: "", minutes: 10 }] })).resolves.toBeNull();
        await expect(getPlatformLessonTemplate("admin-1", "lesson-1")).resolves.toBeNull();
        await expect(deletePlatformLessonTemplate("admin-1", "lesson-1")).resolves.toEqual({ deleted: false });
    });

    it("requires the education admin permission and an editable course for writes", async () => {
        mocks.requireEducationAdmin.mockRejectedValueOnce(Object.assign(new Error("没有权限"), { status: 403 }));
        await expect(getPlatformLessonTemplate("user-1", "lesson-1")).rejects.toMatchObject({ status: 403 });

        mocks.repository.getPlatformCourse.mockResolvedValueOnce({ id: "course-1", status: "disabled" });
        await expect(savePlatformLessonTemplate("admin-1", "lesson-1", starterLessonPlan(lesson))).rejects.toMatchObject({ status: 409 });

        mocks.repository.getCourseLesson.mockResolvedValueOnce(null);
        await expect(getPlatformLessonTemplate("admin-1", "missing")).rejects.toMatchObject({ status: 404 });
    });

    it("lets a teacher of a school using the course read it, and nobody else", async () => {
        await savePlatformLessonTemplate("admin-1", "lesson-1", starterLessonPlan(lesson));
        await expect(getLessonTemplateForTeacher("teacher-user", "assign-1", "lesson-1")).resolves.toMatchObject({ lessonId: "lesson-1" });

        mocks.repository.getSchoolCourseAssignment.mockResolvedValueOnce({ id: "assign-2", schoolId: "school-1", courseId: "other-course", status: "active" });
        await expect(getLessonTemplateForTeacher("teacher-user", "assign-2", "lesson-1")).rejects.toMatchObject({ status: 404 });

        mocks.requireTeacher.mockRejectedValueOnce(Object.assign(new Error("只有老师可以备课"), { status: 403 }));
        await expect(getLessonTemplateForTeacher("student-user", "assign-1", "lesson-1")).rejects.toMatchObject({ status: 403 });
    });

    it("hides the template from teachers once the course is disabled", async () => {
        await savePlatformLessonTemplate("admin-1", "lesson-1", starterLessonPlan(lesson));
        mocks.repository.getPlatformCourse.mockResolvedValueOnce({ id: "course-1", status: "disabled" });
        await expect(getLessonTemplateForTeacher("teacher-user", "assign-1", "lesson-1")).resolves.toBeNull();
    });
});
