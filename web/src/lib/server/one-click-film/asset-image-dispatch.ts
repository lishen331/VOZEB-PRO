import { getAuthSettings } from "@/lib/auth/store";
import type { DramaProject } from "@/lib/drama-project-contract";
import { fetchInternalApi } from "@/lib/server/internal-origin";
import { maintenanceWorkerContextHeaders } from "@/lib/server/maintenance-auth";

import { OneClickAssetImageError, buildOneClickAssetImageRequest, findOneClickAsset, type OneClickAssetKind } from "./asset-image-service";

export type OneClickAssetDispatchRuntime = { userId: string; origin: string; credential: string };

/**
 * 提交一个资产设定图任务到 `/api/image-tasks`。
 *
 * 单个生成与批量生成共用这一处，避免两条链路各写一份 context ——
 * 一旦分叉，很容易出现某一条漏写 `featureModule` 导致商单用量记不到名下。
 */
export async function dispatchOneClickAssetImage(project: DramaProject, kind: OneClickAssetKind, assetId: string, runtime: OneClickAssetDispatchRuntime, requestedLayout?: string) {
    const asset = findOneClickAsset(project, kind, assetId);
    const prepared = buildOneClickAssetImageRequest(project, kind, asset, requestedLayout);

    const settings = await getAuthSettings();
    const model = settings.defaultModels.imageModel;
    if (!model) throw new OneClickAssetImageError("后台尚未配置可用的默认图片模型", 503);

    const requestId = `one-click-film-asset-image:${project.id}:${assetId}:${prepared.layout}`;
    const workerHeaders = runtime.credential ? maintenanceWorkerContextHeaders(runtime.credential) : null;

    const response = await fetchInternalApi(`${runtime.origin}/api/image-tasks`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(workerHeaders || (runtime.credential ? { cookie: runtime.credential } : {})),
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
    return { task: payload.task, layout: prepared.layout, prompt: prepared.prompt, assetName: asset.name };
}
