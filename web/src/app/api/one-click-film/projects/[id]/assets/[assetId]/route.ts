import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickAssetCrudError, deleteOneClickAsset, updateOneClickAsset, type OneClickAssetPatch } from "@/lib/server/one-click-film/asset-crud";
import type { OneClickAssetKind } from "@/lib/server/one-click-film/asset-image-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; assetId: string }> };

function assetKindOf(value: unknown): OneClickAssetKind {
    return value === "scenes" || value === "props" ? value : "characters";
}

async function resolveProject(userId: string, projectId: string) {
    const project = await getDramaProjectForUser(userId, projectId);
    if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickAssetCrudError("一键成片项目不存在", 404);
    return project;
}

function failure(error: unknown, fallback: string) {
    const status = error instanceof OneClickAssetCrudError ? error.status : 500;
    return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : fallback }, { status });
}

/** 更新资产可编辑字段（白名单），不触碰 references / primaryReferenceId。 */
export async function PUT(request: Request, { params }: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, assetId } = await params;
        const body = await readJsonBody<OneClickAssetPatch & { kind?: unknown }>(request, 256 * 1024).catch(() => ({}) as OneClickAssetPatch & { kind?: unknown });
        const existing = await resolveProject(user.id, id);
        const { project, asset } = updateOneClickAsset(existing, assetKindOf(body.kind), assetId, body);
        const saved = await updateDramaProjectForUser(user.id, id, project);
        return NextResponse.json({ code: 0, data: { asset, project: saved }, msg: "资产已更新" });
    } catch (error) {
        return failure(error, "资产更新失败");
    }
}

/** 删除资产，并同步清掉分镜里的绑定，避免留下幽灵资产引用。 */
export async function DELETE(request: Request, { params }: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, assetId } = await params;
        const kind = assetKindOf(new URL(request.url).searchParams.get("kind"));
        const existing = await resolveProject(user.id, id);
        const project = deleteOneClickAsset(existing, kind, assetId);
        const saved = await updateDramaProjectForUser(user.id, id, project);
        return NextResponse.json({ code: 0, data: { project: saved }, msg: "资产已删除" });
    } catch (error) {
        return failure(error, "资产删除失败");
    }
}
