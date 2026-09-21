import { randomUUID } from "node:crypto";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery, withPostgresTransaction } from "./database";
import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "./data-adapter";

export type BindingVerificationRun = {
    id: string;
    userId: string;
    logicalModelId: string;
    bindingId: string;
    channelId: string;
    capability: "text" | "image" | "video";
    fingerprint: string;
    token: string;
    status: "running" | "passed" | "failed" | "needs_review";
    phase: string;
    createdAt: number;
    updatedAt: number;
    taskId?: string;
    upstreamTaskId?: string;
    busyUntil?: number;
    fixtureUrls: string[];
    referenceUrlMappings?: Array<{ original: string; submitted: string }>;
    referenceEvidence?: Array<{ url: string; sha256: string }>;
    input?: import("@/lib/binding-verification-input").BindingVerificationInput;
    error?: string;
    result?: { url?: string; text?: string; mimeType?: string };
    diagnostics?: Record<string, unknown>;
};
const FILE = "binding-verifications.json";

function reusePendingVerification(existing: BindingVerificationRun, requested: BindingVerificationRun) {
    if (existing.fingerprint !== requested.fingerprint || JSON.stringify(existing.input) !== JSON.stringify(requested.input)) throw new Error(`当前绑定仍有未决测试 ${existing.id}；请先恢复并核对原任务，不能通过修改配置或输入重新生成。`);
    return existing;
}

export async function createBindingVerification(input: Omit<BindingVerificationRun, "id" | "createdAt" | "updatedAt">) {
    const run: BindingVerificationRun = { ...input, id: randomUUID(), createdAt: Date.now(), updatedAt: Date.now() };
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        return withPostgresTransaction(async (client) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify([run.userId, run.logicalModelId, run.bindingId])]);
            const existing = await client.query<{ payload: BindingVerificationRun }>(
                "SELECT payload FROM binding_verifications WHERE user_id=$1 AND payload->>'logicalModelId'=$2 AND payload->>'bindingId'=$3 AND status IN ('running','needs_review') ORDER BY created_at DESC LIMIT 1",
                [run.userId, run.logicalModelId, run.bindingId],
            );
            if (existing.rows[0]) return reusePendingVerification(existing.rows[0].payload, run);
            await client.query("INSERT INTO binding_verifications (id,user_id,fingerprint,status,payload) VALUES ($1,$2,$3,$4,$5::jsonb)", [run.id, run.userId, run.fingerprint, run.status, JSON.stringify(run)]);
            return run;
        });
    }
    return withJsonDataFileLock(FILE, async () => {
        const rows = await readJsonDataFile<BindingVerificationRun[]>(FILE, []);
        const existing = rows.find((row) => row.userId === run.userId && row.logicalModelId === run.logicalModelId && row.bindingId === run.bindingId && (row.status === "running" || row.status === "needs_review"));
        if (existing) return reusePendingVerification(existing, run);
        rows.push(run);
        await writeJsonDataFile(FILE, rows);
        return run;
    });
}
export async function getBindingVerification(id: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ payload: BindingVerificationRun }>("SELECT payload FROM binding_verifications WHERE id=$1", [id]);
        return result.rows[0]?.payload || null;
    }
    return (await readJsonDataFile<BindingVerificationRun[]>(FILE, [])).find((row) => row.id === id) || null;
}
export async function updateBindingVerification(
    id: string,
    patch: Partial<Pick<BindingVerificationRun, "status" | "phase" | "taskId" | "upstreamTaskId" | "busyUntil" | "fixtureUrls" | "referenceUrlMappings" | "referenceEvidence" | "error" | "result" | "diagnostics">>,
) {
    const delta = { ...patch, updatedAt: Date.now() };
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ payload: BindingVerificationRun }>("UPDATE binding_verifications SET payload=payload || $2::jsonb, status=COALESCE($3,status) WHERE id=$1 RETURNING payload", [id, JSON.stringify(delta), patch.status || null]);
        return result.rows[0]?.payload || null;
    }
    return withJsonDataFileLock(FILE, async () => {
        const rows = await readJsonDataFile<BindingVerificationRun[]>(FILE, []);
        const i = rows.findIndex((row) => row.id === id);
        if (i < 0) return null;
        rows[i] = { ...rows[i], ...delta };
        await writeJsonDataFile(FILE, rows);
        return rows[i];
    });
}
export async function claimBindingVerification(id: string, busyUntil: number) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ payload: BindingVerificationRun }>("UPDATE binding_verifications SET payload=payload || $2::jsonb WHERE id=$1 AND status='running' AND COALESCE((payload->>'busyUntil')::bigint,0)=0 RETURNING payload", [
            id,
            JSON.stringify({ busyUntil, updatedAt: Date.now() }),
        ]);
        return result.rows[0]?.payload || null;
    }
    return withJsonDataFileLock(FILE, async () => {
        const rows = await readJsonDataFile<BindingVerificationRun[]>(FILE, []);
        const i = rows.findIndex((row) => row.id === id && row.status === "running" && !row.busyUntil);
        if (i < 0) return null;
        rows[i] = { ...rows[i], busyUntil, updatedAt: Date.now() };
        await writeJsonDataFile(FILE, rows);
        return rows[i];
    });
}
export async function getPassedBindingVerification(fingerprint: string, adminId?: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ payload: BindingVerificationRun }>("SELECT payload FROM binding_verifications WHERE fingerprint=$1 AND status='passed' AND ($2::text IS NULL OR user_id=$2) ORDER BY created_at DESC LIMIT 1", [
            fingerprint,
            adminId || null,
        ]);
        return result.rows[0]?.payload || null;
    }
    return (await readJsonDataFile<BindingVerificationRun[]>(FILE, [])).filter((row) => row.fingerprint === fingerprint && row.status === "passed" && (!adminId || row.userId === adminId)).sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}
