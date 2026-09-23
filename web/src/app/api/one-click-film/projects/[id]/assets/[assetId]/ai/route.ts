import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { DramaLabAssetAiError, runDramaLabAssetAiAction } from "@/lib/server/drama-lab-asset-ai-service";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

type AssetAiBody = { kind?: unknown; action?: unknown; requestId?: unknown; generationLayout?: unknown };

/**
 * 资产 AI 操作。一条路由覆盖 L 的四个端点：
 *
 * | L 接口 | action |
 * |---|---|
 * | `POST /characters/:id/extract-from-image` | `describe` |
 * | `POST /characters/:id/generate-prompt` | `prompt` |
 * | `POST /characters/:id/extract-anchors` | `anchor` |
 * | `POST /characters/:id/generate-stages` | `stages` |
 *
 * 场景与道具走同一套（`kind`）。复用 `runDramaLabAssetAiAction`（已核实无模块身份耦合），
 * 差别只有项目归属校验换成 one-click-film 前缀、不走教学版阶段闸门。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, assetId } = await params;
        const body = await readJsonBody<AssetAiBody>(request, 128 * 1024).catch(() => ({}) as AssetAiBody);
        const kind = body.kind === "characters" || body.kind === "scenes" || body.kind === "props" ? body.kind : "characters";
        const action = body.action === "describe" || body.action === "prompt" || body.action === "anchor" || body.action === "stages" ? body.action : "prompt";

        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, data: null, msg: "一键成片项目不存在" }, { status: 404 });

        const result = await runDramaLabAssetAiAction({
            userId: user.id,
            origin: resolveInternalOrigin(resolvePublicRequestOrigin(request)),
            cookie: request.headers.get("cookie") || "",
            requestId: typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim().slice(0, 160) : randomUUID(),
            project,
            assetId,
            kind,
            action,
            generationLayout: body.generationLayout === "four_view" || body.generationLayout === "single" ? body.generationLayout : undefined,
        });
        return NextResponse.json({ code: 0, data: result, msg: "资产 AI 操作完成" });
    } catch (error) {
        const status = error instanceof DramaLabAssetAiError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "资产 AI 操作失败" }, { status });
    }
}
