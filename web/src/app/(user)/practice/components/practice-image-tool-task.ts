import type { UploadedImage } from "@/services/image-storage";

export type PracticeImageToolResult = { taskId?: string; model?: string; text?: string; image?: UploadedImage; saved?: boolean };
export type PracticeImageToolTask = { id: string; type: "text" | "image"; model: string };
export class PracticeImageToolTaskFailed extends Error {}

export async function pollPracticeImageToolTask(task: PracticeImageToolTask, signal?: AbortSignal): Promise<PracticeImageToolResult> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 20 * 60_000) {
        const response = await fetch(`/api/${task.type}-tasks/${encodeURIComponent(task.id)}`, { cache: "no-store", signal });
        const payload = (await response.json().catch(() => ({}))) as { task?: { status?: string; result?: Record<string, unknown>; error?: string; model?: string; needsReview?: boolean }; error?: string };
        if (!response.ok || !payload.task) throw new Error(payload.error || "查询生成任务失败");
        if (payload.task.status === "error" || payload.task.status === "cancelled") throw new PracticeImageToolTaskFailed(payload.task.error || "生成失败");
        if (payload.task.needsReview) throw new Error("任务结果待确认，请稍后查询原任务，不要重复提交");
        if (payload.task.status === "success") {
            const taskResult = payload.task.result || {};
            if (task.type === "text") return { taskId: task.id, model: payload.task.model || task.model, text: String(taskResult.content || "") };
            const url = String(taskResult.serverUrl || taskResult.remoteUrl || taskResult.dataUrl || taskResult.url || "");
            if (!url) throw new Error("生成任务成功，但没有返回图片地址");
            return {
                taskId: task.id,
                model: payload.task.model || task.model,
                image: {
                    url,
                    serverUrl: String(taskResult.serverUrl || "") || undefined,
                    remoteUrl: String(taskResult.remoteUrl || "") || undefined,
                    storageKey: String(taskResult.storageKey || ""),
                    width: Number(taskResult.width) || 0,
                    height: Number(taskResult.height) || 0,
                    bytes: Number(taskResult.bytes) || 0,
                    mimeType: String(taskResult.mimeType || "image/png"),
                },
            };
        }
        await new Promise((resolve) => setTimeout(resolve, 1800));
    }
    throw new Error("任务仍在后台运行，请稍后查看；任务编号：" + task.id);
}
