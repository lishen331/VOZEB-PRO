import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { starterLessonPlan } from "@/lib/teaching-lesson-plan";
import { createTeachingLessonPlanRepository, type LessonPlanRecord } from "@/lib/server/teaching-lesson-plan-repository";
import { initializePostgresSchema, postgresQuery } from "./postgres";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;
const suffix = randomUUID();
const ids = {
    user: `lesson-plan-user-${suffix}`,
    school: `lesson-plan-school-${suffix}`,
    membership: `lesson-plan-member-${suffix}`,
    course: `lesson-plan-course-${suffix}`,
    chapter: `lesson-plan-chapter-${suffix}`,
    lesson: `lesson-plan-lesson-${suffix}`,
    assignment: `lesson-plan-assignment-${suffix}`,
};
const key = { schoolId: ids.school, assignmentId: ids.assignment, lessonId: ids.lesson, teacherMembershipId: ids.membership };

function draft(updatedAt: string): LessonPlanRecord {
    return { id: `lesson-plan-${suffix}`, ...key, status: "draft", content: starterLessonPlan({ title: "情绪板" }), lastRehearsal: null, rehearsalCount: 0, createdAt: updatedAt, updatedAt };
}

describe("PostgreSQL teaching lesson plans", () => {
    beforeAll(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION !== "1") return;
        if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL must point to a dedicated PostgreSQL test database");
        await initializePostgresSchema();
        await postgresQuery("INSERT INTO users (id, username, display_name, password_hash) VALUES ($1, $2, $3, $4)", [ids.user, `lesson_plan_${suffix.replaceAll("-", "").slice(0, 12)}`, "教案测试老师", "integration-test-only"]);
        await postgresQuery("INSERT INTO schools (id, name) VALUES ($1, $2)", [ids.school, "教案测试学校"]);
        await postgresQuery("INSERT INTO school_memberships (id, school_id, user_id, role) VALUES ($1, $2, $3, 'teacher')", [ids.membership, ids.school, ids.user]);
        await postgresQuery("INSERT INTO platform_courses (id, title, status) VALUES ($1, $2, 'published')", [ids.course, "教案测试课程"]);
        await postgresQuery("INSERT INTO platform_course_chapters (id, course_id, title) VALUES ($1, $2, $3)", [ids.chapter, ids.course, "第一章"]);
        await postgresQuery("INSERT INTO platform_course_lessons (id, course_id, chapter_id, title) VALUES ($1, $2, $3, $4)", [ids.lesson, ids.course, ids.chapter, "情绪板"]);
        await postgresQuery("INSERT INTO school_course_assignments (id, course_id, school_id) VALUES ($1, $2, $3)", [ids.assignment, ids.course, ids.school]);
    });

    afterAll(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION !== "1") return;
        await postgresQuery("DELETE FROM platform_courses WHERE id = $1", [ids.course]);
        await postgresQuery("DELETE FROM schools WHERE id = $1", [ids.school]);
        await postgresQuery("DELETE FROM users WHERE id = $1", [ids.user]);
    });

    postgresIt("creates, updates with optimistic locking, and records rehearsals", async () => {
        const repository = createTeachingLessonPlanRepository();
        const created = await repository.savePlan(draft("2026-10-29T10:00:00.000Z"), null);
        expect(created?.status).toBe("draft");
        expect(await repository.savePlan(draft("2026-10-29T10:01:00.000Z"), null)).toBeNull();

        const updated = await repository.savePlan({ ...draft("2026-10-29T10:02:00.000Z"), status: "ready" }, created!.updatedAt);
        expect(updated?.status).toBe("ready");
        expect(await repository.savePlan(draft("2026-10-29T10:03:00.000Z"), created!.updatedAt)).toBeNull();

        const rehearsed = await repository.recordRehearsal(key, { at: "2026-10-29T10:04:00.000Z", totalSeconds: 90, phases: [] });
        expect(rehearsed?.rehearsalCount).toBe(1);
        expect(rehearsed?.updatedAt).toBe(updated!.updatedAt);
        expect((await repository.listPlans(ids.school, ids.membership, ids.assignment)).map((item) => item.status)).toEqual(["ready"]);
    });

    postgresIt("removes plans when the school course assignment is deleted", async () => {
        await postgresQuery("DELETE FROM school_course_assignments WHERE id = $1", [ids.assignment]);
        const rows = await postgresQuery<{ count: string }>("SELECT count(*) FROM teaching_lesson_plans WHERE school_id = $1", [ids.school]);
        expect(Number(rows.rows[0].count)).toBe(0);
    });
});
