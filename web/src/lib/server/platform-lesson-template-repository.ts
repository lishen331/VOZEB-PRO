import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "@/lib/server/data-adapter";
import { getDatabaseProvider, postgresQuery, type QueryExecutor } from "@/lib/server/database/postgres";
import { isoValue, jsonParam, stringValue } from "@/lib/server/database/repository-utils";
import type { JsonValue } from "@/lib/server/database/repository-types";
import { normalizeLessonTemplateContent, type LessonPlanContent, type PlatformLessonTemplate } from "@/lib/teaching-lesson-plan";

/*
 * 平台标准教案的存储：Postgres 表 platform_lesson_plan_templates（每个课时一行），
 * file 数据库模式下存 platform-lesson-templates.json。课时删除时 Postgres 外键级联删除；
 * file 库里残留的孤儿记录不会被读到（读取前服务层先确认课时存在）。
 */

export type LessonTemplateRecord = {
    lessonId: string;
    content: LessonPlanContent;
    updatedByUserId: string;
    createdAt: string;
    updatedAt: string;
};

export interface PlatformLessonTemplateRepository {
    getTemplate(lessonId: string): Promise<LessonTemplateRecord | null>;
    /** 有则覆盖，没有则新建；createdAt 只在新建时生效 */
    saveTemplate(record: LessonTemplateRecord): Promise<LessonTemplateRecord>;
    deleteTemplate(lessonId: string): Promise<boolean>;
}

export function toLessonTemplate(record: LessonTemplateRecord): PlatformLessonTemplate {
    return { lessonId: record.lessonId, content: record.content, createdAt: record.createdAt, updatedAt: record.updatedAt };
}

export function createPlatformLessonTemplateRepository(executor?: QueryExecutor): PlatformLessonTemplateRepository {
    if (executor) return new PostgresLessonTemplateRepository(executor);
    return getDatabaseProvider() === "file" ? new FileLessonTemplateRepository() : new PostgresLessonTemplateRepository({ query: postgresQuery });
}

class PostgresLessonTemplateRepository implements PlatformLessonTemplateRepository {
    constructor(private readonly db: QueryExecutor) {}

    async getTemplate(lessonId: string) {
        const result = await this.db.query("SELECT * FROM platform_lesson_plan_templates WHERE lesson_id = $1", [lessonId]);
        return result.rows[0] ? mapTemplate(result.rows[0]) : null;
    }

    async saveTemplate(record: LessonTemplateRecord) {
        const result = await this.db.query(
            `INSERT INTO platform_lesson_plan_templates (lesson_id, content, updated_by_user_id, created_at, updated_at)
             VALUES ($1, $2::jsonb, $3, $4, $5)
             ON CONFLICT (lesson_id) DO UPDATE SET content = EXCLUDED.content, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = EXCLUDED.updated_at
             RETURNING *`,
            [record.lessonId, jsonParam(record.content as unknown as JsonValue), record.updatedByUserId, record.createdAt, record.updatedAt],
        );
        return mapTemplate(result.rows[0]);
    }

    async deleteTemplate(lessonId: string) {
        const result = await this.db.query("DELETE FROM platform_lesson_plan_templates WHERE lesson_id = $1 RETURNING lesson_id", [lessonId]);
        return result.rows.length > 0;
    }
}

function mapTemplate(row: Record<string, unknown>): LessonTemplateRecord {
    return {
        lessonId: stringValue(row.lesson_id),
        content: normalizeLessonTemplateContent(row.content),
        updatedByUserId: stringValue(row.updated_by_user_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

export const PLATFORM_LESSON_TEMPLATE_DATA_FILE = "platform-lesson-templates.json";

type TemplateFile = { version: 1; templates: LessonTemplateRecord[] };
const EMPTY_FILE: TemplateFile = { version: 1, templates: [] };

class FileLessonTemplateRepository implements PlatformLessonTemplateRepository {
    private async read(): Promise<TemplateFile> {
        const value = await readJsonDataFile<Partial<TemplateFile>>(PLATFORM_LESSON_TEMPLATE_DATA_FILE, EMPTY_FILE);
        return { version: 1, templates: Array.isArray(value?.templates) ? value.templates : [] };
    }

    private mutate<T>(operation: (state: TemplateFile) => T): Promise<T> {
        return withJsonDataFileLock(PLATFORM_LESSON_TEMPLATE_DATA_FILE, async () => {
            const state = await this.read();
            const result = operation(state);
            await writeJsonDataFile(PLATFORM_LESSON_TEMPLATE_DATA_FILE, state);
            return result;
        });
    }

    async getTemplate(lessonId: string) {
        const found = (await this.read()).templates.find((item) => item.lessonId === lessonId);
        return found ? { ...structuredClone(found), content: normalizeLessonTemplateContent(found.content) } : null;
    }

    saveTemplate(record: LessonTemplateRecord) {
        return this.mutate((state) => {
            const index = state.templates.findIndex((item) => item.lessonId === record.lessonId);
            const current = state.templates[index];
            const next = current ? { ...structuredClone(record), createdAt: current.createdAt } : structuredClone(record);
            if (current) state.templates[index] = next;
            else state.templates.push(next);
            return structuredClone(next);
        });
    }

    deleteTemplate(lessonId: string) {
        return this.mutate((state) => {
            const before = state.templates.length;
            state.templates = state.templates.filter((item) => item.lessonId !== lessonId);
            return state.templates.length !== before;
        });
    }
}
