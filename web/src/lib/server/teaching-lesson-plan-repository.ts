import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "@/lib/server/data-adapter";
import { getDatabaseProvider, postgresQuery, type QueryExecutor } from "@/lib/server/database/postgres";
import { isoValue, jsonParam, numberValue, stringValue } from "@/lib/server/database/repository-utils";
import type { JsonValue } from "@/lib/server/database/repository-types";
import { normalizeLessonPlanContent, type LessonPlanContent, type LessonPlanRehearsal, type LessonPlanStatus } from "@/lib/teaching-lesson-plan";

/*
 * 备课教案的存储：Postgres 新表 teaching_lesson_plans，file 数据库模式下存 teaching-lesson-plans.json。
 * 保存走乐观锁：expectedUpdatedAt 为 null 表示「新建」，否则只有库里的 updated_at 一致才写入，
 * 不一致返回 null，由服务层报 409（另一个标签页 / 另一台电脑已经改过）。
 */

export type LessonPlanRecord = {
    id: string;
    schoolId: string;
    assignmentId: string;
    lessonId: string;
    teacherMembershipId: string;
    status: LessonPlanStatus;
    content: LessonPlanContent;
    lastRehearsal: LessonPlanRehearsal | null;
    rehearsalCount: number;
    createdAt: string;
    updatedAt: string;
};

export type LessonPlanKey = { schoolId: string; assignmentId: string; lessonId: string; teacherMembershipId: string };

export interface TeachingLessonPlanRepository {
    getPlan(key: LessonPlanKey): Promise<LessonPlanRecord | null>;
    listPlans(schoolId: string, teacherMembershipId: string, assignmentId?: string): Promise<LessonPlanRecord[]>;
    /** expectedUpdatedAt=null 只新建；否则按版本覆盖。版本不对返回 null */
    savePlan(record: LessonPlanRecord, expectedUpdatedAt: string | null): Promise<LessonPlanRecord | null>;
    recordRehearsal(key: LessonPlanKey, rehearsal: LessonPlanRehearsal): Promise<LessonPlanRecord | null>;
}

export function createTeachingLessonPlanRepository(executor?: QueryExecutor): TeachingLessonPlanRepository {
    if (executor) return new PostgresLessonPlanRepository(executor);
    return getDatabaseProvider() === "file" ? new FileLessonPlanRepository() : new PostgresLessonPlanRepository({ query: postgresQuery });
}

/* ===== Postgres ===== */

class PostgresLessonPlanRepository implements TeachingLessonPlanRepository {
    constructor(private readonly db: QueryExecutor) {}

    async getPlan(key: LessonPlanKey) {
        const result = await this.db.query("SELECT * FROM teaching_lesson_plans WHERE school_id = $1 AND assignment_id = $2 AND lesson_id = $3 AND teacher_membership_id = $4", [key.schoolId, key.assignmentId, key.lessonId, key.teacherMembershipId]);
        return result.rows[0] ? mapPlan(result.rows[0]) : null;
    }

    async listPlans(schoolId: string, teacherMembershipId: string, assignmentId?: string) {
        const result = await this.db.query("SELECT * FROM teaching_lesson_plans WHERE school_id = $1 AND teacher_membership_id = $2 AND ($3::text IS NULL OR assignment_id = $3) ORDER BY updated_at DESC, id DESC LIMIT 2000", [
            schoolId,
            teacherMembershipId,
            assignmentId || null,
        ]);
        return result.rows.map(mapPlan);
    }

    async savePlan(record: LessonPlanRecord, expectedUpdatedAt: string | null) {
        const content = jsonParam(record.content as unknown as JsonValue);
        if (expectedUpdatedAt === null) {
            const inserted = await this.db.query(
                `INSERT INTO teaching_lesson_plans (id, school_id, assignment_id, lesson_id, teacher_membership_id, status, content, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
                 ON CONFLICT (school_id, assignment_id, lesson_id, teacher_membership_id) DO NOTHING
                 RETURNING *`,
                [record.id, record.schoolId, record.assignmentId, record.lessonId, record.teacherMembershipId, record.status, content, record.createdAt, record.updatedAt],
            );
            return inserted.rows[0] ? mapPlan(inserted.rows[0]) : null;
        }
        const updated = await this.db.query(
            `UPDATE teaching_lesson_plans SET status = $5, content = $6::jsonb, updated_at = $7
             WHERE school_id = $1 AND assignment_id = $2 AND lesson_id = $3 AND teacher_membership_id = $4 AND updated_at = $8::timestamptz
             RETURNING *`,
            [record.schoolId, record.assignmentId, record.lessonId, record.teacherMembershipId, record.status, content, record.updatedAt, expectedUpdatedAt],
        );
        return updated.rows[0] ? mapPlan(updated.rows[0]) : null;
    }

