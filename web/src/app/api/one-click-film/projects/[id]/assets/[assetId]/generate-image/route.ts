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

type Body = { kind?: unknown; generationLayout?: unknown };

/**
 * 资产设定图生成，对应 L 的：
 * - \`POST /characters/:id/generate-image\`
 * - \`POST /characters/:id/generate-four-view-image\`
 * - \`POST /scenes/:id/generate-image\` / \`generate-four-view-image\`
 * - \`POST /props/:id/generate\`
 *
 * 为什么走服务端而不是照抄创作工坊面板的客户端 \`createImageGenerationTask\`：
 * 那个客户端助手的 \`taskContext\` **不支持 featureModule 字段**，商单用量会记不到
 * one-click-film 名下。上游派发统一在 \`dispatchOneClickAssetImage\` 里，
 * 与批量生成共用同一处 context，避免两条链路分叉后漏写归属。
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

        const result = await dispatchOneClickAssetImage(
            project,
            kind,
            assetId,
            { userId: user.id, origin: resolveInternalOrigin(resolvePublicRequestOrigin(request)), credential: requestRuntimeCredential(request, user.id) },
            typeof body.generationLayout === "string" ? body.generationLayout : undefined,
        );

        return NextResponse.json({ code: 0, data: { task: result.task, layout: result.layout, prompt: result.prompt }, msg: "资产设定图任务已创建" });
    } catch (error) {
        const status = error instanceof OneClickAssetImageError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "资产设定图任务创建失败" }, { status });
    }
}
