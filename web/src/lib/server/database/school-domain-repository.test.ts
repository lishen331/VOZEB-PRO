import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { initializePostgresSchema, postgresQuery } from "./postgres";
import { createPostgresRepositories } from "./repositories";
import { createSchoolDomainRepository } from "./school-domain-repository";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;
const suffix = randomUUID();
const id = (value: string) => `school-repository-${value}-${suffix}`;
const now = "2026-08-17T00:00:00.000Z";

describe("PostgreSQL school domain repository", () => {
    beforeAll(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION !== "1") return;
        if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL must point to a dedicated PostgreSQL test database");
        await initializePostgresSchema();
        await postgresQuery("INSERT INTO users (id, username, display_name, password_hash) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8), ($9, $10, $11, $12)", [
            id("teacher-user"),
            `repo_teacher_${suffix.replaceAll("-", "").slice(0, 10)}`,
            "Repository 老师",
            "integration-test-only",
            id("student-user"),
            `repo_student_${suffix.replaceAll("-", "").slice(0, 10)}`,
            "Repository 学生",
            "integration-test-only",
            id("other-user"),
            `repo_other_${suffix.replaceAll("-", "").slice(0, 10)}`,
            "Repository 外校学生",
            "integration-test-only",
        ]);
    });

    afterAll(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION !== "1") return;
        await postgresQuery("DELETE FROM commercial_orders WHERE id = $1", [id("order")]);
        await postgresQuery("DELETE FROM schools WHERE id IN ($1, $2, $3)", [id("school-a"), id("school-b"), id("rolled-back")]);
        await postgresQuery("DELETE FROM platform_courses WHERE id = $1", [id("course")]);
        await postgresQuery("DELETE FROM users WHERE id IN ($1, $2, $3)", [id("teacher-user"), id("student-user"), id("other-user")]);
    });

    postgresIt("matches the tenant-scoped repository contract", async () => {
        const repository = createSchoolDomainRepository();
        await repository.insertSchool(school(id("school-a"), "甲学校"));
        await repository.insertSchool(school(id("school-b"), "乙学校"));
        await repository.insertMembership(membership(id("teacher"), id("school-a"), id("teacher-user"), "teacher"));
        await repository.insertMembership(membership(id("student"), id("school-a"), id("student-user"), "student"));
        await repository.insertMembership(membership(id("other"), id("school-b"), id("other-user"), "student"));
        await repository.insertClass({ id: id("class"), schoolId: id("school-a"), name: "一班", description: "", status: "active", createdAt: now, updatedAt: now });
        await repository.insertClass({ id: id("other-class"), schoolId: id("school-b"), name: "二班", description: "", status: "active", createdAt: now, updatedAt: now });

        await expect(repository.replaceClassMembers(id("school-a"), id("class"), [id("teacher"), id("other")])).rejects.toThrow("学校成员");
        await repository.replaceClassMembers(id("school-a"), id("class"), [id("teacher"), id("student")]);
        await repository.insertPlatformCourse({ id: id("course"), title: "课程", summary: "", content: {}, chapters: [], attachments: [], status: "published", createdAt: now, updatedAt: now });
        await repository.assignCourseToSchools(id("course"), [{ id: id("course-assignment"), schoolId: id("school-a"), status: "active", createdAt: now, updatedAt: now }]);
        await repository.insertCourseOffering({
            id: id("offering"),
            schoolId: id("school-a"),
            assignmentId: id("course-assignment"),
            classId: id("class"),
            teacherMembershipId: id("teacher"),
            supplementalResources: [],
            status: "active",
            createdAt: now,
            updatedAt: now,
        });
        await repository.insertTeachingAssignment({
            id: id("teaching"),
            schoolId: id("school-a"),
            offeringId: id("offering"),
            teacherMembershipId: id("teacher"),
            kind: "homework",
            title: "作业",
            instructions: "",
            resources: [],
            status: "published",
            createdAt: now,
            updatedAt: now,
        });
        await repository.insertTeachingSubmission({
            id: id("submission"),
            schoolId: id("school-a"),
            assignmentId: id("teaching"),
            studentMembershipId: id("student"),
            note: "完成",
            contentReferences: [{ type: "work", id: id("work") }],
            status: "submitted",
            feedback: "",
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
        });
        await repository.insertCommercialOrder({
            id: id("order"),
            title: "商单",
            requirements: "",
            referenceMaterials: [],
            acceptanceCriteria: "",
            internalAmountCents: 100,
            assignedSchoolId: id("school-a"),
            status: "assigned",
            platformFeedback: "",
            createdAt: now,
            updatedAt: now,
        });
        await repository.insertCommercialOrderDelivery({
            id: id("delivery"),
            schoolId: id("school-a"),
            orderId: id("order"),
            submittedByMembershipId: id("teacher"),
            contentReferences: [{ type: "work", id: id("work") }],
            note: "交付",
            status: "submitted",
            platformFeedback: "",
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
        });

        await expect(repository.insertCommercialOrder(order(id("missing-school"), undefined, "assigned"))).rejects.toThrow();
        await expect(repository.insertCommercialOrder({ ...order(id("wrong-teacher"), id("school-a"), "assigned"), teacherMembershipId: id("other") })).rejects.toThrow();
        await expect(repository.insertCommercialOrder({ ...order(id("wrong-class"), id("school-a"), "assigned"), classId: id("other-class") })).rejects.toThrow();
        await expect(repository.insertMembership(membership(id("teacher"), id("school-a"), id("other-user"), "teacher"))).rejects.toThrow();
        await expect(
            repository.insertCourseOffering({
                id: id("duplicate-offering"),
                schoolId: id("school-a"),
                assignmentId: id("course-assignment"),
                classId: id("class"),
                teacherMembershipId: id("teacher"),
                supplementalResources: [],
                status: "active",
                createdAt: now,
                updatedAt: now,
            }),
        ).rejects.toThrow();
        await expect(
            repository.insertTeachingSubmission({
                id: id("duplicate-submission"),
                schoolId: id("school-a"),
                assignmentId: id("teaching"),
                studentMembershipId: id("student"),
                note: "重复",
                contentReferences: [],
                status: "submitted",
                feedback: "",
                submittedAt: now,
                createdAt: now,
                updatedAt: now,
            }),
        ).rejects.toThrow();
        await repository.insertCommercialOrderParticipant(participant(id("participant")));
        await expect(repository.insertCommercialOrderParticipant(participant(id("duplicate-participant")))).rejects.toThrow();

        await expect(repository.listSchools({ page: 1, pageSize: 1 })).resolves.toMatchObject({ total: expect.any(Number), page: 1, pageSize: 1 });
        await expect(repository.getSchoolContextByUserId(id("teacher-user"))).resolves.toMatchObject({ school: { id: id("school-a") }, membership: { id: id("teacher") } });
        await expect(repository.getMembership(id("school-a"), id("other"))).resolves.toBeNull();
        await expect(repository.listAssignedCourses(id("school-b"), { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0, items: [] });
        await expect(repository.listAssignmentsForStudent(id("school-a"), id("student"), { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ id: id("teaching") }] });
        await expect(repository.compareAndSetCommercialOrderStatus(id("school-a"), id("order"), "assigned", "in_progress", now)).resolves.toBe(true);
        await expect(repository.compareAndSetCommercialOrderStatus(id("school-a"), id("order"), "assigned", "submitted", now)).resolves.toBe(false);
        await expect(repository.getCommercialOrder(id("school-b"), id("order"))).resolves.toBeNull();

        await expect(repository.getSchool(id("school-a"), true)).resolves.toMatchObject({ name: "甲学校" });
        await expect(repository.updateSchool(id("school-a"), { name: "甲学校新名", profile: { city: "杭州" }, updatedAt: now })).resolves.toMatchObject({ name: "甲学校新名", profile: { city: "杭州" } });
        await expect(repository.getMembershipByUserId(id("teacher-user"), true)).resolves.toMatchObject({ id: id("teacher") });
        await expect(repository.updateMembership(id("school-b"), id("teacher"), { status: "disabled", updatedAt: now })).resolves.toBeNull();
        await expect(repository.updateMembership(id("school-a"), id("teacher"), { permissions: ["school.manage"], updatedAt: now })).resolves.toMatchObject({ permissions: ["school.manage"] });
        await repository.upsertInviteCode({ id: id("invite"), schoolId: id("school-a"), role: "student", codeDigest: id("digest"), status: "active", createdAt: now, updatedAt: now });
        await expect(repository.upsertInviteCode({ id: id("other-invite"), schoolId: id("school-b"), role: "teacher", codeDigest: id("digest"), status: "active", createdAt: now, updatedAt: now })).rejects.toThrow();
        await expect(repository.getInviteCodeByRole(id("school-a"), "student", true)).resolves.toMatchObject({ codeDigest: id("digest") });
        await expect(repository.getInviteCodeByDigest(id("digest"), true)).resolves.toMatchObject({ schoolId: id("school-a") });
        await expect(repository.getInviteCodeByRole(id("school-b"), "student")).resolves.toBeNull();
        await expect(repository.getClass(id("school-a"), id("class"), true)).resolves.toMatchObject({ name: "一班" });
        await expect(repository.updateClass(id("school-b"), id("class"), { name: "越权", updatedAt: now })).resolves.toBeNull();
        await expect(repository.updateClass(id("school-a"), id("class"), { description: "更新", updatedAt: now })).resolves.toMatchObject({ description: "更新" });
        await expect(repository.listClassMembers(id("school-a"), id("class"), { page: 1, pageSize: 20 })).resolves.toMatchObject({
            total: 2,
            items: expect.arrayContaining([expect.objectContaining({ id: id("teacher") }), expect.objectContaining({ id: id("student") })]),
        });
        await expect(repository.deleteMembership(id("school-a"), id("other"))).resolves.toBe(false);
        await expect(repository.deleteMembership(id("school-b"), id("other"))).resolves.toBe(true);
    });

    postgresIt("rolls back a failed transaction", async () => {
        const repository = createSchoolDomainRepository();
        await expect(
            repository.transact(async (transaction) => {
                await transaction.insertSchool(school(id("rolled-back"), "回滚学校"));
                throw new Error("stop");
            }),
        ).rejects.toThrow("stop");
        await expect(repository.listSchools({ page: 1, pageSize: 100, keyword: id("rolled-back") })).resolves.toMatchObject({ total: 0, items: [] });

        const bundledRepository = createPostgresRepositories().schoolDomain;
        await expect(
            bundledRepository.transact(async (transaction) => {
                await transaction.insertSchool(school(id("bundled-rolled-back"), "组合仓储回滚学校"));
                throw new Error("stop");
            }),
        ).rejects.toThrow("stop");
        await expect(bundledRepository.listSchools({ page: 1, pageSize: 100, keyword: id("bundled-rolled-back") })).resolves.toMatchObject({ total: 0, items: [] });
    });
});

function school(schoolId: string, name: string) {
    return { id: schoolId, name, profile: {}, status: "active" as const, createdAt: now, updatedAt: now };
}

function membership(membershipId: string, schoolId: string, userId: string, role: "teacher" | "student") {
    return { id: membershipId, schoolId, userId, role, permissions: [], status: "active" as const, joinSource: "admin" as const, createdAt: now, updatedAt: now };
}

function order(orderId: string, assignedSchoolId: string | undefined, status: "draft" | "assigned" | "cancelled") {
    return { id: orderId, title: "商单", requirements: "", referenceMaterials: [], acceptanceCriteria: "", internalAmountCents: 100, assignedSchoolId, status, platformFeedback: "", createdAt: now, updatedAt: now };
}

function participant(participantId: string) {
    return { id: participantId, schoolId: id("school-a"), orderId: id("order"), membershipId: id("student"), candidateReferences: [], note: "", status: "active" as const, createdAt: now, updatedAt: now };
}
