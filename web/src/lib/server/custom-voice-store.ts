import { randomUUID } from "node:crypto";
import { getDatabaseProvider, withPostgresTransaction } from "./database";
import { ensurePostgresSchema, postgresQuery, type QueryExecutor } from "./database/postgres";
import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "./data-adapter";
import type { CustomVoiceKind, CustomVoiceProvider, CustomVoiceStatus } from "@/lib/custom-voice-config";

export type CustomVoice = {
    id: string;
    ownerUserId: string;
    channelId: string;
    provider: CustomVoiceProvider;
    ttsModel: string;
    kind: CustomVoiceKind;
    name: string;
    status: CustomVoiceStatus;
    upstreamVoiceId?: string;
    previewUrl?: string;
    previewMimeType?: string;
    failureReason?: string;
    shared: boolean;
    chargeReceiptId?: string;
    upstreamRequestId?: string;
    lastUsedAt?: string;
    expiresAt?: string;
    createdAt: string;
    updatedAt: string;
};

type CreateCustomVoiceInput = Pick<CustomVoice, "ownerUserId" | "channelId" | "provider" | "ttsModel" | "kind" | "name"> & { id?: string };
type UpdateCustomVoiceInput = Partial<Pick<CustomVoice, "name" | "status" | "upstreamVoiceId" | "previewUrl" | "previewMimeType" | "failureReason" | "shared" | "lastUsedAt" | "expiresAt" | "chargeReceiptId" | "upstreamRequestId">>;

const DATA_FILE = "custom-voices.json";

