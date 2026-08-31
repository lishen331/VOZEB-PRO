import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POSTGRESQL_SCHOOL_DOMAIN_SCHEMA_SQL } from "./schema-school-domain";
import { initializePostgresSchema, postgresQuery } from "./postgres";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;
const postgresLegacyIt = process.env.VOZEB_RUN_POSTGRES_LEGACY_UPGRADE === "1" ? it : it.skip;
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
    it("declares legacy column upgrades before dependent indexes", () => {
        const ddl = POSTGRESQL_SCHOOL_DOMAIN_SCHEMA_SQL.toLowerCase();
        const addCourseDeletedAt = ddl.indexOf("alter table platform_courses add column if not exists deleted_at");
        const addCourseDeletedBy = ddl.indexOf("alter table platform_courses add column if not exists deleted_by_user_id");
        const addAssignmentChapter = ddl.indexOf("alter table teaching_assignments add column if not exists chapter_id");
        const addAssignmentLesson = ddl.indexOf("alter table teaching_assignments add column if not exists lesson_id");
        const courseIndex = ddl.indexOf("create index if not exists platform_courses_status_updated_idx");
        const assignmentChapterIndex = ddl.indexOf("create index if not exists teaching_assignments_school_chapter_idx");
        const assignmentLessonIndex = ddl.indexOf("create index if not exists teaching_assignments_school_lesson_idx");

        expect(addCourseDeletedAt).toBeGreaterThan(-1);
        expect(addCourseDeletedBy).toBeGreaterThan(-1);
        expect(addAssignmentChapter).toBeGreaterThan(-1);
        expect(addAssignmentLesson).toBeGreaterThan(-1);
        expect(addCourseDeletedAt).toBeLessThan(courseIndex);
        expect(addCourseDeletedBy).toBeLessThan(courseIndex);
        expect(addAssignmentChapter).toBeLessThan(assignmentChapterIndex);
        expect(addAssignmentLesson).toBeLessThan(assignmentLessonIndex);
        expect(ddl).toContain("from pg_constraint");
    });

    postgresLegacyIt("upgrades legacy course tables without deleting JSON data", async () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error("DATABASE_URL must point to a dedicated PostgreSQL test database");

        const client = new Client({ connectionString });
        const schemaName = `legacy_school_${randomUUID().replaceAll("-", "")}`;
        const schemaIdentifier = `"${schemaName}"`;
        await client.connect();
        try {
            await client.query(`CREATE SCHEMA ${schemaIdentifier}`);
            await client.query(`SET search_path TO ${schemaIdentifier}`);
            await client.query("CREATE TABLE users (id text PRIMARY KEY)");
            await client.query("INSERT INTO users (id) VALUES ('legacy-user')");
            await client.query(`
                CREATE TABLE platform_courses (
                    id text PRIMARY KEY,
                    title text NOT NULL,
                    summary text NOT NULL DEFAULT '',
                    content jsonb NOT NULL DEFAULT '{}'::jsonb,
                    chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
                    attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
                    status text NOT NULL DEFAULT 'draft',
                    created_by_user_id text REFERENCES users(id),
                    created_at timestamptz NOT NULL DEFAULT now(),
                    updated_at timestamptz NOT NULL DEFAULT now()
                )
            `);
            await client.query(`
                CREATE TABLE teaching_assignments (
                    id text PRIMARY KEY,
                    school_id text NOT NULL,
                    offering_id text NOT NULL,
                    teacher_membership_id text NOT NULL,
                    kind text NOT NULL,
                    title text NOT NULL,
                    instructions text NOT NULL DEFAULT '',
                    resources jsonb NOT NULL DEFAULT '[]'::jsonb,
                    due_at timestamptz,
                    status text NOT NULL DEFAULT 'draft',
                    created_at timestamptz NOT NULL DEFAULT now(),
                    updated_at timestamptz NOT NULL DEFAULT now(),
                    UNIQUE (school_id, id)
                )
            `);
            await client.query("INSERT INTO platform_courses (id, title, chapters, attachments) VALUES ('legacy-course', '旧课程', '[{\"title\":\"旧章节\"}]', '[{\"name\":\"旧附件\"}]')");
            await client.query(POSTGRESQL_SCHOOL_DOMAIN_SCHEMA_SQL);
            await client.query(POSTGRESQL_SCHOOL_DOMAIN_SCHEMA_SQL);

            const columns = await client.query<{ table_name: string; column_name: string }>("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name IN ('platform_courses', 'teaching_assignments')", [
                schemaName,
            ]);
            const tables = await client.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('platform_course_chapters', 'platform_course_lessons', 'course_materials')", [schemaName]);
            const indexes = await client.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname IN ('teaching_assignments_school_chapter_idx', 'teaching_assignments_school_lesson_idx')", [schemaName]);
            const legacyCourse = await client.query<{ chapters: unknown; attachments: unknown }>("SELECT chapters, attachments FROM platform_courses WHERE id = 'legacy-course'");

            expect(columns.rows.filter((row) => row.table_name === "platform_courses").map((row) => row.column_name)).toEqual(expect.arrayContaining(["deleted_at", "deleted_by_user_id", "chapters", "attachments"]));
            expect(columns.rows.filter((row) => row.table_name === "teaching_assignments").map((row) => row.column_name)).toEqual(expect.arrayContaining(["chapter_id", "lesson_id"]));
            expect(tables.rows.map((row) => row.table_name)).toEqual(expect.arrayContaining(["platform_course_chapters", "platform_course_lessons", "course_materials"]));
            expect(indexes.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining(["teaching_assignments_school_chapter_idx", "teaching_assignments_school_lesson_idx"]));
            expect(legacyCourse.rows[0]).toEqual({ chapters: [{ title: "旧章节" }], attachments: [{ name: "旧附件" }] });
        } finally {
            await client.query(`DROP SCHEMA ${schemaIdentifier} CASCADE`);
            await client.end();
        }
    });

    postgresIt("creates one prefixed course soft-delete foreign key", async () => {
        const result = await postgresQuery<{ total: string }>("SELECT count(*)::text AS total FROM pg_constraint WHERE conrelid = 'platform_courses'::regclass AND conname = 'platform_courses_deleted_by_user_id_fkey'");

        expect(result.rows[0]?.total).toBe("1");
    });

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
