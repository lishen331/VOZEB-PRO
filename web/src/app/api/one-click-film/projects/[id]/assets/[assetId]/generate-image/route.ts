import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getAuthSettings } from "@/lib/auth/store";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { maintenanceWorkerContextHeaders, requestRuntimeCredential } from "@/lib/server/maintenance-auth";
import { OneClickAssetImageError, buildOneClickAssetImageRequest, findOneClickAsset, type OneClickAssetKind } from "@/lib/server/one-click-film/asset-image-service";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

type Body = { kind?: unknown; generationLayout?: unknown };

/**
 * 资产设定图生成，对应 L 的：
 * - `POST /characters/:id/generate-image`
 * - `POST /characters/:id/generate-four-view-image`
 * - `POST /scenes/:id/generate-image` / `generate-four-view-image`
 *
 * 为什么走服务端而不是照抄创作工坊面板的客户端 `createImageGenerationTask`：
 * 那个客户端助手的 `taskContext` **不支持 featureModule 字段**，商单用量会记不到
 * one-click-film 名下。这里直连 `/api/image-tasks` 并显式写归属。
 *
 * 提示词与参考图顺序复用 `buildDramaLabAssetImagePrompt` / `dramaAssetReferences`，
 * 保证与 L 等价。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, assetId } = await params;
        const body = await readJsonBody<Body>(request, 64 * 1024).catch(() => ({}) as Body);
        const kind: OneClickAssetKind = body.kind === "scenes" || body.kind === "props" ? body.kind : "characters";

        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickAssetImageError("一键成片项目不存在", 404);

        const asset = findOneClickAsset(project, kind, assetId);
        const prepared = buildOneClickAssetImageRequest(project, kind, asset, typeof body.generationLayout === "string" ? body.generationLayout : undefined);

        const settings = await getAuthSettings();
        const model = settings.defaultModels.imageModel;
        if (!model) throw new OneClickAssetImageError("后台尚未配置可用的默认图片模型", 503);

        const requestId = `one-click-film-asset-image:${project.id}:${assetId}:${prepared.layout}`;
        const origin = resolveInternalOrigin(resolvePublicRequestOrigin(request));
        const credential = requestRuntimeCredential(request, user.id);
        const workerHeaders = credential ? maintenanceWorkerContextHeaders(credential) : null;

        const response = await fetchInternalApi(`${origin}/api/image-tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(workerHeaders || (credential ? { cookie: credential } : {})),
                "X-VOZEB-PRO-Client-Request-Id": requestId,
            },
            body: JSON.stringify({
                kind: prepared.references.length ? "edit" : "generation",
                config: { model, size: project.ratio },
                prompt: prepared.prompt,
                references: prepared.references.map((reference) => ({
                    id: reference.id,
                    name: reference.label || asset.name,
                    type: "image/png",
                    dataUrl: reference.url,
                    url: reference.url,
                    serverUrl: reference.url.startsWith("/") ? reference.url : undefined,
                })),
                source: "drama",
                title: `${project.title} · ${asset.name}设定图`,
                context: {
                    conversationId: project.creativeConversationId,
                    surface: "drama",
                    // 商单归属：不得写 drama-lab。
                    featureModule: "one-click-film",
                    projectId: project.id,
                    clientRequestId: requestId,
                },
            }),
        });
        const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string; status?: string }; error?: string };
        if (!response.ok || !payload.task?.id) {
            throw new OneClickAssetImageError(payload.error || "资产设定图任务创建失败", response.status >= 400 && response.status < 600 ? response.status : 502);
        }

        return NextResponse.json({ code: 0, data: { task: payload.task, layout: prepared.layout, prompt: prepared.prompt }, msg: "资产设定图任务已创建" });
    } catch (error) {
        const status = error instanceof OneClickAssetImageError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "资产设定图任务创建失败" }, { status });
    }
}
