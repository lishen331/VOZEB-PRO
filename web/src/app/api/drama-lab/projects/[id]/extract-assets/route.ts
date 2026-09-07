import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { assertDramaLabStageAllowed, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { extractDramaLabAssets, isDramaLabAssetType, DramaLabAssetExtractionError } from "@/lib/server/drama-lab-asset-extraction-service";
import { FeatureModuleDisabledError, requireFeatureModuleEnabled } from "@/lib/server/feature-module-access";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        await requireFeatureModuleEnabled("drama-lab");
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 128 * 1024);
        const episodeId = typeof body.episodeId === "string" ? body.episodeId.trim() : "";
        const assetType = body.assetType;
        const requestId = typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim().slice(0, 160) : randomUUID();
        if (!episodeId || !isDramaLabAssetType(assetType)) return NextResponse.json({ code: 400, data: null, msg: "提取参数不正确" }, { status: 400 });

        const { project } = await resolveDramaLabProjectForRequest(user.id, id);
        await assertDramaLabStageAllowed(user.id, id, "assets");
        if (!project) return NextResponse.json({ code: 404, data: null, msg: "短剧项目不存在" }, { status: 404 });

        const result = await extractDramaLabAssets({
            userId: user.id,
            origin: new URL(request.url).origin,
            cookie: request.headers.get("cookie") || "",
            requestId,
            project,
            episodeId,
            assetType,
        });
        return NextResponse.json({ code: 0, data: result, msg: "资产提取完成" });
    } catch (error) {
        const status = error instanceof FeatureModuleDisabledError ? 403 : error instanceof DramaLabAssetExtractionError || error isDramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "资产提取失败" }, { status });
    }
}