    async recordRehearsal(key: LessonPlanKey, rehearsal: LessonPlanRehearsal) {
        const result = await this.db.query(
            `UPDATE teaching_lesson_plans SET last_rehearsal = $5::jsonb, rehearsal_count = rehearsal_count + 1
             WHERE school_id = $1 AND assignment_id = $2 AND lesson_id = $3 AND teacher_membership_id = $4
             RETURNING *`,
            [key.schoolId, key.assignmentId, key.lessonId, key.teacherMembershipId, jsonParam(rehearsal as unknown as JsonValue)],
        );
        return result.rows[0] ? mapPlan(result.rows[0]) : null;
    }
}

function mapPlan(row: Record<string, unknown>): LessonPlanRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        assignmentId: stringValue(row.assignment_id),
        lessonId: stringValue(row.lesson_id),
        teacherMembershipId: stringValue(row.teacher_membership_id),
        status: row.status === "ready" ? "ready" : "draft",
        content: normalizeLessonPlanContent(row.content),
        lastRehearsal: row.last_rehearsal && typeof row.last_rehearsal === "object" ? (row.last_rehearsal as LessonPlanRehearsal) : null,
        rehearsalCount: numberValue(row.rehearsal_count),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

/* ===== file 数据库（本地 / e2e） ===== */

export const TEACHING_LESSON_PLAN_DATA_FILE = "teaching-lesson-plans.json";

type LessonPlanFile = { version: 1; plans: LessonPlanRecord[] };
const EMPTY_FILE: LessonPlanFile = { version: 1, plans: [] };

const sameKey = (record: LessonPlanRecord, key: LessonPlanKey) => record.schoolId === key.schoolId && record.assignmentId === key.assignmentId && record.lessonId === key.lessonId && record.teacherMembershipId === key.teacherMembershipId;

function normalizeFile(value: Partial<LessonPlanFile> | null): LessonPlanFile {
    return { version: 1, plans: Array.isArray(value?.plans) ? value.plans : [] };
}

class FileLessonPlanRepository implements TeachingLessonPlanRepository {
    private async read() {
        return normalizeFile(await readJsonDataFile<Partial<LessonPlanFile>>(TEACHING_LESSON_PLAN_DATA_FILE, EMPTY_FILE));
    }

    private mutate<T>(operation: (state: LessonPlanFile) => T): Promise<T> {
        return withJsonDataFileLock(TEACHING_LESSON_PLAN_DATA_FILE, async () => {
            const state = await this.read();
            const result = operation(state);
            await writeJsonDataFile(TEACHING_LESSON_PLAN_DATA_FILE, state);
            return result;
        });
    }

    async getPlan(key: LessonPlanKey) {
        const found = (await this.read()).plans.find((item) => sameKey(item, key));
        return found ? structuredClone(found) : null;
    }

    async listPlans(schoolId: string, teacherMembershipId: string, assignmentId?: string) {
        return (await this.read()).plans
            .filter((item) => item.schoolId === schoolId && item.teacherMembershipId === teacherMembershipId && (!assignmentId || item.assignmentId === assignmentId))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
            .map((item) => structuredClone(item));
    }

    savePlan(record: LessonPlanRecord, expectedUpdatedAt: string | null) {
        return this.mutate((state) => {
            const index = state.plans.findIndex((item) => sameKey(item, record));
            if (expectedUpdatedAt === null) {
                if (index >= 0) return null;
                state.plans.push(structuredClone(record));
                return structuredClone(record);
            }
            const current = state.plans[index];
            if (!current || current.updatedAt !== expectedUpdatedAt) return null;
            const next = { ...current, status: record.status, content: structuredClone(record.content), updatedAt: record.updatedAt };
            state.plans[index] = next;
            return structuredClone(next);
        });
    }

    recordRehearsal(key: LessonPlanKey, rehearsal: LessonPlanRehearsal) {
        return this.mutate((state) => {
            const index = state.plans.findIndex((item) => sameKey(item, key));
            const current = state.plans[index];
            if (!current) return null;
            const next = { ...current, lastRehearsal: structuredClone(rehearsal), rehearsalCount: current.rehearsalCount + 1 };
            state.plans[index] = next;
            return structuredClone(next);
        });
    }
}
