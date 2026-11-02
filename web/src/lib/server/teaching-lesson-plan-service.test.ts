import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    files: new Map<string, unknown>(),
    requireTeacher: vi.fn(),
    repository: { getSchoolCourseAssignment: vi.fn(), getCourseLesson: vi.fn() },
}));

vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(mocks.files.has(name) ? mocks.files.get(name) : fallback)),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => mocks.files.set(name, structuredClone(value))),
    withJsonDataFileLock: vi.fn(async (_name: string, operation: () => Promise<unknown>) => operation()),
}));
vi.mock("@/lib/server/database/postgres", () => ({ getDatabaseProvider: () => "file", isPostgresDatabaseEnabled: () => false, ensurePostgresSchema: vi.fn(), postgresQuery: vi.fn() }));
vi.mock("@/lib/server/school-domain-repository", () => ({ createSchoolDomainRepository: () => mocks.repository }));
vi.mock("@/lib/server/school-access-service", () => ({
    requireTeacher: mocks.requireTeacher,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
            public data?: unknown,
        ) {
            super(message);
        }
    },
}));

import { starterLessonPlan } from "@/lib/teaching-lesson-plan";
import { getMyLessonPlan, listMyLessonPlans, recordMyLessonRehearsal, saveMyLessonPlan } from "./teaching-lesson-plan-service";

const lesson = { id: "lesson-1", courseId: "course-1", chapterId: "chapter-1", title: "空间效果图", description: "", sortOrder: 0, createdAt: "", updatedAt: "" };

describe("teaching lesson plan service", () => {
    beforeEach(() => {
        mocks.files.clear();
        vi.clearAllMocks();
        mocks.requireTeacher.mockResolvedValue({ school: { id: "school-1" }, membership: { id: "teacher-1", role: "teacher" } });
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue({ id: "assign-1", schoolId: "school-1", courseId: "course-1", status: "active" });
        mocks.repository.getCourseLesson.mockResolvedValue(lesson);
    });

    it("returns null before the teacher has written anything", async () => {
        await expect(getMyLessonPlan("user-1", "assign-1", "lesson-1")).resolves.toBeNull();
    });

    it("creates, updates with the version check, and lists progress", async () => {
        const created = await saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: starterLessonPlan(lesson), baseUpdatedAt: null });
        expect(created.status).toBe("draft");
        expect(created.content.phases).toHaveLength(5);

        await new Promise((resolve) => setTimeout(resolve, 2));
        const ready = await saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: created.content, status: "ready", baseUpdatedAt: created.updatedAt });
        expect(ready.status).toBe("ready");
        expect(ready.updatedAt).not.toBe(created.updatedAt);

        await expect(listMyLessonPlans("user-1", "assign-1")).resolves.toEqual([{ assignmentId: "assign-1", lessonId: "lesson-1", status: "ready", rehearsalCount: 0, updatedAt: ready.updatedAt, totalMinutes: 90 }]);
    });

    it("rejects a stale save with 409 instead of overwriting", async () => {
        const created = await saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: starterLessonPlan(lesson), baseUpdatedAt: null });
        await new Promise((resolve) => setTimeout(resolve, 2));
        await saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: { ...created.content, keyPoints: "另一台电脑改的" }, baseUpdatedAt: created.updatedAt });

        await expect(saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: created.content, baseUpdatedAt: created.updatedAt })).rejects.toMatchObject({ status: 409 });
        await expect(saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: created.content, baseUpdatedAt: null })).rejects.toMatchObject({ status: 409 });
        expect((await getMyLessonPlan("user-1", "assign-1", "lesson-1"))?.content.keyPoints).toBe("另一台电脑改的");
    });

    it("rejects an unparseable version with 400 and accepts any equivalent timestamp format", async () => {
        const created = await saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: starterLessonPlan(lesson), baseUpdatedAt: null });
        await expect(saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: created.content, baseUpdatedAt: "abc" })).rejects.toMatchObject({ status: 400 });
        await expect(saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: created.content, baseUpdatedAt: 123 as unknown as string })).rejects.toMatchObject({ status: 400 });

        await new Promise((resolve) => setTimeout(resolve, 2));
        const sameInstant = created.updatedAt.replace("Z", "+00:00");
        await expect(saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: created.content, baseUpdatedAt: sameInstant })).resolves.toMatchObject({ status: "draft" });
    });

    it("refuses to mark an incomplete plan as ready and lists what is missing", async () => {
        await expect(saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: { objectives: [], phases: [] }, status: "ready", baseUpdatedAt: null })).rejects.toMatchObject({
            status: 400,
            data: { missing: ["至少写 1 条教学目标", "填写教学重点", "至少安排 1 个教学环节"] },
        });
    });

    it("only lets teachers work on lessons that belong to an active school course", async () => {
        mocks.repository.getCourseLesson.mockResolvedValueOnce({ ...lesson, courseId: "other-course" });
        await expect(getMyLessonPlan("user-1", "assign-1", "lesson-1")).rejects.toMatchObject({ status: 404 });

        mocks.repository.getSchoolCourseAssignment.mockResolvedValueOnce({ id: "assign-1", schoolId: "school-1", courseId: "course-1", status: "disabled" });
        await expect(getMyLessonPlan("user-1", "assign-1", "lesson-1")).rejects.toMatchObject({ status: 404 });

        mocks.requireTeacher.mockRejectedValueOnce(Object.assign(new Error("当前账号不是学校老师"), { status: 403 }));
        await expect(listMyLessonPlans("student-user")).rejects.toMatchObject({ status: 403 });
    });

    it("keeps each teacher's plan separate", async () => {
        await saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: starterLessonPlan(lesson), baseUpdatedAt: null });
        mocks.requireTeacher.mockResolvedValue({ school: { id: "school-1" }, membership: { id: "teacher-2", role: "teacher" } });
        await expect(getMyLessonPlan("user-2", "assign-1", "lesson-1")).resolves.toBeNull();
        await expect(listMyLessonPlans("user-2")).resolves.toEqual([]);
    });

    it("records a rehearsal without bumping the edit version", async () => {
        await expect(recordMyLessonRehearsal("user-1", "assign-1", "lesson-1", { totalSeconds: 60, phases: [] })).rejects.toMatchObject({ status: 409 });

        const created = await saveMyLessonPlan("user-1", "assign-1", "lesson-1", { content: starterLessonPlan(lesson), baseUpdatedAt: null });
        const rehearsed = await recordMyLessonRehearsal("user-1", "assign-1", "lesson-1", { totalSeconds: 5000, phases: [{ phaseId: "phase-1", seconds: 700 }] });
        expect(rehearsed.rehearsalCount).toBe(1);
        expect(rehearsed.lastRehearsal?.phases).toEqual([{ phaseId: "phase-1", name: "导入", plannedMinutes: 10, seconds: 700 }]);
        expect(rehearsed.updatedAt).toBe(created.updatedAt);

        await expect(recordMyLessonRehearsal("user-1", "assign-1", "lesson-1", { totalSeconds: 0, phases: [] })).rejects.toMatchObject({ status: 400 });
    });
});
