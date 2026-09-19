import { planOneClickSequenceGrid } from "@/lib/server/one-click-film/sequence-grid-planner";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getAuthSettings } from "@/lib/auth/store";
import { DramaLabShotGenerationError, persistDramaLabShotUpdate, prepareDramaLabStoryboardImage } from "@/lib/server/drama-lab-shot-generation-service";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { maintenanceWorkerContextHeaders, requestRuntimeCredential } from "@/lib/server/maintenance-auth";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { sequenceGridPanelCount } from "@/lib/server/one-click-film/sequence-grid";
import type { DramaLabStoryboardSequenceMode } from "@/lib/drama-lab-storyboard-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

/**
 * 一键成片自有的分镜图生成入口，行为基线是 LocalMiniDrama。
 *
 * 不复用 /api/drama-lab/.../generate-image 的原因与视频侧一致：那条链路把
 * featureModule 写成 "drama-lab"，商单用量会记到教学版账上。提示词与参考图
 * 仍复用同一套 prepareDramaLabStoryboardImage，保证请求载荷与 L 等价。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new DramaLabShotGenerationError("当前剧集不能为空");
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new DramaLabShotGenerationError("一键成片项目不存在", 404);

        const prepared = await prepareDramaLabStoryboardImage(project, episodeId, shotId);

        // 序列图模式：query 显式指定优先，否则用分镜上已保存的选择。
        const requestedMode = new URL(request.url).searchParams.get("sequenceMode")?.trim();
        const sequenceMode: DramaLabStoryboardSequenceMode = requestedMode === "quad_grid" || requestedMode === "nine_grid" || requestedMode === "single" ? requestedMode : prepared.shot.storyboardSequenceMode || "single";
        const panelCount = sequenceGridPanelCount(sequenceMode);

        const settings = await getAuthSettings();
        const model = settings.defaultModels.imageModel;
        if (!model) throw new DramaLabShotGenerationError("后台尚未配置可用的默认图片模型", 503);

        const attemptNo = (prepared.shot.storyboardAttempt || 0) + 1;
        const requestId = `one-click-film-storyboard:${project.id}:${episodeId}:${shotId}:attempt-${attemptNo}`;
        const origin = resolveInternalOrigin(resolvePublicRequestOrigin(request));
        const credential = requestRuntimeCredential(request, user.id);
        const workerHeaders = credential ? maintenanceWorkerContextHeaders(credential) : null;

        const prompt = panelCount ? await planOneClickSequenceGrid({ project, episodeId, shotId, mode: sequenceMode }, { userId: user.id, origin, cookie: credential || "", requestId }) : prepared.prompt;

        const response = await fetchInternalApi(`${origin}/api/image-tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(workerHeaders || (credential ? { cookie: credential } : {})),
                "X-VOZEB-PRO-Client-Request-Id": requestId,
                "X-VOZEB-PRO-Attempt-No": String(attemptNo),
            },
            body: JSON.stringify({
                // 有参考图走编辑、无参考图走纯生成 —— 与 L 的分支一致。
                kind: prepared.references.length ? "edit" : "generation",
                config: { model, size: project.ratio },
                prompt,
                references: prepared.references.map((reference) => ({
                    id: reference.id,
                    name: reference.label,
                    type: "image/png",
                    dataUrl: reference.url,
                    url: reference.url,
                    serverUrl: reference.url.startsWith("/") ? reference.url : undefined,
                })),
                source: "drama",
                title: `${project.title} · ${prepared.shot.title}`,
                context: {
                    conversationId: project.creativeConversationId,
                    surface: "drama",
                    // 商单归属：不得写 drama-lab。
                    featureModule: "one-click-film",
                    projectId: project.id,
                    episodeId,
                    shotId,
                    attemptNo,
                    clientRequestId: requestId,
                    sequenceMode,
                },
            }),
        });
        const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string; status?: string; model?: string }; error?: string };
        if (!response.ok || !payload.task?.id) {
            throw new DramaLabShotGenerationError(payload.error || "分镜图任务创建失败", response.status >= 400 && response.status < 600 ? response.status : 502);
        }

        await persistDramaLabShotUpdate({
            userId: user.id,
            project,
            episodeId,
            shotId,
            patch: {
                storyboardStatus: payload.task.status === "success" ? "success" : "running",
                storyboardTaskId: payload.task.id,
                storyboardAttempt: attemptNo,
                storyboardError: undefined,
                // 落库供同步阶段判断是否要按象限拆图（拆图是纯本地操作，不计费）。
                storyboardSequenceMode: sequenceMode,
            },
        });
        return NextResponse.json({ code: 0, data: { task: payload.task, templateKey: prepared.templateKey, sequenceMode, panelCount }, msg: panelCount ? `网格分镜图任务已创建，完成后会自动拆成 ${panelCount} 个候选` : "分镜图任务已创建" });
    } catch (error) {
        const status = error instanceof DramaLabShotGenerationError || error instanceof DramaProjectStoreError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜图任务创建失败" }, { status });
    }
}
