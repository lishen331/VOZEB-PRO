import type { PracticeModuleKind, PracticeProjectKind, PracticeSource } from "@/lib/practice-domain";

export type PracticeProjectInput = { kind: PracticeProjectKind; title: string; source?: PracticeSource };
export type PracticeSessionInput = { module: PracticeModuleKind; title: string; input: Record<string, unknown>; references?: unknown[]; clientRequestId: string; projectId?: string; projectKind?: PracticeProjectKind };

export const practiceApi = {
    listProjects(input: { kind: PracticeProjectKind; page?: number; pageSize?: number }) {
        const query = new URLSearchParams({ kind: input.kind, page: String(input.page || 1), pageSize: String(input.pageSize || 12) });
        return request<{ kind: PracticeProjectKind; projects: unknown[]; total: number; page: number; pageSize: number }>(`/api/practice/projects?${query}`);
    },
    createProject(input: PracticeProjectInput) {
        return request<{ kind: PracticeProjectKind; project: unknown }>("/api/practice/projects", { method: "POST", body: JSON.stringify(input) });
    },
    listSessions(input: { page?: number; pageSize?: number; module?: PracticeModuleKind } = {}) {
        const query = new URLSearchParams({ page: String(input.page || 1), pageSize: String(input.pageSize || 12), ...(input.module ? { module: input.module } : {}) });
        return request<{ sessions: unknown[]; total: number; page: number; pageSize: number }>(`/api/practice/sessions?${query}`);
    },
    createSession(input: PracticeSessionInput) {
        return request<{ session: unknown }>("/api/practice/sessions", { method: "POST", body: JSON.stringify(input) });
    },
    getSession(id: string) {
        return request<{ session: unknown }>(`/api/practice/sessions/${encodeURIComponent(id)}`);
    },
};

async function request<T>(url: string, init: RequestInit = {}) {
    const response = await fetch(url, { cache: "no-store", headers: { "Content-Type": "application/json", ...(init.headers || {}) }, ...init });
    const payload = (await response.json().catch(() => ({}))) as { data?: T; msg?: string };
    if (!response.ok || payload.data === undefined) throw new Error(payload.msg || "练习请求失败");
    return payload.data;
}
