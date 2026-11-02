import type { LessonPlanContent, LessonPlanStatus, PlatformLessonTemplate, TeachingLessonPlan, TeachingLessonPlanSummary } from "@/lib/teaching-lesson-plan";

/** 接口错误：保留 HTTP 状态（409 = 版本冲突）和 data（标记已备失败时的 missing 列表） */
export class LessonPlanApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly data: unknown,
    ) {
        super(message);
        this.name = "LessonPlanApiError";
    }

    get missing(): string[] {
        const value = this.data && typeof this.data === "object" ? (this.data as { missing?: unknown }).missing : undefined;
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    }
}

const planPath = (assignmentId: string, lessonId: string) => `/api/teaching/lesson-plans/${encodeURIComponent(assignmentId)}/${encodeURIComponent(lessonId)}`;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: number; data?: T; msg?: string } | null;
    if (!response.ok || !payload || payload.code !== 0) throw new LessonPlanApiError(payload?.msg || "请求失败", response.status, payload?.data ?? null);
    return payload.data as T;
}

export const lessonPlansApi = {
    list(assignmentId?: string, options?: { signal?: AbortSignal }) {
        const query = assignmentId ? `?assignmentId=${encodeURIComponent(assignmentId)}` : "";
        return request<TeachingLessonPlanSummary[]>(`/api/teaching/lesson-plans${query}`, options);
    },
    get(assignmentId: string, lessonId: string, options?: { signal?: AbortSignal }) {
        return request<TeachingLessonPlan | null>(planPath(assignmentId, lessonId), options);
    },
    /** keepalive：切课时 / 离开页面时把未保存的修改发出去，页面卸载后请求仍会完成 */
    save(assignmentId: string, lessonId: string, input: { content: LessonPlanContent; status: LessonPlanStatus; baseUpdatedAt: string | null }, options: { keepalive?: boolean } = {}) {
        return request<TeachingLessonPlan>(planPath(assignmentId, lessonId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), keepalive: options.keepalive });
    },
    /** 课程方的标准教案（只读）；没有时为 null */
    getTemplate(assignmentId: string, lessonId: string, options?: { signal?: AbortSignal }) {
        return request<PlatformLessonTemplate | null>(`${planPath(assignmentId, lessonId)}/template`, options);
    },
    recordRehearsal(assignmentId: string, lessonId: string, input: { totalSeconds: number; phases: { phaseId: string; seconds: number }[] }) {
        return request<TeachingLessonPlan>(`${planPath(assignmentId, lessonId)}/rehearsals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    },
};
