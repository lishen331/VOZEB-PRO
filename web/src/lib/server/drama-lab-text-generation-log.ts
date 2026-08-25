import { getPublicUsersByIds } from "@/lib/auth/store-actions";
import { recordGenerationLog } from "@/lib/server/generation-log-store";

type DramaLabTextGenerationLogInput = {
    id: string;
    userId: string;
    projectId: string;
    episodeId: string;
    title: string;
    prompt: string;
    model: string;
    status: "success" | "failed";
    durationMs: number;
    error?: string;
    createdAt?: number;
};

export async function recordDramaLabTextGenerationLog(input: DramaLabTextGenerationLogInput) {
    try {
        const users = await getPublicUsersByIds([input.userId]).catch(() => []);
        const user = users[0];
        const statusText = input.status === "success" ? "completed" : "failed";
        await recordGenerationLog({
            id: input.id,
            taskId: input.id,
            userId: input.userId,
            username: user?.username || "",
            displayName: user?.displayName || "",
            kind: "text",
            source: "drama",
            status: input.status,
            title: input.title,
            prompt: input.prompt.slice(0, 5_000),
            model: input.model,
            summary: input.status === "success" ? `${input.title} ${statusText}` : input.error || `${input.title} ${statusText}`,
            durationMs: Math.max(0, input.durationMs),
            count: 1,
            successCount: input.status === "success" ? 1 : 0,
            failCount: input.status === "failed" ? 1 : 0,
            requestSnapshot: {
                version: 1,
                projectId: input.projectId,
                episodeId: input.episodeId,
                parameters: {},
                references: [],
                slots: [],
            },
            error: input.status === "failed" ? input.error : undefined,
            createdAt: input.createdAt ? new Date(input.createdAt).toISOString() : undefined,
            completedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.warn("Drama lab text generation log update failed", { id: input.id, error });
    }
}
