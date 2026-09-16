import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { assertDramaLabStageAllowed, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { DramaLabAssetAiError, runDramaLabAssetAiAction } from "@/lib/server/drama-lab-asset-ai-service";
import { FeatureModuleDisabledError, requireFeatureModuleEnabled } from "@/lib/server/feature-module-access";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        await requireFeatureModuleEnabled("drama-lab");
        const { id, assetId } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 128 * 1024);
        const kind = body.kind === "characters" || body.kind === "scenes" || body.kind === "props" ? body.kind : "characters";
        const action = body.action === "describe" || body.action === "prompt" || body.action === "anchor" || body.action === "stages" ? body.action : "prompt";
        const { project } = await resolveDramaLabProjectForRequest(user.id, id);
        await assertDramaLabStageAllowed(user.id, id, "assets");
        if (!project) return NextResponse.json({ code: 404, data: null, msg: "短剧项目不存在" }, { status: 404 });
        const result = await runDramaLabAssetAiAction({
            userId: user.id,
            origin: resolveInternalOrigin(new URL(request.url).origin),
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
        const status = error instanceof FeatureModuleDisabledError ? 403 : error instanceof DramaLabAssetAiError || isDramaLabCollaborationError(error) ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "资产 AI 操作失败" }, { status });
    }
}
