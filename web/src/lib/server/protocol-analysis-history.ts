import { randomUUID } from "node:crypto";
import { redactProtocolSecrets } from "@/lib/channel-protocol-draft";
import { normalizeModelId } from "@/lib/model-capability";
import type { AdminChannelProtocolDraftResult } from "@/services/api/admin-channel-protocol";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery } from "./database";
import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "./data-adapter";

export type ProtocolAnalysisRecord = {
    id: string;
    channelId: string;
    model: string;
    createdAt: number;
    input: { documentationUrl?: string; documentationText?: string; examples?: string; useTextModel?: boolean };
    result?: AdminChannelProtocolDraftResult;
    error?: string;
};
const FILE = "protocol-analysis-history.json";
export function sanitizeProtocolHistory<T>(value: T): T {
    if (typeof value === "string")
        return redactProtocolSecrets(value)
            .replace(/(\bBearer\s+)(?!\{\{|\[REDACTED\])[A-Za-z0-9._~+\/-]+/gi, "$1[REDACTED]")
            .replace(/(["']?(?:password|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*["']?)[^\s,"'\\}]+/gi, "$1[REDACTED]") as T;
    if (Array.isArray(value)) return value.map(sanitizeProtocolHistory) as T;
    if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(api[_-]?key|access[_-]?token|refresh[_-]?token|token|authorization|cookie|password|secret)$/i.test(key) ? "[REDACTED]" : sanitizeProtocolHistory(item)])) as T;
    return value;
}
export async function recordProtocolAnalysis(input: Omit<ProtocolAnalysisRecord, "id" | "createdAt">) {
    const row = sanitizeProtocolHistory({ ...input, model: normalizeModelId(input.model), id: randomUUID(), createdAt: Date.now() });
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        await postgresQuery("INSERT INTO protocol_analysis_history (id,channel_id,model,payload) VALUES ($1,$2,$3,$4::jsonb)", [row.id, row.channelId, row.model, JSON.stringify(row)]);
    } else
        await withJsonDataFileLock(FILE, async () => {
            const rows = await readJsonDataFile<ProtocolAnalysisRecord[]>(FILE, []);
            rows.push(row);
            await writeJsonDataFile(FILE, rows);
        });
    return row;
}
export async function getProtocolAnalysisHistory(channelId: string, model: string): Promise<ProtocolAnalysisRecord[]> {
    const normalizedModel = normalizeModelId(model);
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        return sanitizeProtocolHistory(
            (await postgresQuery<{ payload: ProtocolAnalysisRecord }>("SELECT payload FROM protocol_analysis_history WHERE channel_id=$1 AND model=$2 ORDER BY created_at DESC,id DESC", [channelId, normalizedModel])).rows.map((row) => row.payload),
        );
    }
    return sanitizeProtocolHistory((await readJsonDataFile<ProtocolAnalysisRecord[]>(FILE, [])).filter((row) => row.channelId === channelId && row.model === normalizedModel).sort((a, b) => b.createdAt - a.createdAt));
}
