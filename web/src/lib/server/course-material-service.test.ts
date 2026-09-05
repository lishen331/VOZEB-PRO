import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getPublicUsersByIds: vi.fn(),
    requireActiveSchoolContext: vi.fn(),
    requireSchoolManager: vi.fn(),
    getLocalMediaRegistrations: vi.fn(),
    cleanupDeletedCourseMaterials: vi.fn(),
    repository: {
        getSchoolCourseAssignment: vi.fn(),
        getPlatformCourse: vi.fn(),
        getPlatformCourseTree: vi.fn(),
        getCourseMaterial: vi.fn(),
        insertCourseMaterial: vi.fn(),
        getPlatformCourseDeletionImpact: vi.fn(),
        permanentlyDeletePlatformCourse: vi.fn(),
        listOfferingsForTeacher: vi.fn(),
        transact: vi.fn(),
    },
}));

vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("./school-access-service", () => ({
    requireActiveSchoolContext: mocks.requireActiveSchoolContext,
    requireSchoolManager: mocks.requireSchoolManager,
    requireTeacher: vi.fn(),
    requireStudent: vi.fn(),
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("./school-domain-repository", () => ({ createSchoolDomainRepository: () => mocks.repository }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistrations: mocks.getLocalMediaRegistrations }));
vi.mock("./course-attachment-service", () => ({ cleanupDeletedCourseMaterials: mocks.cleanupDeletedCourseMaterials }));

import { createSchoolMaterial, permanentlyDeleteCourse } from "./school-course-service";

describe("course material authorization", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireActiveSchoolContext.mockResolvedValue(context("manager-a", "teacher", true));
        mocks.requireSchoolManager.mockResolvedValue(context("manager-a", "teacher", true));
        mocks.getPublicUsersByIds.mockResolvedValue([{ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"] }]);
        mocks.repository.transact.mockImplementation(async (operation: (repository: typeof mocks.repository) => unknown) => operation(mocks.repository));
    });

    it("rejects a target node from another course", async () => {
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue({ id: "assignment-a", courseId: "course-a", schoolId: "school-a", status: "active" });
        mocks.repository.getPlatformCourse.mockResolvedValue({ id: "course-a", title: "课程 A", summary: "", content: {}, status: "published" });
        mocks.repository.getPlatformCourseTree.mockResolvedValue({ chapters: [{ id: "chapter-a", lessons: [] }] });

        await expect(createSchoolMaterial("manager-a", "assignment-a", { chapterId: "chapter-other", title: "资料", storageKey: "permanent/a.docx" })).rejects.toMatchObject({ status: 404 });
        expect(mocks.repository.insertCourseMaterial).not.toHaveBeenCalled();
    });

    it("creates a school material visible to the whole school assignment", async () => {
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue({ id: "assignment-a", courseId: "course-a", schoolId: "school-a", status: "active" });
        mocks.repository.getPlatformCourse.mockResolvedValue({ id: "course-a", title: "课程 A", summary: "", content: {}, status: "published" });
        mocks.repository.getPlatformCourseTree.mockResolvedValue({ chapters: [{ id: "chapter-a", lessons: [{ id: "lesson-a", chapterId: "chapter-a" }] }] });
        mocks.getLocalMediaRegistrations.mockResolvedValue([
            { storageKey: "permanent/a.docx", storageClass: "permanent", type: "attachment", source: "course-attachment", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: 12 },
        ]);
        mocks.repository.insertCourseMaterial.mockImplementation(async (record: unknown) => record);

        await expect(createSchoolMaterial("manager-a", "assignment-a", { lessonId: "lesson-a", title: "课堂案例", storageKey: "permanent/a.docx" })).resolves.toMatchObject({
            sourceScope: "school",
            schoolCourseAssignmentId: "assignment-a",
            lessonId: "lesson-a",
        });
    });

    it("requires the exact title before permanent deletion", async () => {
        mocks.repository.getPlatformCourse.mockResolvedValue({ id: "course-a", title: "课程 A", summary: "", content: {}, status: "published" });
        await expect(permanentlyDeleteCourse("admin-a", "course-a", "错误名称")).rejects.toMatchObject({ status: 400 });
        expect(mocks.repository.permanentlyDeletePlatformCourse).not.toHaveBeenCalled();
    });
});

function context(userId: string, role: "teacher" | "student", canManageSchool: boolean) {
    return {
        school: { id: "school-a", name: "学校 A", status: "active" as const },
        membership: { id: userId, role, permissions: canManageSchool ? (["school.manage"] as const) : [], status: "active" as const },
        canManageSchool,
    };
}