export async function hasPassedBindingVerification(fingerprint: string) {
    return Boolean(await getPassedBindingVerification(fingerprint));
}

export async function completeBindingVerification(id: string, busyUntil: number, result: NonNullable<BindingVerificationRun["result"]>) {
    const now = Date.now();
    const delta = { status: "passed" as const, phase: "completed", result, busyUntil: 0, updatedAt: now };
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const updated = await postgresQuery<{ payload: BindingVerificationRun }>(
            "UPDATE binding_verifications SET status='passed',payload=payload || $3::jsonb WHERE id=$1 AND status='running' AND (payload->>'busyUntil')::bigint=$2 AND (payload->>'busyUntil')::bigint >= $4 AND payload->'diagnostics'->>'requestDigest' IS NOT NULL RETURNING payload",
            [id, busyUntil, JSON.stringify(delta), now],
        );
        return updated.rows[0]?.payload || null;
    }
    return withJsonDataFileLock(FILE, async () => {
        const rows = await readJsonDataFile<BindingVerificationRun[]>(FILE, []);
        const index = rows.findIndex((row) => row.id === id && row.status === "running" && row.busyUntil === busyUntil && busyUntil >= now && Boolean(row.diagnostics?.requestDigest));
        if (index < 0) return null;
        rows[index] = { ...rows[index], ...delta };
        await writeJsonDataFile(FILE, rows);
        return rows[index];
    });
}

/** Reuses the existing 20KB diagnostic contract; never stores headers, media bytes or prompts. */
export async function recordBindingVerificationDiagnostic(id: string, event: Record<string, unknown>, secrets: string[] = []) {
    const { appendDiagnosticEvent, redactDiagnosticText } = await import("./media-task-diagnostics");
    const run = await getBindingVerification(id);
    if (!run) return;
    const sanitized = Object.fromEntries(Object.entries(event).map(([key, value]) => [key, typeof value === "string" ? redactDiagnosticText(value, secrets) : value]));
    const existing = Array.isArray(run.diagnostics?.events) ? (run.diagnostics.events as import("./media-task-diagnostics").MediaDiagnosticEvent[]) : [];
    await updateBindingVerification(id, { diagnostics: { ...run.diagnostics, events: appendDiagnosticEvent(existing, sanitized) } });
}
