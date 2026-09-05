import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { assertDramaLabStageAllowed, DramaLabCollaborationError, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { getAuthSettings } from "@/lib/auth/store";
import { fetchInternalApi } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { DramaLabAudioError, legacyDramaAudioTaskId, prepareDramaLabAudio } from "@/lib/server/drama-lab-audio-service";
import { persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";
import { getAudioTask } from "@/lib/server/audio-task-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

type AudioBody = { kind?: unknown; voice?: unknown; speed?: unknown; instructions?: unknown };

export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new DramaLabAudioError("当前剧集不能为空");
        const { project, ownerUserId } = await resolveDramaLabProjectForRequest(user.id, id);
        if (!project) throw new DramaLabAudioError("短剧项目不存在", 404);
        await assertDramaLabStageAllowed(user.id, id, "storyboard_video", { episodeId, resourceType: "shot", resourceId: shotId });
        const parsed = await readJsonBodyResult<AudioBody>(request);
        if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
        const input = prepareDramaLabAudio(project, episodeId, shotId, parsed.data.kind);
        const kind = input.kind;
        const previousState = kind === "narration" ? input.shot.narrationAudio : input.shot.dialogueAudio;
        const legacyTaskId = legacyDramaAudioTaskId(input.shot, kind);
        const previousTaskId = previousState?.taskId || legacyTaskId;
        const previousStatus = previousState?.status || (legacyTaskId ? input.shot.audioStatus : undefined);
        if (previousTaskId) {
            const retained = await getAudioTask(previousTaskId);
            if (retained && (retained.status === "pending" || retained.status === "running")) throw new DramaLabAudioError("当前镜头已有音频任务正在执行", 409);
        }
        const settings = await getAuthSettings();
        const model = settings.defaultModels.audioModel?.trim();
        if (!model) throw new DramaLabAudioError("后台尚未配置可用的默认音频模型", 503);
        const attemptNo = (previousState?.attempt || (kind === "dialogue" ? input.shot.audioAttempt : legacyTaskId ? input.shot.audioAttempt : 0) || 0) + 1;
        const requestId = `drama-lab-audio:${project.id}:${episodeId}:${shotId}:${kind}:attempt-${attemptNo}`;
        const requestOrigin = resolvePublicRequestOrigin(request);
        const response = await fetchInternalApi(`${requestOrigin}/api/audio-tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                cookie: request.headers.get("cookie") || "",
                "X-VOZEB-PRO-Client-Request-Id": requestId,
                "X-VOZEB-PRO-Attempt-No": String(attemptNo),
            },
            body: JSON.stringify({
                config: {
                    model,
                    ...(clean(parsed.data.voice) || input.voice ? { voice: clean(parsed.data.voice) || input.voice } : {}),
                    ...(Number.isFinite(Number(parsed.data.speed || input.speed)) ? { speed: String(clampSpeed(parsed.data.speed ?? input.speed)) } : {}),
                    ...(clean(parsed.data.instructions) || input.instructions ? { instructions: [input.instructions, clean(parsed.data.instructions)].filter(Boolean).join("\n").slice(0, 2_000) } : {}),
                },
                prompt: input.prompt,
                source: "drama",
                context: {
                    conversationId: project.creativeConversationId,
                    surface: "drama",
                    projectId: project.id,
                    episodeId,
                    shotId,
                    attemptNo,
                    clientRequestId: requestId,
                    audioKind: input.kind,
                    speaker: input.speaker,
                },
            }),
        });
        const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string; status?: string; model?: string }; error?: string };
        if (!response.ok || !payload.task?.id) throw new DramaLabAudioError(payload.error || "短剧音频任务创建失败", response.status >= 400 && response.status < 600 ? response.status : 502);
        const status = payload.task.status === "success" ? "success" : "running";
        const audioState = {
            status,
            taskId: payload.task.id,
            attempt: attemptNo,
            speaker: input.speaker,
            voice: clean(parsed.data.voice) || input.voice,
            speed: Number.isFinite(Number(parsed.data.speed ?? input.speed)) ? clampSpeed(parsed.data.speed ?? input.speed) : undefined,
            instructions: [input.instructions, clean(parsed.data.instructions)].filter(Boolean).join("\n").slice(0, 2_000) || undefined,
        } as const;
        await persistDramaLabShotUpdate({
            userId: user.id,
            projectOwnerUserId: ownerUserId,
            project,
            episodeId,
            shotId,
            patch: {
                ...(kind === "narration" ? { narrationAudio: audioState } : { dialogueAudio: audioState }),
                audioStatus: status,
                audioTaskId: payload.task.id,
                audioAttempt: attemptNo,
                audioError: undefined,
                audioUrl: undefined,
            },
        });
        return NextResponse.json({ code: 0, data: { task: payload.task, kind: input.kind, speaker: input.speaker }, msg: "短剧音频任务已创建" });
    } catch (error) {
        const status = error instanceof DramaLabAudioError || error instanceof DramaProjectStoreError || error instanceof DramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "短剧音频任务创建失败" }, { status });
    }
}

function clean(value: unknown) {
    return typeof value === "string" ? value.trim().slice(0, 2_000) : "";
}

function clampSpeed(value: unknown) {
    const speed = Number(value);
    return Number.isFinite(speed) ? Math.max(0.25, Math.min(4, speed)) : 1;
}
