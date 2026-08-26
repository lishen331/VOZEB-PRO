import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, unknown>();

vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(files.has(name) ? files.get(name) : fallback)),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => files.set(name, structuredClone(value))),
    withJsonDataFileLock: vi.fn(async (_name: string, operation: () => Promise<unknown>) => operation()),
}));

import { createFileSchoolDomainRepository } from "./school-domain-file-repository";

const now = "2026-08-17T00:00:00.000Z";

describe("file school domain repository", () => {
    beforeEach(() => files.clear());

    it("stores a normalized course tree and rejects materials without exactly one target", async () => {
        const repository = createFileSchoolDomainRepository();
        await repository.insertPlatformCourse({ id: "course-tree", title: "课程树", summary: "", content: {}, status: "draft", createdAt: now, updatedAt: now });
        await repository.insertCourseChapter({ id: "chapter-tree", courseId: "course-tree", title: "第一章", description: "", sortOrder: 1, createdAt: now, updatedAt: now });
        await repository.insertCourseLesson({ id: "lesson-tree", courseId: "course-tree", chapterId: "chapter-tree", title: "第一课时", description: "", sortOrder: 1, createdAt: now, updatedAt: now });
        await repository.insertCourseMaterial({
            id: "material-tree",
            courseId: "course-tree",
            chapterId: "chapter-tree",
            sourceScope: "platform",
            title: "讲义",
            fileName: "lesson.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            bytes: 10,
            storageKey: "course-tree/lesson.docx",
            url: "/api/media/course-tree/lesson.docx",
            sortOrder: 1,
            status: "active",
            createdAt: now,
            updatedAt: now,
        });
        await repository.insertCourseMaterial({
            id: "material-first",
            courseId: "course-tree",
            chapterId: "chapter-tree",
            sourceScope: "platform",
            title: "排序靠前",
            fileName: "first.zip",
            mimeType: "application/zip",
            bytes: 1,
            storageKey: "course-tree/first.zip",
            url: "/api/media/course-tree/first.zip",
            sortOrder: 0,
            status: "active",
            createdAt: now,
            updatedAt: now,
        });
        await repository.insertCourseMaterial({
            id: "material-last",
            courseId: "course-tree",
            chapterId: "chapter-tree",
            sourceScope: "platform",
            title: "排序靠后",
            fileName: "last.zip",
            mimeType: "application/zip",
            bytes: 1,
            storageKey: "course-tree/last.zip",
            url: "/api/media/course-tree/last.zip",
            sortOrder: 2,
            status: "active",
            createdAt: now,
            updatedAt: now,
        });

        await expect(repository.getPlatformCourseTree("course-tree")).resolves.toMatchObject({});
        await expect(repository.listCourseMaterials({ courseId: "course-tree", page: 1, pageSize: 3 })).resolves.toMatchObject({
            items: [{ id: "material-first" }, { id: "material-tree" }, { id: "material-last" }],
        });
        await expect(
            repository.insertCourseMaterial({
                id: "material-invalid",
                courseId: "course-tree",
                sourceScope: "platform",
                title: "无目标",
                fileName: "empty.zip",
                mimeType: "application/zip",
                bytes: 1,
                storageKey: "course-tree/empty.zip",
                url: "/api/media/course-tree/empty.zip",
                sortOrder: 1,
                status: "active",
                createdAt: now,
                updatedAt: now,
            }),
        ).rejects.toThrow("章节或课时");
    });

    it("rejects teaching assignments that target both a chapter and a lesson", async () => {
        const repository = createFileSchoolDomainRepository();
        await repository.insertSchool(school("school-course", "课程学校"));
        await repository.insertMembership(membership("teacher-course", "school-course", "teacher-course-user", "teacher"));
        await repository.insertClass({ id: "class-course", schoolId: "school-course", name: "一班", description: "", status: "active", createdAt: now, updatedAt: now });
        await repository.insertPlatformCourse({ id: "course-target", title: "目标课程", summary: "", content: {}, status: "published", createdAt: now, updatedAt: now });
        await repository.insertCourseChapter({ id: "chapter-target", courseId: "course-target", title: "章节", description: "", sortOrder: 1, createdAt: now, updatedAt: now });
        await repository.insertCourseLesson({ id: "lesson-target", courseId: "course-target", chapterId: "chapter-target", title: "课时", description: "", sortOrder: 1, createdAt: now, updatedAt: now });
        await repository.assignCourseToSchools("course-target", [{ id: "assignment-target", schoolId: "school-course", status: "active", createdAt: now, updatedAt: now }]);
        await repository.insertCourseOffering({ id: "offering-target", schoolId: "school-course", assignmentId: "assignment-target", classId: "class-course", teacherMembershipId: "teacher-course", status: "active", createdAt: now, updatedAt: now });
        await repository.insertCourseMaterial({
            id: "school-material",
            courseId: "course-target",
            lessonId: "lesson-target",
            sourceScope: "school",
            schoolCourseAssignmentId: "assignment-target",
            title: "本校资料",
            fileName: "school.zip",
            mimeType: "application/zip",
            bytes: 1,
            storageKey: "course-target/school.zip",
            url: "/api/media/course-target/school.zip",
            sortOrder: 1,
            status: "active",
            createdAt: now,
            updatedAt: now,
        });

        await expect(repository.getCourseMaterial("school-material")).resolves.toBeNull();
        await expect(repository.getCourseMaterial("school-material", "school-course")).resolves.toMatchObject({ id: "school-material" });
        await expect(repository.listCourseMaterials({ courseId: "course-target", sourceScope: "school", page: 1, pageSize: 20 })).resolves.toMatchObject({ items: [], total: 0 });
        await expect(repository.listCourseMaterials({ courseId: "course-target", schoolCourseAssignmentId: "assignment-target", page: 1, pageSize: 20 })).resolves.toMatchObject({
            items: [expect.objectContaining({ id: "school-material" })],
            total: 1,
        });

        await expect(
            repository.insertTeachingAssignment({
                id: "teaching-both-targets",
                schoolId: "school-course",
                offeringId: "offering-target",
                teacherMembershipId: "teacher-course",
                chapterId: "chapter-target",
                lessonId: "lesson-target",
                kind: "lesson",
                title: "双目标",
                instructions: "",
                resources: [],
                status: "draft",
                createdAt: now,
                updatedAt: now,
            }),
        ).rejects.toThrow("章节或课时");
    });

    it("keeps school reads tenant-scoped and paginated", async () => {
        const repository = createFileSchoolDomainRepository();
        await repository.insertSchool(school("school-a", "甲学校"));
        await repository.insertSchool(school("school-b", "乙学校"));
        await repository.insertMembership(membership("member-a", "school-a", "user-a", "teacher"));
        await repository.insertMembership(membership("member-b", "school-b", "user-b", "student"));

        await expect(repository.listSchools({ page: 1, pageSize: 1 })).resolves.toMatchObject({ total: 2, page: 1, pageSize: 1, items: [{ id: "school-b" }] });
        await expect(repository.listSchoolsByIds(["school-b", "school-a", "missing"])).resolves.toEqual([expect.objectContaining({ id: "school-a" }), expect.objectContaining({ id: "school-b" })]);
        await expect(repository.getSchoolContextByUserId("user-a")).resolves.toMatchObject({ school: { id: "school-a" }, membership: { id: "member-a" } });
        await expect(repository.getMembership("school-a", "member-b")).resolves.toBeNull();
    });

    it("enforces school boundaries while storing teaching and order records", async () => {
        const repository = createFileSchoolDomainRepository();
        await repository.insertSchool(school("school-a", "甲学校"));
        await repository.insertSchool(school("school-b", "乙学校"));
        await repository.insertMembership(membership("teacher-a", "school-a", "teacher-user-a", "teacher"));
        await repository.insertMembership(membership("student-a", "school-a", "student-user-a", "student"));
        await repository.insertMembership(membership("student-b", "school-b", "student-user-b", "student"));
        await repository.insertClass({ id: "class-a", schoolId: "school-a", name: "一班", description: "", status: "active", createdAt: now, updatedAt: now });

        await expect(repository.replaceClassMembers("school-a", "class-a", ["teacher-a", "student-b"])).rejects.toThrow("学校成员");
        await repository.replaceClassMembers("school-a", "class-a", ["teacher-a", "student-a"]);
        await repository.insertPlatformCourse({ id: "course-a", title: "课程", summary: "", content: {}, status: "published", createdAt: now, updatedAt: now });
        await repository.assignCourseToSchools("course-a", [{ id: "course-assignment-a", schoolId: "school-a", status: "active", createdAt: now, updatedAt: now }]);
        await repository.insertCourseOffering({
            id: "offering-a",
            schoolId: "school-a",
            assignmentId: "course-assignment-a",
            classId: "class-a",
            teacherMembershipId: "teacher-a",
            status: "active",
            createdAt: now,
            updatedAt: now,
        });
        await repository.insertTeachingAssignment({
            id: "teaching-a",
            schoolId: "school-a",
            offeringId: "offering-a",
            teacherMembershipId: "teacher-a",
            kind: "homework",
            title: "作业",
            instructions: "",
            resources: [],
            status: "published",
            createdAt: now,
            updatedAt: now,
        });
        await repository.insertTeachingSubmission({
            id: "submission-a",
            schoolId: "school-a",
            assignmentId: "teaching-a",
            studentMembershipId: "student-a",
            note: "完成",
            contentReferences: [{ type: "work", id: "work-a" }],
            status: "submitted",
            feedback: "",
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
        });

        await expect(repository.listAssignmentsForStudent("school-a", "student-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ id: "teaching-a" }] });
        await repository.updateTeachingAssignment("school-a", "teaching-a", { status: "closed", updatedAt: now });
        await expect(repository.listAssignmentsForStudent("school-a", "student-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ id: "teaching-a", status: "closed" }] });
        await expect(repository.listTeachingSubmissionsForStudent("school-a", "student-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ id: "submission-a" }] });
        await repository.updateTeachingAssignment("school-a", "teaching-a", { status: "draft", updatedAt: now });
        await expect(repository.listTeachingSubmissionsForStudent("school-a", "student-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0, items: [] });
        await repository.updateTeachingAssignment("school-a", "teaching-a", { status: "closed", updatedAt: now });
        await expect(repository.listTeachingSubmissionsForStudent("school-b", "student-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0, items: [] });
        await expect(repository.listVisibleCourses("school-a", "teacher-a", "teacher", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ id: "course-assignment-a" }] });
        await expect(repository.listVisibleCourses("school-a", "student-a", "student", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ id: "course-assignment-a" }] });
        await expect(repository.listVisibleCourses("school-b", "student-a", "student", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0, items: [] });
        await expect(repository.listAssignedCourses("school-b", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0, items: [] });

        await repository.insertCommercialOrder({
            id: "order-a",
            title: "商单",
            requirements: "",
            referenceMaterials: [],
            acceptanceCriteria: "",
            internalAmountCents: 100,
            assignedSchoolId: "school-a",
            status: "assigned",
            platformFeedback: "",
            createdAt: now,
            updatedAt: now,
        });
        await repository.insertCommercialOrderDelivery({
            id: "delivery-a",
            schoolId: "school-a",
            orderId: "order-a",
            submittedByMembershipId: "teacher-a",
            contentReferences: [{ type: "work", id: "work-a" }],
            note: "交付",
            status: "submitted",
            platformFeedback: "",
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
        });
        await expect(repository.compareAndSetCommercialOrderStatus("school-a", "order-a", "assigned", "in_progress", now)).resolves.toBe(true);
        await expect(repository.compareAndSetCommercialOrderStatus("school-a", "order-a", "assigned", "submitted", now)).resolves.toBe(false);
        await expect(repository.getCommercialOrder("school-b", "order-a")).resolves.toBeNull();

        await repository.replaceClassMembers("school-a", "class-a", ["teacher-a"]);
        await expect(repository.listTeachingSubmissionsForStudent("school-a", "student-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0, items: [] });
    });

    it("mirrors schema checks and unique constraints", async () => {
        const repository = createFileSchoolDomainRepository();
        await seedTeachingDomain(repository);

        await expect(repository.insertCommercialOrder(order("missing-school", undefined, "assigned"))).rejects.toThrow("分配学校");
        await expect(repository.insertCommercialOrder({ ...order("wrong-teacher", "school-a", "assigned"), teacherMembershipId: "student-b" })).rejects.toThrow("学校成员");
        await expect(repository.insertCommercialOrder({ ...order("wrong-class", "school-a", "assigned"), classId: "class-b" })).rejects.toThrow("班级");
        await expect(repository.insertMembership(membership("teacher-a", "school-a", "another-user", "teacher"))).rejects.toThrow("记录已存在");
        await expect(
            repository.insertCourseOffering({
                id: "duplicate-offering",
                schoolId: "school-a",
                assignmentId: "course-assignment-a",
                classId: "class-a",
                teacherMembershipId: "teacher-a",
                status: "active",
                createdAt: now,
                updatedAt: now,
            }),
        ).rejects.toThrow("课程安排已存在");
        await expect(
            repository.insertTeachingSubmission({
                id: "duplicate-submission",
                schoolId: "school-a",
                assignmentId: "teaching-a",
                studentMembershipId: "student-a",
                note: "重复",
                contentReferences: [],
                status: "submitted",
                feedback: "",
                submittedAt: now,
                createdAt: now,
                updatedAt: now,
            }),
        ).rejects.toThrow("作业提交已存在");

        await repository.insertCommercialOrder(order("order-a", "school-a", "assigned"));
        await repository.insertCommercialOrderParticipant(participant("participant-a"));
        await expect(repository.insertCommercialOrderParticipant(participant("duplicate-participant"))).rejects.toThrow("商单参与记录已存在");
    });

    it("supports the commercial order workflow with tenant-scoped teacher and student reads", async () => {
        const repository = createFileSchoolDomainRepository();
        await seedTeachingDomain(repository);
        await repository.insertCommercialOrder(order("order-a", undefined, "draft"));

        await expect(repository.listPlatformCommercialOrders({ page: 1, pageSize: 20, status: "draft" })).resolves.toMatchObject({ total: 1, items: [{ id: "order-a" }] });
        await expect(repository.updateCommercialOrderDraft("order-a", { title: "更新商单", internalAmountCents: 1250, updatedAt: now })).resolves.toMatchObject({ title: "更新商单", internalAmountCents: 1250 });
        await expect(repository.assignCommercialOrderToSchool("order-a", "school-a", now)).resolves.toMatchObject({ assignedSchoolId: "school-a", status: "assigned" });
        await expect(repository.configureCommercialOrder("school-a", "order-a", { teacherMembershipId: "teacher-a", classId: "class-a", updatedAt: now })).resolves.toMatchObject({ teacherMembershipId: "teacher-a", classId: "class-a" });
        await repository.replaceCommercialOrderParticipants("school-a", "order-a", [participant("participant-a")]);
        await expect(repository.hasActiveCommercialOrderParticipant("school-a", "order-a")).resolves.toBe(true);
        await expect(repository.listCommercialOrderParticipantMembershipIds("school-a", "order-a")).resolves.toEqual(["student-a"]);
        await expect(repository.assignCommercialOrderToSchool("order-a", "school-a", now)).resolves.toMatchObject({ teacherMembershipId: "teacher-a", classId: "class-a" });
        await expect(repository.listCommercialOrderParticipants("school-a", "order-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1 });

        await expect(repository.listCommercialOrdersForTeacher("school-a", "teacher-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ id: "order-a" }] });
        await expect(repository.listCommercialOrdersForParticipant("school-a", "student-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ id: "order-a" }] });
        await expect(repository.getCommercialOrderParticipant("school-a", "order-a", "student-a", true)).resolves.toMatchObject({ id: "participant-a", status: "active" });
        await expect(repository.updateCommercialOrderParticipant("school-a", "order-a", "student-a", { candidateReferences: [{ type: "work", id: "work-a" }], note: "候选", status: "submitted", submittedAt: now, updatedAt: now })).resolves.toMatchObject({
            status: "submitted",
            note: "候选",
        });

        await repository.insertCommercialOrderDelivery({
            id: "delivery-a",
            schoolId: "school-a",
            orderId: "order-a",
            submittedByMembershipId: "teacher-a",
            contentReferences: [{ type: "work", id: "work-a" }],
            note: "正式交付",
            status: "submitted",
            platformFeedback: "",
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
        });
        await expect(repository.getLatestCommercialOrderDelivery("order-a", true)).resolves.toMatchObject({ id: "delivery-a", status: "submitted" });
        await expect(repository.updateCommercialOrderDelivery("delivery-a", { status: "accepted", platformFeedback: "通过", reviewedAt: now, updatedAt: now })).resolves.toMatchObject({ status: "accepted", platformFeedback: "通过" });
        await expect(repository.compareAndSetPlatformCommercialOrderStatus("order-a", "assigned", "accepted", now)).resolves.toBe(true);
        await expect(repository.compareAndSetPlatformCommercialOrderStatus("order-a", "assigned", "cancelled", now)).resolves.toBe(false);

        await repository.updateMembership("school-a", "student-a", { status: "disabled", updatedAt: now });
        await expect(repository.hasActiveCommercialOrderParticipant("school-a", "order-a")).resolves.toBe(false);
        await expect(repository.listCommercialOrderParticipantMembershipIds("school-a", "order-a")).resolves.toEqual([]);
    });

    it("supports tenant-scoped organization maintenance operations", async () => {
        const repository = createFileSchoolDomainRepository();
        await repository.insertSchool(school("school-a", "甲学校"));
        await repository.insertSchool(school("school-b", "乙学校"));
        await repository.insertMembership(membership("teacher-a", "school-a", "teacher-user-a", "teacher"));
        await repository.insertMembership(membership("student-a", "school-a", "student-user-a", "student"));
        await repository.insertClass({ id: "class-a", schoolId: "school-a", name: "一班", description: "", status: "active", createdAt: now, updatedAt: now });
        await repository.insertClass({ id: "class-delete", schoolId: "school-a", name: "待删除班级", description: "", status: "active", createdAt: now, updatedAt: now });
        await repository.replaceClassMembers("school-a", "class-a", ["teacher-a", "student-a"]);
        await repository.replaceClassMembers("school-a", "class-delete", ["teacher-a"]);
        files.set("auth.json", {
            users: [
                { id: "teacher-user-a", accountId: "0007", username: "teacher_a", displayName: "设计老师", email: "teacher@example.com" },
                { id: "student-user-a", accountId: "10001", username: "student_a", displayName: "设计学生", email: "student@example.com" },
            ],
        });

        await expect(repository.getSchool("school-a", true)).resolves.toMatchObject({ name: "甲学校" });
        await expect(repository.updateSchool("school-a", { name: "甲学校新名", profile: { city: "杭州" }, updatedAt: now })).resolves.toMatchObject({ name: "甲学校新名", profile: { city: "杭州" } });
        await expect(repository.getMembershipByUserId("teacher-user-a", true)).resolves.toMatchObject({ id: "teacher-a" });
        await expect(repository.updateMembership("school-b", "teacher-a", { status: "disabled", updatedAt: now })).resolves.toBeNull();
        await expect(repository.updateMembership("school-a", "teacher-a", { permissions: ["school.manage"], updatedAt: now })).resolves.toMatchObject({ permissions: ["school.manage"] });
        await expect(repository.listFirstManagers(["school-a", "school-b"])).resolves.toEqual([expect.objectContaining({ id: "teacher-a", schoolId: "school-a" })]);
        await expect(repository.listMembers("school-a", { page: 1, pageSize: 20, keyword: "student_a", role: "student", status: "active", classId: "class-a" })).resolves.toMatchObject({
            total: 1,
            items: [expect.objectContaining({ id: "student-a" })],
        });
        await expect(repository.listMembers("school-a", { page: 1, pageSize: 20, role: "student", status: "active", classId: "class-delete" })).resolves.toMatchObject({ total: 0, items: [] });

        await repository.upsertInviteCode({ id: "invite-a", schoolId: "school-a", role: "student", codeDigest: "digest-a", status: "active", createdAt: now, updatedAt: now });
        await expect(repository.upsertInviteCode({ id: "invite-b", schoolId: "school-b", role: "teacher", codeDigest: "digest-a", status: "active", createdAt: now, updatedAt: now })).rejects.toThrow("邀请码摘要");
        await expect(repository.getInviteCodeByRole("school-a", "student", true)).resolves.toMatchObject({ codeDigest: "digest-a" });
        await expect(repository.getInviteCodeByDigest("digest-a", true)).resolves.toMatchObject({ schoolId: "school-a" });
        await expect(repository.getInviteCodeByRole("school-b", "student")).resolves.toBeNull();

        await expect(repository.getClass("school-a", "class-a", true)).resolves.toMatchObject({ name: "一班" });
        await expect(repository.listClasses("school-a", { page: 1, pageSize: 20, keyword: "一班" })).resolves.toMatchObject({ total: 1, items: [{ id: "class-a" }] });
        await expect(repository.updateClass("school-b", "class-a", { name: "越权", updatedAt: now })).resolves.toBeNull();
        await expect(repository.updateClass("school-a", "class-a", { description: "更新", updatedAt: now })).resolves.toMatchObject({ description: "更新" });
        await expect(repository.listClassMembers("school-a", "class-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({
            total: 2,
            items: expect.arrayContaining([expect.objectContaining({ id: "teacher-a" }), expect.objectContaining({ id: "student-a" })]),
        });
        for (const keyword of ["0007", "teacher_a", "设计老师", "teacher@example.com", "10001"]) {
            await expect(repository.listMembers("school-a", { page: 1, pageSize: 20, keyword })).resolves.toMatchObject({ total: 1 });
        }
        await expect(repository.deleteClass("school-b", "class-delete")).resolves.toBe(false);
        await expect(repository.deleteClass("school-a", "class-delete")).resolves.toBe(true);
        await expect(repository.getClass("school-a", "class-delete")).resolves.toBeNull();
        await expect(repository.listClassMembers("school-a", "class-delete", { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0, items: [] });
        await expect(repository.deleteMembership("school-b", "student-a")).resolves.toBe(false);
        await expect(repository.deleteMembership("school-a", "student-a")).resolves.toBe(true);
        await expect(repository.getMembership("school-a", "student-a")).resolves.toBeNull();
    });

    it("returns detached records inside and outside transactions", async () => {
        const repository = createFileSchoolDomainRepository();
        await repository.insertSchool(school("school-a", "甲学校"));
        await repository.insertMembership(membership("teacher-a", "school-a", "teacher-user-a", "teacher"));

        const context = await repository.getSchoolContextByUserId("teacher-user-a");
        if (!context) throw new Error("missing context");
        context.school.name = "被篡改";
        context.membership.status = "disabled";

        await repository.transact(async (transaction) => {
            const loaded = await transaction.getMembership("school-a", "teacher-a", true);
            if (!loaded) throw new Error("missing membership");
            loaded.permissions.push("school.manage");
        });

        await expect(repository.getSchool("school-a")).resolves.toMatchObject({ name: "甲学校" });
        await expect(repository.getMembership("school-a", "teacher-a")).resolves.toMatchObject({ status: "active", permissions: [] });
    });

    it("mirrors PostgreSQL nullable teaching updates", async () => {
        const repository = createFileSchoolDomainRepository();
        await seedTeachingDomain(repository);

        await repository.updateTeachingAssignment("school-a", "teaching-a", { dueAt: "2026-08-18T00:00:00.000Z", updatedAt: now });
        await repository.updateTeachingAssignment("school-a", "teaching-a", { dueAt: "", updatedAt: now });
        await repository.updateTeachingSubmission("school-a", "submission-a", { reviewedAt: "2026-08-18T00:00:00.000Z", updatedAt: now });
        await repository.updateTeachingSubmission("school-a", "submission-a", { reviewedAt: "", updatedAt: now });

        expect((await repository.getTeachingAssignment("school-a", "teaching-a"))?.dueAt).toBeUndefined();
        expect((await repository.getTeachingSubmission("school-a", "submission-a"))?.reviewedAt).toBeUndefined();
    });

    it("rolls back a failed file transaction", async () => {
        const repository = createFileSchoolDomainRepository();
        await expect(
            repository.transact(async (transaction) => {
                await transaction.insertSchool(school("rolled-back", "回滚学校"));
                throw new Error("stop");
            }),
        ).rejects.toThrow("stop");

        await expect(repository.listSchools({ page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0, items: [] });
    });
});

function school(id: string, name: string) {
    return { id, name, profile: {}, status: "active" as const, createdAt: now, updatedAt: now };
}

function membership(id: string, schoolId: string, userId: string, role: "teacher" | "student") {
    return { id, schoolId, userId, role, permissions: [], status: "active" as const, joinSource: "admin" as const, createdAt: now, updatedAt: now };
}

async function seedTeachingDomain(repository: ReturnType<typeof createFileSchoolDomainRepository>) {
    await repository.insertSchool(school("school-a", "甲学校"));
    await repository.insertSchool(school("school-b", "乙学校"));
    await repository.insertMembership(membership("teacher-a", "school-a", "teacher-user-a", "teacher"));
    await repository.insertMembership(membership("student-a", "school-a", "student-user-a", "student"));
    await repository.insertMembership(membership("student-b", "school-b", "student-user-b", "student"));
    await repository.insertClass({ id: "class-a", schoolId: "school-a", name: "一班", description: "", status: "active", createdAt: now, updatedAt: now });
    await repository.insertClass({ id: "class-b", schoolId: "school-b", name: "二班", description: "", status: "active", createdAt: now, updatedAt: now });
    await repository.replaceClassMembers("school-a", "class-a", ["teacher-a", "student-a"]);
    await repository.insertPlatformCourse({ id: "course-a", title: "课程", summary: "", content: {}, status: "published", createdAt: now, updatedAt: now });
    await repository.assignCourseToSchools("course-a", [{ id: "course-assignment-a", schoolId: "school-a", status: "active", createdAt: now, updatedAt: now }]);
    await repository.insertCourseOffering({ id: "offering-a", schoolId: "school-a", assignmentId: "course-assignment-a", classId: "class-a", teacherMembershipId: "teacher-a", status: "active", createdAt: now, updatedAt: now });
    await repository.insertTeachingAssignment({
        id: "teaching-a",
        schoolId: "school-a",
        offeringId: "offering-a",
        teacherMembershipId: "teacher-a",
        kind: "homework",
        title: "作业",
        instructions: "",
        resources: [],
        status: "published",
        createdAt: now,
        updatedAt: now,
    });
    await repository.insertTeachingSubmission({
        id: "submission-a",
        schoolId: "school-a",
        assignmentId: "teaching-a",
        studentMembershipId: "student-a",
        note: "完成",
        contentReferences: [],
        status: "submitted",
        feedback: "",
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
    });
}

function order(orderId: string, assignedSchoolId: string | undefined, status: "draft" | "assigned" | "cancelled") {
    return { id: orderId, title: "商单", requirements: "", referenceMaterials: [], acceptanceCriteria: "", internalAmountCents: 100, assignedSchoolId, status, platformFeedback: "", createdAt: now, updatedAt: now };
}

function participant(participantId: string) {
    return { id: participantId, schoolId: "school-a", orderId: "order-a", membershipId: "student-a", candidateReferences: [], note: "", status: "active" as const, createdAt: now, updatedAt: now };
}
