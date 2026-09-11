import { randomUUID } from "node:crypto";

import { ensurePostgresSchema, getDatabaseProvider, postgresQuery } from "@/lib/server/database";
import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "@/lib/server/data-adapter";
import { normalizeDramaLabStoryOption, type DramaLabStoryOptionKind } from "@/lib/drama-lab-story-options";

const FILE_NAME = "drama-lab-story-options.json";
type StoredFile = { version: 1; options: Record<string, { styles: string[]; types: string[] }> };
const EMPTY_FILE: StoredFile = { version: 1, options: {} };

export class DramaLabStoryOptionError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "DramaLabStoryOptionError";
    }
}

function normalizeKind(value: unknown): DramaLabStoryOptionKind {
    if (value === "style" || value === "type") return value;
    throw new DramaLabStoryOptionError("自定义选项类型无效");
}

function sorted(values: string[]) {
    return [...new Set(values.map((value) => normalizeDramaLabStoryOption(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function listDramaLabStoryOptions(userId: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ kind: DramaLabStoryOptionKind; value: string }>("SELECT kind, value FROM drama_lab_story_options WHERE user_id=$1 ORDER BY created_at ASC, id ASC", [userId]);
        return {
            styles: sorted(result.rows.filter((row) => row.kind === "style").map((row) => row.value)),
            types: sorted(result.rows.filter((row) => row.kind === "type").map((row) => row.value)),
        };
    }
    const state = await readJsonDataFile<StoredFile>(FILE_NAME, EMPTY_FILE);
    const record = state.options[userId];
    return { styles: sorted(record?.styles || []), types: sorted(record?.types || []) };
}

export async function addDramaLabStoryOption(userId: string, kindValue: unknown, valueValue: unknown) {
    const kind = normalizeKind(kindValue);
    const value = normalizeDramaLabStoryOption(valueValue);
    if (!value) throw new DramaLabStoryOptionError("自定义选项不能为空");

    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const existing = await postgresQuery<{ id: string; kind: DramaLabStoryOptionKind; value: string }>("SELECT id, kind, value FROM drama_lab_story_options WHERE user_id=$1 AND kind=$2 AND lower(value)=lower($3) LIMIT 1", [userId, kind, value]);
        if (existing.rows[0]) return { kind: existing.rows[0].kind, value: existing.rows[0].value };
        try {
            const result = await postgresQuery<{ kind: DramaLabStoryOptionKind; value: string }>("INSERT INTO drama_lab_story_options (id, user_id, kind, value) VALUES ($1,$2,$3,$4) RETURNING kind, value", [randomUUID(), userId, kind, value]);
            return result.rows[0];
        } catch (error) {
            const raced = await postgresQuery<{ kind: DramaLabStoryOptionKind; value: string }>("SELECT kind, value FROM drama_lab_story_options WHERE user_id=$1 AND kind=$2 AND lower(value)=lower($3) LIMIT 1", [userId, kind, value]);
            if (raced.rows[0]) return raced.rows[0];
            throw error;
        }
    }

    let result: { kind: DramaLabStoryOptionKind; value: string } | undefined;
    await withJsonDataFileLock(FILE_NAME, async () => {
        const state = await readJsonDataFile<StoredFile>(FILE_NAME, EMPTY_FILE);
        const record = (state.options[userId] ||= { styles: [], types: [] });
        const values = kind === "style" ? record.styles : record.types;
        const existing = values.find((item) => item.localeCompare(value, "zh-CN", { sensitivity: "accent" }) === 0);
        if (existing) {
            result = { kind, value: existing };
            return;
        }
        values.push(value);
        await writeJsonDataFile(FILE_NAME, state);
        result = { kind, value };
    });
    return result!;
}

export async function removeDramaLabStoryOption(userId: string, kindValue: unknown, valueValue: unknown) {
    const kind = normalizeKind(kindValue);
    const value = normalizeDramaLabStoryOption(valueValue);
    if (!value) return false;
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery("DELETE FROM drama_lab_story_options WHERE user_id=$1 AND kind=$2 AND lower(value)=lower($3)", [userId, kind, value]);
        return Boolean(result.rowCount);
    }
    let removed = false;
    await withJsonDataFileLock(FILE_NAME, async () => {
        const state = await readJsonDataFile<StoredFile>(FILE_NAME, EMPTY_FILE);
        const record = state.options[userId];
        if (!record) return;
        const key = kind === "style" ? "styles" : "types";
        const before = record[key].length;
        record[key] = record[key].filter((item) => item.localeCompare(value, "zh-CN", { sensitivity: "accent" }) !== 0);
        removed = record[key].length !== before;
        if (removed) await writeJsonDataFile(FILE_NAME, state);
    });
    return removed;
}
