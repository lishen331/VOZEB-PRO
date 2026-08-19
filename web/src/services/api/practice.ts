import type { PracticeModuleKind, PracticeProjectKind, PracticeSource } from "@/lib/practice-domain";
import type { IpReference } from "@/lib/ip-library-domain";

export type PracticeProjectSummary = { id: string; title: string; createdAt: string; updatedAt: string; executionProfile: "open-source-practice"; practiceSource: PracticeSource; [key: string]: unknown };
export type PracticeProject = PracticeProjectSummary & { [key: string]: unknown };
export type PracticeSessionResult = { status: "pending" | "running" | "success" | "error" | "cancelled"; text?: string; media?: { kind: "image" | "video" | "audio"; url: string; width?: number; height?: number; durationMs?: number }; error?: string };
export type PracticeSession = {
    id: string;
    title: string;
    module: PracticeModuleKind;
    projectId?: string;
    projectKind?: PracticeProjectKind;
    input: Record<string, unknown>;
    status: "queued" | "running" | "success" | "failed" | "cancelled";
    result?: PracticeSessionResult;
    createdAt: string;
    updatedAt: string;
};
export type PracticeProjectInput = { kind: PracticeProjectKind; title: string; source?: PracticeSource; references?: IpReference[] };
export type PracticeSessionInput = {
    module: PracticeModuleKind;
    title: string;
    input: Record<string, unknown>;
    references?: Array<{ type: "asset"; id: string } | IpReference>;
    clientRequestId: string;
    projectId?: string;
    projectKind?: PracticeProjectKind;
};

export const practiceApi = {
    listProjects(input: { kind: PracticeProjectKind; page?: number; pageSize?: number }) {
        const query = new URLSearchParams({ kind: input.kind, page: String(input.page || 1), pageSize: String(input.pageSize || 12) });
        return request<{ kind: PracticeProjectKind; projects: PracticeProjectSummary[]; total: number; page: number; pageSize: number }>(`/api/practice/projects?${query}`);
    },
    createProject(input: PracticeProjectInput) {
        return request<{ kind: PracticeProjectKind; project: PracticeProject }>("/api/practice/projects", { method: "POST", body: JSON.stringify(input) });
    },
    listSessions(input: { page?: number; pageSize?: number; module?: PracticeModuleKind } = {}) {
        const query = new URLSearchParams({ page: String(input.page || 1), pageSize: String(input.pageSize || 12), ...(input.module ? { module: input.module } : {}) });
        return request<{ sessions: PracticeSession[]; total: number; page: number; pageSize: number }>(`/api/practice/sessions?${query}`);
    },
    createSession(input: PracticeSessionInput) {
        return request<{ session: PracticeSession }>("/api/practice/sessions", { method: "POST", body: JSON.stringify(input) });
    },
    getSession(id: string) {
        return request<{ session: PracticeSession }>(`/api/practice/sessions/${encodeURIComponent(id)}`);
    },
    retrySession(id: string) {
        return request<{ session: PracticeSession }>(`/api/practice/sessions/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ action: "retry" }) });
    },
    getProject(id: string, kind: PracticeProjectKind) {
        return request<{ kind: PracticeProjectKind; project: PracticeProject }>(`/api/practice/projects/${encodeURIComponent(id)}?kind=${kind}`);
    },
};

async function request<T>(url: string, init: RequestInit = {}) {
    const response = await fetch(url, { cache: "no-store", headers: { "Content-Type": "application/json", ...(init.headers || {}) }, ...init });
    const payload = (await response.json().catch(() => ({}))) as { data?: T; msg?: string };
    if (!response.ok || payload.data === undefined) throw new Error(payload.msg || "练习请求失败");
    return payload.data;
}
