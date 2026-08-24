import { generationModelId } from "@/lib/server/generation-channel";
import { recordGenerationLog } from "@/lib/server/generation-log-store";
import type { AiTextMessage } from "@/types/ai";

import type { TextTask } from "./text-task-store";

export async function recordTextTaskLog(task: TextTask, user: { username: string; displayName: string }, status: "pending" | "success" | "failed", error?: string) {
    return recordGenerationLog({
        id: `text-task:${task.id}`,
        taskId: task.id,
        userId: task.userId,
        username: user.username,
        displayName: user.displayName,
        kind: "text",
        source: task.surface === "drama" ? "drama" : task.surface === "canvas" ? "canvas" : "agent",
        status,
        title: task.surface === "drama" ? "剧本生成" : "文本生成",
        prompt: textTaskPrompt(task.messages),
        model: generationModelId(task.config),
        summary: status === "pending" ? "文本生成中" : status === "success" ? "文本生成完成" : error || "文本生成失败",
        durationMs: status === "pending" ? 0 : Math.max(0, Date.now() - task.createdAt),
        count: 1,
        successCount: status === "success" ? 1 : 0,
        failCount: status === "failed" ? 1 : 0,
        error,
        createdAt: new Date(task.createdAt).toISOString(),
        completedAt: status === "pending" ? undefined : new Date().toISOString(),
    });
}

export function textTaskPrompt(messages: AiTextMessage[]) {
    return messages
        .filter((message) => message.role === "user")
        .map((message) => (typeof message.content === "string" ? message.content : message.content.map((item) => (item.type === "text" ? item.text : "")).join("\n")))
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 5000);
}
