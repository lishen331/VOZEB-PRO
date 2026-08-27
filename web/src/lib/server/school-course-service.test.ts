import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getPublicUsersByIds: vi.fn(),
    requireSchoolManager: vi.fn(),
    requireTeacher: vi.fn(),
    requireStudent: vi.fn(),
    requireActiveSchoolContext: vi.fn(),
    validateReferences: vi.fn(),
    getLocalMediaRegistrations: vi.fn(),
    repository: {
        getPlatformCourse: vi.fn(),
        getSchool: vi.fn(),
        getMembership: vi.fn(),
        getClass: vi.fn(),
        getSchoolCourseAssignment: vi.fn(),
        getCourseOffering: vi.fn(),
        getTeachingAssignment: vi.fn(),
        getTeachingSubmission: vi.fn(),
        getTeachingSubmissionByAssignmentAndStudent: vi.fn(),
        isClassMember: vi.fn(),
        assignCourseToSchools: vi.fn(),
        insertCourseOffering: vi.fn(),
        insertPlatformCourse: vi.fn(),
        insertTeachingAssignment: vi.fn(),
        insertTeachingSubmission: vi.fn(),
        updateTeachingSubmission: vi.fn(),
        updateTeachingAssignment: vi.fn(),
        listOfferingsForAssignment: vi.fn(),
        listOfferingsForTeacher: vi.fn(),
        listAssignmentsForTeacher: vi.fn(),
        listAssignmentsForStudent: vi.fn(),
        listTeachingSubmissions: vi.fn(),
        listTeachingSubmissionsForStudent: vi.fn(),
        listVisibleCourses: vi.fn(),
        transact: vi.fn(),
    },
}));

vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("./school-access-service", () => ({
    requireSchoolManager: mocks.requireSchoolManager,
    requireTeacher: mocks.requireTeacher,
    requireStudent: mocks.requireStudent,
    requireActiveSchoolContext: mocks.requireActiveSchoolContext,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("./school-content-reference-service", () => ({ validateSchoolContentReferences: mocks.validateReferences }));
vi.mock("./school-domain-repository", () => ({ createSchoolDomainRepository: () => mocks.repository }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistrations: mocks.getLocalMediaRegistrations }));

import {
    assignCourseToSchools,
    createPlatformCourse,
    createCourseOffering,
    createTeachingAssignment,
    getTeachingAssignment,
    listCourseOfferings,
    listOwnTeachingSubmissions,
    listTeachingAssignments,
    listTeachingCourses,
    listTeachingOfferings,
    listTeachingSubmissions,
    reviewTeachingSubmission,
    submitTeachingAssignment,
    updatePlatformCourse,
    updateTeachingAssignment,
} from "./school-course-service";

describe("school course service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.repository.transact.mockImplementation(async (operation) => operation(mocks.repository));
        mocks.getPublicUsersByIds.mockResolvedValue([{ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"] }]);
        mocks.requireSchoolManager.mockResolvedValue(context("manager-a", "teacher", ["school.manage"]));
        mocks.requireTeacher.mockResolvedValue(context("teacher-a", "teacher"));
        mocks.requireStudent.mockResolvedValue(context("student-a", "student"));
        mocks.requireActiveSchoolContext.mockResolvedValue(context("teacher-a", "teacher"));
    });

    it("rejects draft distribution and keeps published multi-school distribution idempotent", async () => {
        mocks.repository.getPlatformCourse.mockResolvedValueOnce(course("draft")).mockResolvedValueOnce(course("published"));
        await expect(assignCourseToSchools("admin-a", "course-a", ["school-a"])).rejects.toThrow("已发布");

        mocks.repository.getSchool.mockImplementation(async (id: string) => ({ id, status: "active" }));
        mocks.repository.assignCourseToSchools.mockResolvedValue([assignment("school-a"), assignment("school-b")]);
        const assigned = await assignCourseToSchools("admin-a", "course-a", ["school-a", "school-a", "school-b"]);
        expect(assigned).toHaveLength(2);
        expect(assigned[0]?.course).not.toHaveProperty("createdByUserId");
        expect(mocks.repository.assignCourseToSchools).toHaveBeenCalledWith("course-a", expect.arrayContaining([expect.objectContaining({ schoolId: "school-a" }), expect.objectContaining({ schoolId: "school-b" })]));
    });

    it("only lets a school manager arrange an active published course for a local class and teacher", async () => {
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue(assignment("school-a"));
        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));
        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", status: "active" });
        mocks.repository.getMembership.mockResolvedValue({ id: "teacher-a", schoolId: "school-a", role: "teacher", status: "active" });
        mocks.repository.insertCourseOffering.mockImplementation(async (record) => record);

        await expect(createCourseOffering("manager-user", "assignment-a", { classId: "class-a", teacherMembershipId: "teacher-a" })).resolves.toMatchObject({ schoolId: "school-a", assignmentId: "assignment-a" });
        expect(mocks.repository.insertCourseOffering).toHaveBeenCalledTimes(1);

        mocks.repository.getClass.mockResolvedValue(null);
        await expect(createCourseOffering("manager-user", "assignment-a", { classId: "foreign", teacherMembershipId: "teacher-a" })).rejects.toMatchObject({ status: 404 });

        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", status: "disabled" });
        await expect(createCourseOffering("manager-user", "assignment-a", { classId: "class-a", teacherMembershipId: "teacher-a" })).rejects.toMatchObject({ status: 409 });

        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", status: "active" });
        mocks.repository.getPlatformCourse.mockResolvedValue(course("draft"));
        await expect(createCourseOffering("manager-user", "assignment-a", { classId: "class-a", teacherMembershipId: "teacher-a" })).rejects.toMatchObject({ status: 409 });
    });

    it("only lets the responsible teacher publish work for their offering and blocks disabled course creation", async () => {
        mocks.repository.getCourseOffering.mockResolvedValue({ id: "offering-a", schoolId: "school-a", assignmentId: "assignment-a", classId: "class-a", teacherMembershipId: "teacher-a", status: "active" });
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue(assignment("school-a"));
        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));
        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", status: "active" });
        mocks.repository.insertTeachingAssignment.mockImplementation(async (record) => record);

        await expect(createTeachingAssignment("teacher-user", "offering-a", { kind: "homework", title: "作业一", instructions: "完成海报", dueAt: "2026-08-18T09:00:00+08:00", status: "published" })).resolves.toMatchObject({
            teacherMembershipId: "teacher-a",
            dueAt: "2026-08-18T01:00:00.000Z",
            status: "published",
        });

        mocks.repository.getPlatformCourse.mockResolvedValue(course("disabled"));
        await expect(createTeachingAssignment("teacher-user", "offering-a", { kind: "homework", title: "新作业", instructions: "不可创建" })).rejects.toThrow("停用");

        mocks.repository.getPlatformCourse.mockResolvedValue(course("draft"));
        await expect(createTeachingAssignment("teacher-user", "offering-a", { kind: "homework", title: "草稿课程作业" })).rejects.toMatchObject({ status: 409 });

        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue({ ...assignment("school-a"), status: "disabled" });
        await expect(createTeachingAssignment("teacher-user", "offering-a", { kind: "homework", title: "停用分配作业" })).rejects.toMatchObject({ status: 409 });
    });

    it("upserts the student's own submission after validating stable references", async () => {
        mocks.repository.getTeachingAssignment.mockResolvedValue({ id: "task-a", schoolId: "school-a", offeringId: "offering-a", status: "published" });
        mocks.repository.getCourseOffering.mockResolvedValue({ id: "offering-a", schoolId: "school-a", assignmentId: "assignment-a", classId: "class-a", status: "active" });
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue(assignment("school-a"));
        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));
        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", status: "active" });
        mocks.repository.getMembership.mockImplementation(async (_schoolId: string, membershipId: string) => ({ id: membershipId, schoolId: "school-a", role: membershipId === "teacher-a" ? "teacher" : "student", status: "active" }));
        mocks.repository.isClassMember.mockResolvedValue(true);
        mocks.validateReferences.mockResolvedValue([{ reference: { type: "asset", id: "asset-a" }, title: "成果" }]);
        mocks.repository.getTeachingSubmissionByAssignmentAndStudent.mockResolvedValue({ id: "submission-a", status: "revision_required", createdAt: "2026-08-17T00:00:00.000Z" });
        mocks.repository.updateTeachingSubmission.mockImplementation(async (_schoolId, _id, patch) => ({ id: "submission-a", ...patch, reviewedAt: patch.reviewedAt || undefined }));

        await expect(submitTeachingAssignment("student-user", "task-a", { note: "已修改", references: [{ type: "asset", id: "asset-a", ignored: true }] })).resolves.toMatchObject({
            id: "submission-a",
            contentReferences: [{ type: "asset", id: "asset-a" }],
            status: "submitted",
            reviewedAt: undefined,
        });
        expect(mocks.validateReferences).toHaveBeenCalledWith({ userId: "student-user", schoolId: "school-a", references: expect.any(Array) });
        expect(mocks.repository.insertTeachingSubmission).not.toHaveBeenCalled();

        mocks.repository.getTeachingSubmissionByAssignmentAndStudent.mockResolvedValue({ id: "submission-a", status: "reviewed" });
        await expect(submitTeachingAssignment("student-user", "task-a", { note: "覆盖终稿", references: [] })).rejects.toMatchObject({ status: 409 });
    });

    it("lists the student's submissions with one tenant-scoped repository query", async () => {
        mocks.repository.listTeachingSubmissionsForStudent.mockResolvedValue({ items: [{ id: "submission-a", studentMembershipId: "student-a" }], total: 1, page: 1, pageSize: 20 });

        await expect(listOwnTeachingSubmissions("student-user", { page: 1, pageSize: 20, assignmentIds: ["task-a", "task-a"] })).resolves.toMatchObject({ total: 1, items: [{ id: "submission-a" }] });
        expect(mocks.repository.listTeachingSubmissionsForStudent).toHaveBeenCalledWith("school-a", "student-a", { page: 1, pageSize: 20, assignmentIds: ["task-a"] });
        expect(mocks.repository.listTeachingSubmissions).not.toHaveBeenCalled();
    });

    it("only lets the responsible teacher review a submission", async () => {
        mocks.repository.getTeachingSubmission.mockResolvedValue({ id: "submission-a", schoolId: "school-a", assignmentId: "task-a", studentMembershipId: "student-a", status: "submitted" });
        mocks.repository.getTeachingAssignment.mockResolvedValue({ id: "task-a", schoolId: "school-a", offeringId: "offering-a", status: "published" });
        mocks.repository.getCourseOffering.mockResolvedValue({ id: "offering-a", schoolId: "school-a", assignmentId: "assignment-a", classId: "class-a", teacherMembershipId: "teacher-a", status: "active" });
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue(assignment("school-a"));
        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));
        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", status: "active" });
        mocks.repository.getMembership.mockImplementation(async (_schoolId: string, membershipId: string) => ({ id: membershipId, schoolId: "school-a", role: membershipId === "teacher-a" ? "teacher" : "student", status: "active" }));
        mocks.repository.isClassMember.mockResolvedValue(true);
        mocks.repository.updateTeachingSubmission.mockImplementation(async (_schoolId, _id, patch) => ({ id: "submission-a", ...patch }));

        await expect(reviewTeachingSubmission("teacher-user", "submission-a", { status: "reviewed", feedback: "通过" })).resolves.toMatchObject({ status: "reviewed", feedback: "通过" });
        mocks.repository.getCourseOffering.mockResolvedValue({ id: "offering-a", schoolId: "school-a", assignmentId: "assignment-a", classId: "class-a", teacherMembershipId: "other-teacher", status: "active" });
        await expect(reviewTeachingSubmission("teacher-user", "submission-a", { status: "reviewed", feedback: "越权" })).rejects.toMatchObject({ status: 404 });
    });

    it("rejects invalid status values before reaching provider constraints", async () => {
        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));
        await expect(updatePlatformCourse("admin-a", "course-a", { status: "broken" as never })).rejects.toMatchObject({ status: 400 });

        mocks.repository.getSchoolCourseAssignment.mockResolvedValue(assignment("school-a"));
        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", status: "active" });
        mocks.repository.getMembership.mockResolvedValue({ id: "teacher-a", schoolId: "school-a", role: "teacher", status: "active" });
        await expect(createCourseOffering("manager-user", "assignment-a", { classId: "class-a", teacherMembershipId: "teacher-a", status: "broken" as never })).rejects.toMatchObject({ status: 400 });

        mocks.repository.getCourseOffering.mockResolvedValue({ id: "offering-a", schoolId: "school-a", assignmentId: "assignment-a", teacherMembershipId: "teacher-a", status: "active" });
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue(assignment("school-a"));
        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));
        await expect(createTeachingAssignment("teacher-user", "offering-a", { kind: "homework", title: "作业", status: "broken" as never })).rejects.toMatchObject({ status: 400 });
        await expect(createTeachingAssignment("teacher-user", "offering-a", { kind: "homework", title: "作业", dueAt: "not-a-date" })).rejects.toMatchObject({ status: 400 });
        await expect(createTeachingAssignment("teacher-user", "offering-a", { kind: "homework", title: "作业", dueAt: "2026-08-18T09:00" })).rejects.toMatchObject({ status: 400 });
    });

    it("rechecks the active teaching path before publishing an existing task", async () => {
        mocks.repository.getTeachingAssignment.mockResolvedValue({ id: "task-a", schoolId: "school-a", offeringId: "offering-a", teacherMembershipId: "teacher-a", status: "draft" });
        mocks.repository.getCourseOffering.mockResolvedValue({ id: "offering-a", schoolId: "school-a", assignmentId: "assignment-a", classId: "class-a", teacherMembershipId: "teacher-a", status: "active" });
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue(assignment("school-a"));
        mocks.repository.getPlatformCourse.mockResolvedValue(course("disabled"));
        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", status: "active" });

        await expect(updateTeachingAssignment("teacher-user", "task-a", { status: "published" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.repository.updateTeachingAssignment).not.toHaveBeenCalled();
    });

    it("lets a student read only their own submission and feedback", async () => {
        mocks.requireActiveSchoolContext.mockResolvedValue(context("student-a", "student"));
        mocks.repository.getTeachingAssignment.mockResolvedValue({ id: "task-a", schoolId: "school-a", offeringId: "offering-a", status: "closed" });
        mocks.repository.getCourseOffering.mockResolvedValue({ id: "offering-a", schoolId: "school-a", classId: "class-a" });
        mocks.repository.isClassMember.mockResolvedValue(true);
        mocks.repository.getTeachingSubmissionByAssignmentAndStudent.mockResolvedValue({ id: "submission-a", schoolId: "school-a", assignmentId: "task-a", studentMembershipId: "student-a", status: "reviewed", feedback: "通过" });

        await expect(listTeachingSubmissions("student-user", "task-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ id: "submission-a", feedback: "通过" }] });
        expect(mocks.repository.listTeachingSubmissions).not.toHaveBeenCalled();
    });

    it("keeps a closed assignment readable to its current class students", async () => {
        mocks.requireActiveSchoolContext.mockResolvedValue(context("student-a", "student"));
        mocks.repository.getTeachingAssignment.mockResolvedValue({ id: "task-a", schoolId: "school-a", offeringId: "offering-a", status: "closed" });
        mocks.repository.getCourseOffering.mockResolvedValue({ id: "offering-a", schoolId: "school-a", assignmentId: "assignment-a", classId: "class-a", status: "active" });
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue({ ...assignment("school-a"), id: "assignment-a", status: "active" });
        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));
        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", name: "视觉一班", status: "active" });
        mocks.repository.getMembership.mockResolvedValue({ id: "student-a", schoolId: "school-a", role: "student", status: "active" });
        mocks.repository.isClassMember.mockResolvedValue(true);
        mocks.validateReferences.mockResolvedValue([]);

        await expect(getTeachingAssignment("student-user", "task-a")).resolves.toMatchObject({ id: "task-a", status: "closed" });
        await expect(submitTeachingAssignment("student-user", "task-a", { references: [] })).rejects.toMatchObject({ status: 409 });
        expect(mocks.repository.insertTeachingSubmission).not.toHaveBeenCalled();
    });

    it("rechecks the active course distribution before accepting a student submission", async () => {
        mocks.repository.getTeachingAssignment.mockResolvedValue({ id: "task-a", schoolId: "school-a", offeringId: "offering-a", status: "published" });
        mocks.repository.getCourseOffering.mockResolvedValue({ id: "offering-a", schoolId: "school-a", assignmentId: "assignment-a", classId: "class-a", status: "active" });
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue({ ...assignment("school-a"), id: "assignment-a", status: "disabled" });
        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));
        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", status: "active" });
        mocks.repository.getMembership.mockResolvedValue({ id: "student-a", schoolId: "school-a", role: "student", status: "active" });
        mocks.repository.isClassMember.mockResolvedValue(true);
        mocks.repository.getTeachingSubmissionByAssignmentAndStudent.mockResolvedValue(null);
        mocks.repository.insertTeachingSubmission.mockImplementation(async (record) => record);
        mocks.validateReferences.mockResolvedValue([]);

        await expect(submitTeachingAssignment("student-user", "task-a", { references: [] })).rejects.toMatchObject({ status: 409 });
        expect(mocks.repository.insertTeachingSubmission).not.toHaveBeenCalled();
    });

    it("only reviews a submitted record on an active teaching path with current class membership", async () => {
        mocks.repository.getTeachingSubmission.mockResolvedValue({ id: "submission-a", schoolId: "school-a", assignmentId: "task-a", studentMembershipId: "student-a", status: "reviewed" });
        mocks.repository.getTeachingAssignment.mockResolvedValue({ id: "task-a", schoolId: "school-a", offeringId: "offering-a", teacherMembershipId: "teacher-a", status: "published" });
        mocks.repository.getCourseOffering.mockResolvedValue({ id: "offering-a", schoolId: "school-a", assignmentId: "assignment-a", classId: "class-a", teacherMembershipId: "teacher-a", status: "active" });
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue({ ...assignment("school-a"), id: "assignment-a", status: "active" });
        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));
        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", status: "active" });
        mocks.repository.getMembership.mockImplementation(async (_schoolId: string, membershipId: string) =>
            membershipId === "teacher-a" ? { id: "teacher-a", schoolId: "school-a", userId: "teacher-user", role: "teacher", status: "active" } : { id: "student-a", schoolId: "school-a", userId: "student-user", role: "student", status: "active" },
        );
        mocks.repository.isClassMember.mockResolvedValue(true);

        await expect(reviewTeachingSubmission("teacher-user", "submission-a", { status: "revision_required", feedback: "重做" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.repository.updateTeachingSubmission).not.toHaveBeenCalled();

        mocks.repository.getTeachingSubmission.mockResolvedValue({ id: "submission-a", schoolId: "school-a", assignmentId: "task-a", studentMembershipId: "student-a", status: "submitted" });
        mocks.repository.isClassMember.mockResolvedValue(false);
        await expect(reviewTeachingSubmission("teacher-user", "submission-a", { status: "reviewed", feedback: "通过" })).rejects.toMatchObject({ status: 409 });

        mocks.repository.isClassMember.mockResolvedValue(true);
        mocks.repository.getPlatformCourse.mockResolvedValue(course("disabled"));
        await expect(reviewTeachingSubmission("teacher-user", "submission-a", { status: "reviewed", feedback: "通过" })).rejects.toMatchObject({ status: 409 });
    });

    it("returns course, class and public student identity fields without requiring paginated frontend joins", async () => {
        mocks.repository.listOfferingsForTeacher.mockResolvedValue({
            items: [
                {
                    id: "offering-a",
                    schoolId: "school-a",
                    assignmentId: "assignment-a",
                    classId: "class-a",
                    teacherMembershipId: "teacher-a",
                    status: "active",
                    createdAt: "2026-08-17T00:00:00.000Z",
                    updatedAt: "2026-08-17T00:00:00.000Z",
                },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
        });
        mocks.repository.listAssignmentsForTeacher.mockResolvedValue({
            items: [
                {
                    id: "task-a",
                    schoolId: "school-a",
                    offeringId: "offering-a",
                    teacherMembershipId: "teacher-a",
                    kind: "homework",
                    title: "作业",
                    instructions: "",
                    resources: [],
                    status: "published",
                    createdAt: "2026-08-17T00:00:00.000Z",
                    updatedAt: "2026-08-17T00:00:00.000Z",
                },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
        });
        mocks.repository.getSchoolCourseAssignment.mockResolvedValue({ ...assignment("school-a"), id: "assignment-a" });
        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));
        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", name: "视觉一班", status: "active" });
        mocks.repository.getMembership.mockImplementation(async (_schoolId: string, membershipId: string) =>
            membershipId === "student-a" ? { id: "student-a", schoolId: "school-a", userId: "student-user", role: "student", status: "active" } : { id: "teacher-a", schoolId: "school-a", userId: "teacher-user", role: "teacher", status: "active" },
        );
        mocks.getPublicUsersByIds.mockImplementation(async (ids: string[]) => ids.map((id) => ({ id, accountId: id === "student-user" ? "0008" : "0007", username: id, displayName: id === "student-user" ? "学生甲" : "教师甲" })));

        await expect(listTeachingOfferings("teacher-user", { page: 1, pageSize: 20 })).resolves.toMatchObject({ items: [{ courseTitle: "课程", className: "视觉一班", teacher: { accountId: "0007", displayName: "教师甲" } }] });
        await expect(listTeachingAssignments("teacher-user", { page: 1, pageSize: 20 })).resolves.toMatchObject({ items: [{ courseTitle: "课程", className: "视觉一班" }] });

        mocks.repository.getTeachingAssignment.mockResolvedValue({ id: "task-a", schoolId: "school-a", offeringId: "offering-a", status: "published" });
        mocks.repository.getCourseOffering.mockResolvedValue({ id: "offering-a", schoolId: "school-a", assignmentId: "assignment-a", classId: "class-a", teacherMembershipId: "teacher-a" });
        mocks.repository.listTeachingSubmissions.mockResolvedValue({ items: [{ id: "submission-a", schoolId: "school-a", assignmentId: "task-a", studentMembershipId: "student-a", status: "submitted" }], total: 1, page: 1, pageSize: 20 });
        await expect(listTeachingSubmissions("teacher-user", "task-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ items: [{ student: { accountId: "0008", username: "student-user", displayName: "学生甲" } }] });
    });

    it("returns course content only through role-scoped visible assignments", async () => {
        mocks.requireActiveSchoolContext.mockResolvedValue(context("student-a", "student"));
        mocks.repository.listVisibleCourses.mockResolvedValue({ items: [assignment("school-a")], total: 1, page: 1, pageSize: 20 });
        mocks.repository.getPlatformCourse.mockResolvedValue(course("published"));

        await expect(listTeachingCourses("student-user", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ schoolId: "school-a", course: { title: "课程" } }] });
        expect(mocks.repository.listVisibleCourses).toHaveBeenCalledWith("school-a", "student-a", "student", { page: 1, pageSize: 20 });
    });
});

function context(membershipId: string, role: "teacher" | "student", permissions: string[] = []) {
    return { school: { id: "school-a", status: "active" }, membership: { id: membershipId, role, permissions, status: "active" } };
}

function course(status: "draft" | "published" | "disabled") {
    return { id: "course-a", title: "课程", summary: "", content: {}, status, createdByUserId: "admin-internal-uuid", createdAt: "2026-08-17T00:00:00.000Z", updatedAt: "2026-08-17T00:00:00.000Z" };
}

function assignment(schoolId: string) {
    return { id: `assignment-${schoolId}`, courseId: "course-a", schoolId, status: "active", createdAt: "2026-08-17T00:00:00.000Z", updatedAt: "2026-08-17T00:00:00.000Z" };
}
