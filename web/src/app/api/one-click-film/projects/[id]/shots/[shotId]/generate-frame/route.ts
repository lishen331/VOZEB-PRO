import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getAuthSettings } from "@/lib/auth/store";
import { isDramaShotFrameType, prepareDramaLabFrame } from "@/lib/server/drama-lab-frame-generation-service";
import { appendDramaLabGenerationHistory, DramaLabShotGenerationError, findShot, persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { maintenanceWorkerContextHeaders, requestRuntimeCredential } from "@/lib/server/maintenance-auth";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

/**
 * 对应 L `POST /storyboards/:id/frame-prompt`（framePromptService.generateFramePrompt）：
 * 用 AI 规划某一帧（首/关键/尾）的提示词并直接提交帧图任务。
 *
 * 复用 `prepareDramaLabFrame`（该服务无模块身份耦合，且内含 L 的帧上下文与参考图规则），
 * 差别只有：项目归属校验换成 one-click-film 前缀、不走教学版阶段闸门、
 * 上游 context 的 featureModule 写 one-click-film 以修正商单计费归属。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const url = new URL(request.url);
        const episodeId = url.searchParams.get("episodeId")?.trim() || "";
        const frameType = url.searchParams.get("frameType")?.trim() || "";
        if (!episodeId) throw new DramaLabShotGenerationError("当前剧集不能为空");
        if (!isDramaShotFrameType(frameType)) throw new DramaLabShotGenerationError("frameType 必须是 first、key 或 last");

        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new DramaLabShotGenerationError("一键成片项目不存在", 404);

        const { shot } = findShot(project, episodeId, shotId);
        // 锁定的帧不得被覆盖，与 L / 创作工坊一致。
        if (shot.frames?.[frameType]?.locked) {
            const label = frameType === "first" ? "首帧" : frameType === "key" ? "关键帧" : "尾帧";
            throw new DramaLabShotGenerationError(`当前${label}已锁定，请先解锁后再修改`, 409);
        }

        const attemptNo = (shot.frames?.[frameType]?.attempt || 0) + 1;
        const requestId = `one-click-film-frame:${project.id}:${episodeId}:${shotId}:${frameType}:attempt-${attemptNo}`;
        const publicOrigin = resolvePublicRequestOrigin(request);
        const cookie = request.headers.get("cookie") || "";
        const prepared = await prepareDramaLabFrame({ userId: user.id, origin: publicOrigin, cookie, requestId, project, episodeId, shotId, frameType });

        const settings = await getAuthSettings();
        const model = settings.defaultModels.imageModel;
        if (!model) throw new DramaLabShotGenerationError("后台尚未配置可用的默认图片模型", 503);

        const origin = resolveInternalOrigin(publicOrigin);
        const credential = requestRuntimeCredential(request, user.id);
        const workerHeaders = credential ? maintenanceWorkerContextHeaders(credential) : null;
        const response = await fetchInternalApi(`${origin}/api/image-tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(workerHeaders || (credential ? { cookie: credential } : {})),
                "X-VOZEB-PRO-Client-Request-Id": requestId,
                "X-VOZEB-PRO-Attempt-No": String(attemptNo),
            },
            body: JSON.stringify({
                kind: prepared.references.length ? "edit" : "generation",
                config: { model, size: project.ratio },
                prompt: prepared.prompt,
                references: prepared.references.map((reference) => ({
                    id: reference.id,
                    name: reference.label,
                    type: "image/png",
                    dataUrl: reference.url,
                    url: reference.url,
                    serverUrl: reference.url.startsWith("/") ? reference.url : undefined,
                })),
                source: "drama",
                title: `${project.title} · ${shotId} · ${frameType}`,
                context: {
                    conversationId: project.creativeConversationId,
                    surface: "drama",
                    // 商单归属：不得写 drama-lab。
                    featureModule: "one-click-film",
                    projectId: project.id,
                    episodeId,
                    shotId,
                    frameType,
                    attemptNo,
                    clientRequestId: requestId,
                },
            }),
        });
        const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string; status?: string }; error?: string };
        if (!response.ok || !payload.task?.id) throw new DramaLabShotGenerationError(payload.error || "帧图任务创建失败", response.status >= 400 && response.status < 600 ? response.status : 502);

        // 旧帧图进历史再被覆盖，避免用户丢掉上一版结果。
        const currentFrame = shot.frames?.[frameType];
        const history = currentFrame?.url
            ? appendDramaLabGenerationHistory(currentFrame.history, {
                  id: `frame:${frameType}:${currentFrame.taskId || currentFrame.url}`,
                  taskId: currentFrame.taskId || `frame:${frameType}:${currentFrame.url}`,
                  url: currentFrame.url,
                  prompt: currentFrame.prompt || "",
                  createdAt: new Date().toISOString(),
                  ...(currentFrame.width === undefined ? {} : { width: currentFrame.width }),
                  ...(currentFrame.height === undefined ? {} : { height: currentFrame.height }),
              })
            : currentFrame?.history;

        await persistDramaLabShotUpdate({
            userId: user.id,
            project,
            episodeId,
            shotId,
            patch: {
                frames: {
                    ...shot.frames,
                    [frameType]: {
                        prompt: prepared.prompt,
                        description: prepared.description,
                        status: payload.task.status === "success" ? "success" : "running",
                        taskId: payload.task.id,
                        attempt: attemptNo,
                        history,
                        source: "generated" as const,
                        locked: false,
                    },
                },
            },
            retryOnConflict: false,
        });

        return NextResponse.json({ code: 0, data: { task: payload.task, frameType, templateKey: prepared.templateKey, prompt: prepared.prompt, description: prepared.description }, msg: "帧图任务已创建" });
    } catch (error) {
        const status = error instanceof DramaLabShotGenerationError || error instanceof DramaProjectStoreError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "帧图任务创建失败" }, { status });
    }
}
