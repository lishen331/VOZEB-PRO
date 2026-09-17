import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { DramaAssetReference } from "@/lib/drama-project-contract";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickAssetImageError, findOneClickAsset, type OneClickAssetKind } from "@/lib/server/one-click-film/asset-image-service";
import { OneClickAssetReferenceError, appendOneClickAssetReferences, applyOneClickAssetPatch, removeOneClickAssetReference, setOneClickAssetPrimaryReference } from "@/lib/server/one-click-film/asset-reference-service";
import { writeReferenceImageDataUrl } from "@/lib/server/reference-asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

type UploadItem = { dataUrl?: unknown; name?: unknown; width?: unknown; height?: unknown };
type Body = { kind?: unknown; action?: unknown; uploads?: unknown; referenceId?: unknown };

function assetKindOf(value: unknown): OneClickAssetKind {
    return value === "scenes" || value === "props" ? value : "characters";
}

function positive(value: unknown) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : undefined;
}

/**
 * 资产参考图管理，对应 L 的：
 * - `POST /characters/:id/upload-image` → `action: "upload"`
 * - `PUT /characters/:id/image`（设为主图）→ `action: "primary"`
 * - 移除参考图 → `action: "remove"`
 *
 * 上传走 V 的 `writeReferenceImageDataUrl` 持久化（不复制 L 的存储实现），
 * 主图排序与旧字段镜像语义与创作工坊一致。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, assetId } = await params;
        const body = await readJsonBody<Body>(request, 32 * 1024 * 1024).catch(() => ({}) as Body);
        const kind = assetKindOf(body.kind);
        const action = body.action === "primary" || body.action === "remove" ? body.action : "upload";

        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickAssetReferenceError("一键成片项目不存在", 404);
        const asset = findOneClickAsset(existing, kind, assetId);

        let patch: Partial<Parameters<typeof applyOneClickAssetPatch>[3]>;
        if (action === "upload") {
            const uploads = Array.isArray(body.uploads) ? (body.uploads as UploadItem[]) : [];
            const items = uploads.filter((item) => typeof item.dataUrl === "string" && item.dataUrl.startsWith("data:image/"));
            if (!items.length) throw new OneClickAssetReferenceError("请选择图片文件");
            const stored = await Promise.all(
                items.map(async (item) => {
                    const written = await writeReferenceImageDataUrl(String(item.dataUrl), {
                        ownerUserId: user.id,
                        source: "one-click-film-asset",
                        originalName: typeof item.name === "string" ? item.name : undefined,
                        projectId: existing.id,
                    });
                    const reference: DramaAssetReference = {
                        id: `reference-${crypto.randomUUID()}`,
                        url: written.url || `/api/reference-assets/${written.token}`,
                        storageKey: written.token,
                        source: "upload",
                        label: typeof item.name === "string" && item.name.trim() ? item.name.trim() : asset.name || "参考图",
                        createdAt: new Date().toISOString(),
                        ...(positive(item.width) === undefined ? {} : { width: positive(item.width) }),
                        ...(positive(item.height) === undefined ? {} : { height: positive(item.height) }),
                    };
                    return reference;
                }),
            );
            patch = appendOneClickAssetReferences(asset, stored);
        } else {
            const referenceId = typeof body.referenceId === "string" ? body.referenceId.trim() : "";
            if (!referenceId) throw new OneClickAssetReferenceError("参考图不能为空");
            patch = action === "primary" ? setOneClickAssetPrimaryReference(asset, referenceId) : removeOneClickAssetReference(asset, referenceId);
        }

        const nextProject = applyOneClickAssetPatch(existing, kind, assetId, patch);
        const saved = await updateDramaProjectForUser(user.id, id, nextProject);
        const message = action === "upload" ? "参考图已上传" : action === "primary" ? "已设为主参考图" : "参考图已移除";
        return NextResponse.json({ code: 0, data: { project: saved, references: patch.references, primaryReferenceId: patch.primaryReferenceId }, msg: message });
    } catch (error) {
        const status = error instanceof OneClickAssetReferenceError || error instanceof OneClickAssetImageError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "参考图操作失败" }, { status });
    }
}
