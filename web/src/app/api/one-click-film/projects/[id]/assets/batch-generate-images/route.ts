import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { requestRuntimeCredential } from "@/lib/server/maintenance-auth";
import { dispatchOneClickAssetImage } from "@/lib/server/one-click-film/asset-image-dispatch";
import { OneClickAssetImageError, type OneClickAssetKind } from "@/lib/server/one-click-film/asset-image-service";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

type Body = { kind?: unknown; assetIds?: unknown; generationLayout?: unknown };

/** L `batchGenerateImages` 的硬上限：单次最多 10 个。 */
const MAX_BATCH = 10;

/**
 * 批量生成资产设定图，对应 L `POST /characters/batch-generate-images`。
 *
 * 与 L 一致的语义：
 * - `assetIds` 不能为空；
 * - 单次最多 10 个，超出直接拒绝（防止一次点掉大量额度）；
 * - 逐个派发，单个失败不连坐其余，返回每个的结果与错误。
 *
 * 上游派发复用 `dispatchOneClickAssetImage`，因此计费归属同样是 one-click-film。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id } = await params;
        const body = await readJsonBody<Body>(request, 128 * 1024).catch(() => ({}) as Body);
        const kind: OneClickAssetKind = body.kind === "scenes" || body.kind === "props" ? body.kind : "characters";
        const assetIds = Array.isArray(body.assetIds) ? body.assetIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];

        if (!assetIds.length) throw new OneClickAssetImageError("assetIds 不能为空");
        if (assetIds.length > MAX_BATCH) throw new OneClickAssetImageError(`单次最多生成 ${MAX_BATCH} 个资产`);

        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickAssetImageError("一键成片项目不存在", 404);

        const dispatchRuntime = {
            userId: user.id,
            origin: resolveInternalOrigin(resolvePublicRequestOrigin(request)),
            credential: requestRuntimeCredential(request, user.id),
        };
        const requestedLayout = typeof body.generationLayout === "string" ? body.generationLayout : undefined;

        // 逐个派发：单个资产失败（缺描述、缺模型等）不应连坐其余资产。
        const results: Array<{ assetId: string; taskId?: string; layout?: string; error?: string }> = [];
        for (const assetId of assetIds) {
            try {
                const result = await dispatchOneClickAssetImage(project, kind, assetId, dispatchRuntime, requestedLayout);
                results.push({ assetId, taskId: result.task.id, layout: result.layout });
            } catch (error) {
                results.push({ assetId, error: error instanceof Error ? error.message : "资产设定图任务创建失败" });
            }
        }

        const created = results.filter((item) => item.taskId).length;
        const failed = results.length - created;
        return NextResponse.json({ code: 0, data: { results, created, failed }, msg: failed ? `已提交 ${created} 个任务，${failed} 个失败` : `已提交 ${created} 个任务` });
    } catch (error) {
        const status = error instanceof OneClickAssetImageError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "批量生成失败" }, { status });
    }
}