export async function createCustomVoice(input: CreateCustomVoiceInput): Promise<CustomVoice> {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const voice: CustomVoice = {
        id,
        ownerUserId: input.ownerUserId,
        channelId: input.channelId,
        provider: input.provider,
        ttsModel: input.ttsModel,
        kind: input.kind,
        name: input.name,
        status: "creating",
        shared: false,
        createdAt: now,
        updatedAt: now,
    };
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        await postgresQuery(
            `INSERT INTO custom_voices (id, owner_user_id, channel_id, provider, tts_model, kind, name, status, shared, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [voice.id, voice.ownerUserId, voice.channelId, voice.provider, voice.ttsModel, voice.kind, voice.name, voice.status, voice.shared, voice.createdAt, voice.updatedAt],
        );
        return voice;
    }
    await withJsonDataFileLock(DATA_FILE, async () => {
        const rows = await readJsonDataFile<CustomVoice[]>(DATA_FILE, []);
        rows.push(voice);
        await writeJsonDataFile(DATA_FILE, rows);
    });
    return voice;
}

export async function getCustomVoice(id: string, options: { executor?: QueryExecutor; forUpdate?: boolean } = {}): Promise<CustomVoice | null> {
    if (getDatabaseProvider() === "postgres") {
        if (!options.executor) await ensurePostgresSchema();
        const query: QueryExecutor["query"] = options.executor ? options.executor.query.bind(options.executor) : postgresQuery;
        const suffix = options.forUpdate ? " FOR UPDATE" : "";
        const rows = await query(`SELECT * FROM custom_voices WHERE id = $1${suffix}`, [id]);
        return rows.rows.length ? fromPostgres(rows.rows[0]) : null;
    }
    const rows = await readJsonDataFile<CustomVoice[]>(DATA_FILE, []);
    return rows.find((voice) => voice.id === id) || null;
}

export async function updateCustomVoice(id: string, update: UpdateCustomVoiceInput, options: { executor?: QueryExecutor } = {}): Promise<void> {
    const now = new Date().toISOString();
    if (getDatabaseProvider() === "postgres") {
        if (!options.executor) await ensurePostgresSchema();
        const query: QueryExecutor["query"] = options.executor ? options.executor.query.bind(options.executor) : postgresQuery;
        const sets: string[] = ["updated_at = $1"];
        const values: unknown[] = [now];
        let i = 2;
        if (update.name !== undefined) {
            sets.push(`name = $${i++}`);
            values.push(update.name);
        }
        if (update.status !== undefined) {
            sets.push(`status = $${i++}`);
            values.push(update.status);
        }
        if (update.upstreamVoiceId !== undefined) {
            sets.push(`upstream_voice_id = $${i++}`);
            values.push(update.upstreamVoiceId);
        }
        if (update.previewUrl !== undefined) {
            sets.push(`preview_url = $${i++}`);
            values.push(update.previewUrl);
        }
        if (update.previewMimeType !== undefined) {
            sets.push(`preview_mime_type = $${i++}`);
            values.push(update.previewMimeType);
        }
        if (update.failureReason !== undefined) {
            sets.push(`failure_reason = $${i++}`);
            values.push(update.failureReason);
        }
        if (update.shared !== undefined) {
            sets.push(`shared = $${i++}`);
            values.push(update.shared);
        }
        if (update.lastUsedAt !== undefined) {
            sets.push(`last_used_at = $${i++}`);
            values.push(update.lastUsedAt);
        }
        if (update.expiresAt !== undefined) {
            sets.push(`expires_at = $${i++}`);
            values.push(update.expiresAt || null);
        }
        if (update.chargeReceiptId !== undefined) {
            sets.push(`charge_receipt_id = $${i++}`);
            values.push(update.chargeReceiptId);
        }
        if (update.upstreamRequestId !== undefined) {
            sets.push(`upstream_request_id = $${i++}`);
            values.push(update.upstreamRequestId);
        }
        values.push(id);
        await query(`UPDATE custom_voices SET ${sets.join(", ")} WHERE id = $${i}`, values);
        return;
    }
    await withJsonDataFileLock(DATA_FILE, async () => {
        const rows = await readJsonDataFile<CustomVoice[]>(DATA_FILE, []);
        const voice = rows.find((v) => v.id === id);
        if (!voice) return;
        Object.assign(voice, update, { updatedAt: now });
        await writeJsonDataFile(DATA_FILE, rows);
    });
}

export async function listCustomVoices(filters: { ownerUserId?: string; ttsModel?: string; shared?: boolean; includeOwned?: boolean }): Promise<CustomVoice[]> {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const conditions: string[] = ["status IN ('ready', 'creating')"];
        const values: unknown[] = [];
        let i = 1;
        if (filters.ttsModel) {
            conditions.push(`tts_model = $${i++}`);
            values.push(filters.ttsModel);
        }
        if (filters.shared === true) {
            conditions.push(`shared = TRUE`);
        } else if (filters.ownerUserId && filters.includeOwned !== false) {
            conditions.push(`(owner_user_id = $${i++} OR shared = TRUE)`);
            values.push(filters.ownerUserId);
        } else if (filters.ownerUserId) {
            conditions.push(`owner_user_id = $${i++}`);
            values.push(filters.ownerUserId);
        }
        const rows = await postgresQuery(`SELECT * FROM custom_voices WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`, values);
        return rows.rows.map((row) => fromPostgres(row));
    }
    const rows = await readJsonDataFile<CustomVoice[]>(DATA_FILE, []);
    return rows.filter((voice) => {
        if (voice.status !== "ready" && voice.status !== "creating") return false;
        if (filters.ttsModel && voice.ttsModel !== filters.ttsModel) return false;
        if (filters.shared === true) return voice.shared;
        if (filters.ownerUserId && filters.includeOwned !== false) return voice.ownerUserId === filters.ownerUserId || voice.shared;
        if (filters.ownerUserId) return voice.ownerUserId === filters.ownerUserId;
        return true;
    });
}

export async function deleteExpiredCustomVoices(before: string): Promise<number> {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery(`WITH deleted AS (DELETE FROM custom_voices WHERE expires_at < $1 AND status != 'deleted' RETURNING 1) SELECT COUNT(*) as count FROM deleted`, [before]);
        const count = result.rows[0] ? Number((result.rows[0] as { count?: string | number }).count) : 0;
        return Number.isFinite(count) ? count : 0;
    }
    let deleted = 0;
    await withJsonDataFileLock(DATA_FILE, async () => {
        const rows = await readJsonDataFile<CustomVoice[]>(DATA_FILE, []);
        const kept = rows.filter((voice) => {
            if (voice.expiresAt && voice.expiresAt < before && voice.status !== "deleted") {
                deleted += 1;
                return false;
            }
            return true;
        });
        if (deleted > 0) await writeJsonDataFile(DATA_FILE, kept);
    });
    return deleted;
}

export async function withCustomVoiceTransaction<T>(callback: (executor: QueryExecutor) => Promise<T>): Promise<T> {
    if (getDatabaseProvider() === "postgres") {
        return withPostgresTransaction(callback);
    }
    return withJsonDataFileLock(DATA_FILE, () => callback(postgresQuery as unknown as QueryExecutor));
}

function fromPostgres(row: Record<string, unknown>): CustomVoice {
    return {
        id: String(row.id),
        ownerUserId: String(row.owner_user_id),
        channelId: String(row.channel_id),
        provider: String(row.provider) as CustomVoiceProvider,
        ttsModel: String(row.tts_model),
        kind: String(row.kind) as CustomVoiceKind,
        name: String(row.name),
        status: String(row.status) as CustomVoiceStatus,
        upstreamVoiceId: row.upstream_voice_id ? String(row.upstream_voice_id) : undefined,
        previewUrl: row.preview_url ? String(row.preview_url) : undefined,
        previewMimeType: row.preview_mime_type ? String(row.preview_mime_type) : undefined,
        failureReason: row.failure_reason ? String(row.failure_reason) : undefined,
        shared: Boolean(row.shared),
        chargeReceiptId: row.charge_receipt_id ? String(row.charge_receipt_id) : undefined,
        upstreamRequestId: row.upstream_request_id ? String(row.upstream_request_id) : undefined,
        lastUsedAt: row.last_used_at ? new Date(row.last_used_at as Date).toISOString() : undefined,
        expiresAt: row.expires_at ? new Date(row.expires_at as Date).toISOString() : undefined,
        createdAt: new Date(row.created_at as Date).toISOString(),
        updatedAt: new Date(row.updated_at as Date).toISOString(),
    };
}
