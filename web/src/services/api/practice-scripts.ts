import type { ScriptDocument, ScriptPracticeProject, ScriptStage, ScriptVersion } from "@/lib/script-practice-types";

type ApiEnvelope<T> = { code: number; data?: T; msg?: string };
export type ScriptProjectDetail = { project: ScriptPracticeProject; document: ScriptDocument | null; versions: ScriptVersion[]; entities: Array<{ id: string; type: string; name: string; description?: string }>; stages: ScriptStage[] };

export const practiceScriptsApi = {
    list(input: { page?: number; pageSize?: number; keyword?: string; status?: string } = {}) {
        return request<{ items: ScriptPracticeProject[]; total: number; page: number; pageSize: number }>(
            `/api/practice/scripts?${new URLSearchParams(Object.entries(input).filter(([, value]) => value !== undefined && value !== "") as Array<[string, string]>).toString()}`,
        );
    },
    create(input: { title: string; sourceType?: string; idea?: string; mode?: "short_story" | "long_novel"; projectParameters?: Record<string, unknown> }) {
        return request<{ project: ScriptPracticeProject; document: ScriptDocument } | ScriptPracticeProject>("/api/practice/scripts", json("POST", input));
    },
    detail(id: string) {
        return request<ScriptProjectDetail>(`/api/practice/scripts/${encodeURIComponent(id)}`);
    },
    update(id: string, patch: Record<string, unknown>) {
        return request<ScriptPracticeProject>(`/api/practice/scripts/${encodeURIComponent(id)}`, json("PATCH", patch));
    },
    remove(id: string) {
        return request<{ deleted: boolean }>(`/api/practice/scripts/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    import(input: { title: string; format: "fountain" | "fdx" | "text" | "markdown"; content: string; confirm?: boolean }) {
        return request<{ preview?: boolean; format?: string; document?: ScriptDocument; project?: ScriptPracticeProject }>("/api/practice/scripts/import", json("POST", input));
    },
    saveVersion(id: string, document: ScriptDocument, parentVersionId?: string) {
        return request<ScriptVersion>(`/api/practice/scripts/${encodeURIComponent(id)}/versions`, json("POST", { document, parentVersionId }));
    },
    propose(id: string, input: { operation: string; baseVersionId: string; targetBlockIds: string[]; instruction: string }) {
        return request<{ id: string; projectId: string; baseVersionId: string; targetBlockIds: string[]; operation: string; before: string; proposedAfter: string }>(`/api/practice/scripts/${encodeURIComponent(id)}/agent`, json("POST", input));
    },
    apply(id: string, operation: string, input: { baseVersionId: string; currentVersionId: string; targetBlockIds: string[]; before: string; proposedAfter: string }) {
        return request<ScriptVersion>(`/api/practice/scripts/${encodeURIComponent(id)}/agent/${encodeURIComponent(operation)}/apply`, json("POST", input));
    },
    generateStage(id: string, operation: string, stageInput: unknown) {
        return request<unknown>(`/api/practice/scripts/${encodeURIComponent(id)}/stages`, json("POST", { operation, stageInput }));
    },
    confirmStage(id: string, stage: string) {
        return request<ScriptStage>(`/api/practice/scripts/${encodeURIComponent(id)}/stages`, json("POST", { confirm: true, stage }));
    },
    tree(id: string) {
        return request<{ items: Array<{ id: string; key: string; type: string; label: string; status: string; version: number }>; activeRuns: Array<{ id: string; status: string; runType: string; lastEventSequence: number }> }>(
            `/api/practice/scripts/${encodeURIComponent(id)}/tree`,
        );
    },
    artifact(id: string, artifactType: string, artifactKey: string) {
        return request<Record<string, unknown>>(`/api/practice/scripts/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifactType)}/${encodeURIComponent(artifactKey)}`);
    },
    confirmArtifact(id: string, artifactId: string, stageKey: string, runId?: string) {
        return request<Record<string, unknown>>(`/api/practice/scripts/${encodeURIComponent(id)}/confirmations`, json("POST", { artifactId, stageKey, runId }));
    },
    createRun(id: string, input: { runType: string; clientRequestId: string; chatSessionId?: string; stageKey?: string; input?: Record<string, unknown> }) {
        return request<{ id: string; status: string; runType: string }>(`/api/practice/scripts/${encodeURIComponent(id)}/runs`, json("POST", input));
    },
    run(id: string, runId: string) {
        return request<{ id: string; status: string; runType: string; progress: Record<string, unknown>; errorMessage?: string }>(`/api/practice/scripts/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`);
    },
    runEventsUrl(id: string, runId: string, afterSequence = 0) {
        return `/api/practice/scripts/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/events?afterSequence=${afterSequence}`;
    },
    stopRun(id: string, runId: string) {
        return request<unknown>(`/api/practice/scripts/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/stop`, { method: "POST" });
    },
    retryFailed(id: string, runId: string) {
        return request<unknown[]>(`/api/practice/scripts/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/retry-failed`, { method: "POST" });
    },
    chatSessions(id: string) {
        return request<Array<{ id: string; title: string }>>(`/api/practice/scripts/${encodeURIComponent(id)}/chat-sessions`);
    },
    createChatSession(id: string, title = "新对话") {
        return request<{ id: string; title: string }>(`/api/practice/scripts/${encodeURIComponent(id)}/chat-sessions`, json("POST", { title }));
    },
    chatMessages(id: string, sessionId: string) {
        return request<Array<{ id: string; role: string; agent_key?: string; public_content: string }>>(`/api/practice/scripts/${encodeURIComponent(id)}/chat-sessions/${encodeURIComponent(sessionId)}/messages`);
    },
    sendChat(id: string, sessionId: string, content: string, clientRequestId: string) {
        return request<{ id: string; status: string }>(`/api/practice/scripts/${encodeURIComponent(id)}/chat-sessions/${encodeURIComponent(sessionId)}/messages`, json("POST", { content, clientRequestId }));
    },
    exportUrl(id: string, format: "text" | "fountain" | "fdx") {
        return `/api/practice/scripts/${encodeURIComponent(id)}/export?format=${format}`;
    },
};

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(payload?.msg || "剧本请求失败");
    return payload.data;
}
function json(method: "POST" | "PATCH", body: unknown): RequestInit {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
