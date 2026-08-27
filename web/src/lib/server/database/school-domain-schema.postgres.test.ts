import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { initializePostgresSchema, postgresQuery } from "./postgres";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;
const suffix = randomUUID();
const ids = {
    schoolA: `school-schema-a-${suffix}`,
    schoolB: `school-schema-b-${suffix}`,
    userA: `school-schema-user-a-${suffix}`,
    userB: `school-schema-user-b-${suffix}`,
    membershipA: `school-schema-membership-a-${suffix}`,
    membershipB: `school-schema-membership-b-${suffix}`,
    classA: `school-schema-class-a-${suffix}`,
    course: `school-schema-course-${suffix}`,
    assignment: `school-schema-assignment-${suffix}`,
    materialAssignmentA: `school-schema-material-assignment-a-${suffix}`,
    assignmentB: `school-schema-assignment-b-${suffix}`,
    chapter: `school-schema-chapter-${suffix}`,
    lesson: `school-schema-lesson-${suffix}`,
    material: `school-schema-material-${suffix}`,
    inviteA: `school-schema-invite-a-${suffix}`,
    inviteB: `school-schema-invite-b-${suffix}`,
    order: `school-schema-order-${suffix}`,
};

describe("PostgreSQL school domain schema", () => {
    beforeAll(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION !== "1") return;
        if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL must point to a dedicated PostgreSQL test database");
        await initializePostgresSchema();
        await postgresQuery("INSERT INTO users (id, username, display_name, password_hash) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)", [
            ids.userA,
            `school_schema_a_${suffix.replaceAll("-", "").slice(0, 12)}`,
            "学校 Schema 用户 A",
            "integration-test-only",
            ids.userB,
            `school_schema_b_${suffix.replaceAll("-", "").slice(0, 12)}`,
            "学校 Schema 用户 B",
            "integration-test-only",
        ]);
        await postgresQuery("INSERT INTO schools (id, name) VALUES ($1, $2), ($3, $4)", [ids.schoolA, "Schema 测试学校 A", ids.schoolB, "Schema 测试学校 B"]);
        await postgresQuery("INSERT INTO school_memberships (id, school_id, user_id, role) VALUES ($1, $2, $3, 'teacher'), ($4, $5, $6, 'student')", [ids.membershipA, ids.schoolA, ids.userA, ids.membershipB, ids.schoolB, ids.userB]);
        await postgresQuery("INSERT INTO school_classes (id, school_id, name) VALUES ($1, $2, $3)", [ids.classA, ids.schoolA, "Schema 测试班级"]);
        await postgresQuery("INSERT INTO platform_courses (id, title, status) VALUES ($1, $2, 'published')", [ids.course, "Schema 测试课程"]);
    });

    afterAll(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION !== "1") return;
        await postgresQuery("DELETE FROM commercial_orders WHERE id = ANY($1::text[])", [[ids.order, `unassigned-config-${suffix}`]]);
        await postgresQuery("DELETE FROM school_invite_codes WHERE school_id IN ($1, $2)", [ids.schoolA, ids.schoolB]);
        await postgresQuery("DELETE FROM platform_courses WHERE id = ANY($1::text[])", [[ids.course, ids.course + "-b", ids.course + "-c"]]);
        await postgresQuery("DELETE FROM school_classes WHERE id = $1", [ids.classA]);
        await postgresQuery("DELETE FROM school_memberships WHERE id IN ($1, $2)", [ids.membershipA, ids.membershipB]);
        await postgresQuery("DELETE FROM schools WHERE id IN ($1, $2)", [ids.schoolA, ids.schoolB]);
        await postgresQuery("DELETE FROM users WHERE id IN ($1, $2)", [ids.userA, ids.userB]);
    });

    postgresIt("enforces one school membership per user", async () => {
        await expect(postgresQuery("INSERT INTO school_memberships (id, school_id, user_id, role) VALUES ($1, $2, $3, 'teacher')", [`duplicate-membership-${suffix}`, ids.schoolB, ids.userA])).rejects.toMatchObject({ code: "23505" });
    });

    postgresIt("enforces one course assignment per school", async () => {
        await postgresQuery("INSERT INTO school_course_assignments (id, course_id, school_id) VALUES ($1, $2, $3)", [ids.assignment, ids.course, ids.schoolA]);
        await expect(postgresQuery("INSERT INTO school_course_assignments (id, course_id, school_id) VALUES ($1, $2, $3)", [`duplicate-assignment-${suffix}`, ids.course, ids.schoolA])).rejects.toMatchObject({ code: "23505" });
    });

    postgresIt("rejects a class membership from another school", async () => {
        await expect(postgresQuery("INSERT INTO school_class_members (id, school_id, class_id, membership_id) VALUES ($1, $2, $3, $4)", [`cross-school-class-member-${suffix}`, ids.schoolA, ids.classA, ids.membershipB])).rejects.toMatchObject({
            code: "23503",
        });
    });

    postgresIt("keeps one invite code per school role", async () => {
        await postgresQuery("INSERT INTO school_invite_codes (id, school_id, role, code_digest) VALUES ($1, $2, 'teacher', $3)", [ids.inviteA, ids.schoolA, `digest-a-${suffix}`]);
        await expect(postgresQuery("INSERT INTO school_invite_codes (id, school_id, role, code_digest) VALUES ($1, $2, 'teacher', $3)", [ids.inviteB, ids.schoolA, `digest-b-${suffix}`])).rejects.toMatchObject({ code: "23505" });
    });

    postgresIt("stores one assigned school directly on each commercial order", async () => {
        await postgresQuery("INSERT INTO commercial_orders (id, title, internal_amount_cents, assigned_school_id, status) VALUES ($1, $2, $3, $4, 'assigned')", [ids.order, "Schema 测试商单", 1250, ids.schoolA]);
        const columns = await postgresQuery<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vozeb_pro_commercial_orders'");
        const collaborationTables = await postgresQuery<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vozeb_pro_commercial_order_schools'");

        expect(columns.rows.map((row) => row.column_name)).toContain("assigned_school_id");
        expect(collaborationTables.rows).toEqual([]);
    });

    postgresIt("rejects commercial order configuration before school assignment", async () => {
        await expect(
            postgresQuery("INSERT INTO commercial_orders (id, title, internal_amount_cents, teacher_membership_id, status) VALUES ($1, $2, $3, $4, 'draft')", [`unassigned-config-${suffix}`, "错误商单", 100, ids.membershipA]),
        ).rejects.toMatchObject({ code: "23514" });
    });

    postgresIt("enforces normalized course material targets and same-course school assignment", async () => {
        await postgresQuery("INSERT INTO platform_courses (id, title, status) VALUES ($1, $2, 'published'), ($3, $4, 'published')", [ids.course + "-b", "Schema 测试课程 B", ids.course + "-c", "Schema 测试课程 C"]);
        await postgresQuery("INSERT INTO school_course_assignments (id, course_id, school_id) VALUES ($1, $2, $3), ($4, $5, $6)", [ids.materialAssignmentA, ids.course + "-b", ids.schoolA, ids.assignmentB, ids.course + "-c", ids.schoolB]);
        await postgresQuery("INSERT INTO platform_course_chapters (id, course_id, title) VALUES ($1, $2, $3)", [ids.chapter, ids.course + "-b", "第一章"]);
        await postgresQuery("INSERT INTO platform_course_lessons (id, course_id, chapter_id, title) VALUES ($1, $2, $3, $4)", [ids.lesson, ids.course + "-b", ids.chapter, "第一课时"]);
        await expect(
            postgresQuery(
                "INSERT INTO course_materials (id, course_id, chapter_id, source_scope, school_course_assignment_id, title, file_name, mime_type, bytes, storage_key, url) VALUES ($1, $2, $3, 'school', $4, '越权', 'x.zip', 'application/zip', 1, 'x.zip', '/x')",
                [ids.material, ids.course + "-b", ids.chapter, ids.assignmentB],
            ),
        ).rejects.toMatchObject({ code: "23503" });
        await expect(
            postgresQuery("INSERT INTO course_materials (id, course_id, source_scope, title, file_name, mime_type, bytes, storage_key, url) VALUES ($1, $2, 'platform', '无目标', 'x.zip', 'application/zip', 1, 'x.zip', '/x')", [
                ids.material + "-none",
                ids.course + "-b",
            ]),
        ).rejects.toMatchObject({ code: "23514" });
        await expect(
            postgresQuery(
                "INSERT INTO course_materials (id, course_id, chapter_id, lesson_id, source_scope, title, file_name, mime_type, bytes, storage_key, url) VALUES ($1, $2, $3, $4, 'platform', '双目标', 'x.zip', 'application/zip', 1, 'x.zip', '/x')",
                [ids.material + "-both", ids.course + "-b", ids.chapter, ids.lesson],
            ),
        ).rejects.toMatchObject({ code: "23514" });
    });
});
