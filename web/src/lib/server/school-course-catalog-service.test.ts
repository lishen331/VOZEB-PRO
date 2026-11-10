import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requireActiveSchoolContext: vi.fn(),
    requireSchoolManager: vi.fn(),
    listCourseCatalog: vi.fn(),
    getPlatformCourse: vi.fn(),
    getActiveCourseAssignmentByCourse: vi.fn(),
    getPlatformCourseTree: vi.fn(),
    assignCourseToSchools: vi.fn(),
    countTemplates: vi.fn(),
}));

vi.mock("./school-access-service", () => ({
    requireActiveSchoolContext: mocks.requireActiveSchoolContext,
    requireSchoolManager: mocks.requireSchoolManager,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("./school-domain-repository", () => ({
    createSchoolDomainRepository: () => ({
        listCourseCatalog: mocks.listCourseCatalog,
        getPlatformCourse: mocks.getPlatformCourse,
        getActiveCourseAssignmentByCourse: mocks.getActiveCourseAssignmentByCourse,
        getPlatformCourseTree: mocks.getPlatformCourseTree,
        assignCourseToSchools: mocks.assignCourseToSchools,
    }),
}));
vi.mock("./platform-lesson-template-repository", () => ({ createPlatformLessonTemplateRepository: () => ({ countTemplates: mocks.countTemplates }) }));

import { getSchoolCourseCatalogDetail, listSchoolCourseCatalog, unlockSchoolCourse } from "./school-course-catalog-service";

const context = (canManageSchool: boolean) => ({
    school: { id: "school-a", name: "测试校", status: "active" },
    membership: { id: "membership-a", role: "teacher", status: "active", permissions: canManageSchool ? ["school.manage"] : [] },
    canManageSchool,
});

function course(status: "published" | "draft" = "published") {
    return {
        id: "course-a",
        title: "分镜基础",
        summary: "课程简介",
        content: { category: "影视", coverStorageKey: "permanent/cover.webp", internalNote: "不外发" },
        status,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        chapterCount: 1,
        lessonCount: 1,
        materialCount: 1,
    };
}

function material(id: string, extra: Record<string, unknown>) {
    return {
        id,
        courseId: "course-a",
        sourceScope: "platform" as const,
        title: id,
        fileName: `${id}.pdf`,
        mimeType: "application/pdf",
        bytes: 1024,
        storageKey: `permanent/${id}.pdf`,
        url: `/api/reference-assets/permanent/${id}.pdf`,
        sortOrder: 1,
        status: "active" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...extra,
    };
}

function tree() {
    return {
        ...course(),
        chapters: [
            {
                id: "chapter-a",
                courseId: "course-a",
                title: "第一章 分镜语言",
                description: "章节说明",
                sortOrder: 1,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
                materials: [material("chapter-material", { chapterId: "chapter-a" })],
                lessons: [
                    {
                        id: "lesson-a",
                        courseId: "course-a",
                        chapterId: "chapter-a",
                        title: "镜头景别",
                        description: "课时说明",
                        sortOrder: 1,
                        createdAt: "2026-01-01T00:00:00.000Z",
                        updatedAt: "2026-01-01T00:00:00.000Z",
                        materials: [material("lesson-material", { lessonId: "lesson-a" })],
                    },
                ],
            },
        ],
    };
}

describe("school course catalog service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireActiveSchoolContext.mockResolvedValue(context(false));
        mocks.requireSchoolManager.mockResolvedValue(context(true));
        mocks.countTemplates.mockResolvedValue(1);
    });

    it("lists every published course with lock state and a catalog cover route", async () => {
        mocks.listCourseCatalog.mockResolvedValue({
            total: 2,
            page: 1,
            pageSize: 20,
            items: [
                { ...course(), assignmentId: "assignment-a", unlocked: true },
                { ...course(), id: "course-b", title: "待解锁课", unlocked: false },
            ],
        });

        const result = await listSchoolCourseCatalog("user-a", { page: 1, pageSize: 20 });
        expect(result.items[0]).toMatchObject({ id: "course-a", unlocked: true, assignmentId: "assignment-a", canUnlock: false, coverUrl: "/api/school/course-catalog/course-a/cover" });
        expect(result.items[1]).toMatchObject({ id: "course-b", unlocked: false, canUnlock: false });
        // content 里的封面键和内部字段不外发
        expect(result.items[0]?.content).toEqual({});
        expect(JSON.stringify(result.items)).not.toContain("internalNote");
    });

    it("omits cover URLs for courses with an empty or missing cover key", async () => {
        const withoutCover = { ...course(), content: { coverStorageKey: "" } };
        mocks.listCourseCatalog.mockResolvedValue({ total: 1, page: 1, pageSize: 20, items: [{ ...withoutCover, unlocked: false }] });
        expect((await listSchoolCourseCatalog("user-a", { page: 1, pageSize: 20 })).items[0]).not.toHaveProperty("coverUrl");
        mocks.getPlatformCourse.mockResolvedValue(withoutCover);
        mocks.getPlatformCourseTree.mockResolvedValue({ ...tree(), content: {} });
        mocks.getActiveCourseAssignmentByCourse.mockResolvedValue(null);
        expect(await getSchoolCourseCatalogDetail("user-a", "course-a")).not.toHaveProperty("coverUrl");
    });

    it("marks whether the viewer may unlock the course", async () => {
        mocks.requireActiveSchoolContext.mockResolvedValue(context(true));
        mocks.listCourseCatalog.mockResolvedValue({ total: 1, page: 1, pageSize: 20, items: [{ ...course(), unlocked: false }] });
        const result = await listSchoolCourseCatalog("manager-a", { page: 1, pageSize: 20 });
        expect(result.items[0]).toMatchObject({ unlocked: false, canUnlock: true });
    });

    it("only exposes titles and file names while locked, and full urls once unlocked", async () => {
        mocks.getPlatformCourse.mockResolvedValue(course());
        mocks.getPlatformCourseTree.mockResolvedValue(tree());

        mocks.getActiveCourseAssignmentByCourse.mockResolvedValue(null);
        const locked = await getSchoolCourseCatalogDetail("user-a", "course-a");
        expect(locked).toMatchObject({ unlocked: false, canUnlock: false, templateLessonCount: 1 });
        expect(locked.chapters[0]?.title).toBe("第一章 分镜语言");
        expect(locked.chapters[0]?.lessons[0]?.title).toBe("镜头景别");
        expect(locked.chapters[0]?.lessons[0]?.materials[0]).toMatchObject({ fileName: "lesson-material.pdf", mimeType: "application/pdf", bytes: 1024 });
        expect(locked.chapters[0]?.lessons[0]?.materials[0]).not.toHaveProperty("url");
        expect(locked.chapters[0]?.lessons[0]?.materials[0]).not.toHaveProperty("storageKey");
        expect(locked.chapters[0]?.description).toBe("");
        expect(locked.chapters[0]?.lessons[0]?.description).toBe("");

        mocks.requireActiveSchoolContext.mockResolvedValue(context(true));
        mocks.getActiveCourseAssignmentByCourse.mockResolvedValue({ id: "assignment-a", schoolId: "school-a", courseId: "course-a", status: "active" });
        const unlocked = await getSchoolCourseCatalogDetail("user-a", "course-a");
        expect(unlocked).toMatchObject({ unlocked: true, canUnlock: false, assignmentId: "assignment-a" });
        expect(unlocked.chapters[0]?.description).toBe("章节说明");
        expect(unlocked.chapters[0]?.lessons[0]?.materials[0]).toMatchObject({ url: "/api/reference-assets/permanent/lesson-material.pdf", storageKey: "permanent/lesson-material.pdf" });
        expect(mocks.getPlatformCourseTree).toHaveBeenLastCalledWith("course-a", { schoolCourseAssignmentId: "assignment-a" });
    });

    it("hides unpublished courses and lets only a school manager unlock", async () => {
        mocks.getPlatformCourse.mockResolvedValue(course("draft"));
        await expect(getSchoolCourseCatalogDetail("user-a", "course-a")).rejects.toMatchObject({ status: 404 });
        await expect(unlockSchoolCourse("user-a", "course-a")).rejects.toMatchObject({ status: 404 });

        mocks.getPlatformCourse.mockResolvedValue(course());
        mocks.requireSchoolManager.mockRejectedValue(Object.assign(new Error("当前账号没有学校管理权限"), { status: 403 }));
        await expect(unlockSchoolCourse("teacher-a", "course-a")).rejects.toMatchObject({ status: 403 });

        mocks.requireSchoolManager.mockResolvedValue(context(true));
        mocks.getActiveCourseAssignmentByCourse.mockResolvedValue({ id: "assignment-existing", schoolId: "school-a", courseId: "course-a", status: "active" });
        await expect(unlockSchoolCourse("manager-a", "course-a")).resolves.toMatchObject({ unlocked: true, assignmentId: "assignment-existing", canUnlock: false });
        expect(mocks.assignCourseToSchools).not.toHaveBeenCalled();

        mocks.getActiveCourseAssignmentByCourse.mockResolvedValue(null);
        mocks.assignCourseToSchools.mockImplementation(async (_courseId: string, records: unknown[]) => records);
        const unlocked = await unlockSchoolCourse("manager-a", "course-a");
        expect(unlocked).toMatchObject({ unlocked: true, canUnlock: false, assignmentId: expect.any(String) });
        expect(mocks.assignCourseToSchools).toHaveBeenCalledWith("course-a", [expect.objectContaining({ schoolId: "school-a", status: "active" })]);
    });
});
