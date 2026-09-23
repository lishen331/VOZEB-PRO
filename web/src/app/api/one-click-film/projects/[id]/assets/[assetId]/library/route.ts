import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { createLibraryAssetForUser } from "@/lib/server/library-asset-service";
import { getLibraryAsset } from "@/lib/server/library-asset-store";
import { applyOneClickAssetPatch } from "@/lib/server/one-click-film/asset-reference-service";
import { findOneClickAsset, type OneClickAssetKind } from "@/lib/server/one-click-film/asset-image-service";
import { OneClickAssetLibraryError, buildOneClickLibraryApply, buildOneClickLibraryPayload } from "@/lib/server/one-click-film/asset-library-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { kind?: unknown; action?: unknown; libraryAssetId?: unknown };

function assetKindOf(value: unknown): OneClickAssetKind {
    return value === "scenes" || value === "props" ? value : "characters";
}

/**
 * 素材库桥接，对应 L 的：
 * - `POST /{characters,scenes,props}/:id/add-to-library` → `action: "save"`
 * - `POST .../add-to-material-library` → 同一动作（V 只有统一素材库，靠 metadata.dramaAssetType 区分）
 * - `PUT /{characters,scenes}/:id/image-from-library` → `action: "apply"`
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, assetId } = await params;
        const body = await readJsonBody<Body>(request, 64 * 1024).catch(() => ({}) as Body);
        const kind = assetKindOf(body.kind);
        const action = body.action === "apply" ? "apply" : "save";

        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickAssetLibraryError("一键成片项目不存在", 404);
        const asset = findOneClickAsset(existing, kind, assetId);

        if (action === "save") {
            const created = await createLibraryAssetForUser(user.id, buildOneClickLibraryPayload(asset, kind));
            return NextResponse.json({ code: 0, data: { libraryAssetId: created.id }, msg: "已存入素材库" });
        }

        const libraryAssetId = typeof body.libraryAssetId === "string" ? body.libraryAssetId.trim() : "";
        if (!libraryAssetId) throw new OneClickAssetLibraryError("素材不能为空");
        // 只读当前用户自己的素材，避免跨账号取用。
        const record = await getLibraryAsset(user.id, libraryAssetId);
        if (!record) throw new OneClickAssetLibraryError("素材不存在", 404);

        const patch = buildOneClickLibraryApply(asset, record as Parameters<typeof buildOneClickLibraryApply>[1]);
        const nextProject = applyOneClickAssetPatch(existing, kind, assetId, patch);
        const saved = await updateDramaProjectForUser(user.id, id, nextProject);
        return NextResponse.json({ code: 0, data: { project: saved, primaryReferenceId: patch.primaryReferenceId }, msg: "已取用素材库图片" });
    } catch (error) {
        const status = error instanceof OneClickAssetLibraryError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "素材库操作失败" }, { status });
    }
}
