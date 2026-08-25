import type { CanvasProject, CanvasProjectMutation, CanvasProjectSaveAck, CanvasProjectSummaryPage, CreateCanvasProjectInput } from "@/lib/canvas-project-contract";

import { CanvasProjectRequestError } from "./canvas-projects";

export { CanvasProjectRequestError };

const BASE_PATH = "/api/drama-lab/canvas-projects";

export function listCanvasProjectSummaries(input: { page: number; pageSize: number }) {
    const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
    return request<CanvasProjectSummaryPage>(`${BASE_PATH}?${query}`, { cache: "no-store" });
}

export function createCanvasProject(_input: CreateCanvasProjectInput): Promise<CanvasProject> {
    return Promise.reject(new CanvasProjectRequestError("剧集画布由剧集绑定创建", 400));
}

export function deleteCanvasProjects(_ids: string[]): Promise<{ deleted: number }> {
    return Promise.reject(new CanvasProjectRequestError("剧集画布由剧集绑定管理", 400));
}

export function getDramaLabCanvasProject(id: string) {
    return request<{ project: CanvasProject }>(`${BASE_PATH}/${encodeURIComponent(id)}`, { cache: "no-store" }).then((data) => data.project);
}

export function saveDramaLabCanvasProjectMutation(projectId: string, mutation: CanvasProjectMutation, options?: { keepalive?: boolean }) {
    return request<{ ack: CanvasProjectSaveAck }>(`${BASE_PATH}/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutation }),
        keepalive: options?.keepalive,
    }).then((data) => data.ack);
}

export function deleteDramaLabCanvasAssistantConversations(projectId: string, conversationIds: string[]) {
    return request<{ deleted: number; chatSessions: CanvasProject["chatSessions"]; activeChatId: string | null }>(`${BASE_PATH}/${encodeURIComponent(projectId)}/assistant-conversations`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationIds }),
    });
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as { data?: T; msg?: string; error?: string };
    if (!response.ok || !payload.data) throw new CanvasProjectRequestError(payload.msg || payload.error || "短剧画布项目请求失败", response.status);
    return payload.data;
}
