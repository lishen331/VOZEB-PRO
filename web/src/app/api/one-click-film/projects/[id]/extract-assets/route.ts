import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { DramaNamedAsset } from "@/lib/drama-project-contract";
import { DramaLabAssetExtractionError, extractDramaLabAssets, isDramaLabAssetType } from "@/lib/server/drama-lab-asset-extraction-service";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

type Body = { episodeId?: unknown; assetType?: unknown; requestId?: unknown };

/** L 的资产集合键与 assetType 的对应关系。 */
const COLLECTION = { character: "characters", scene: "scenes", prop: "props" } as const;

/**
 * 从本集剧本提取资产，对应 L 的：
 * - `POST /episodes/:episode_id/characters/extract`
 * - `POST /episodes/:episode_id/props/extract`
 * - 场景提取（L 在 scenes 域，共用同一套提取语义）
 *
 * 复用 `extractDramaLabAssets`（已核实无模块身份耦合、也不写 featureModule），
 * 但与创作工坊那条路由不同：这里**直接落库**并按名称去重。
 * L 的提取就是靠名称去重来避免重复锚点，创作工坊把落库交给前端二次写入，
 * 商单侧没有那层前端逻辑，若只返回不落库，用户点了等于没反应。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id } = await params;
        const body = await readJsonBody<Body>(request, 128 * 1024).catch(() => ({}) as Body);
        const episodeId = typeof body.episodeId === "string" ? body.episodeId.trim() : "";
        const assetType = body.assetType;
        if (!episodeId || !isDramaLabAssetType(assetType)) return NextResponse.json({ code: 400, data: null, msg: "提取参数不正确" }, { status: 400 });

        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, data: null, msg: "一键成片项目不存在" }, { status: 404 });

        const result = await extractDramaLabAssets({
            userId: user.id,
            origin: resolveInternalOrigin(resolvePublicRequestOrigin(request)),
            cookie: request.headers.get("cookie") || "",
            requestId: typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim().slice(0, 160) : randomUUID(),
            project: existing,
            episodeId,
            assetType,
        });

        // 按名称去重后追加：L 的提取语义就是名称唯一，重复名不产生第二个锚点。
        const collection = COLLECTION[assetType];
        const current = (existing[collection] as DramaNamedAsset[] | undefined) || [];
        const taken = new Set(current.map((item) => item.name.trim()).filter(Boolean));
        const added: DramaNamedAsset[] = [];
        for (const asset of result.assets as DramaNamedAsset[]) {
            const name = asset.name?.trim();
            if (!name || taken.has(name)) continue;
            taken.add(name);
            added.push({ ...asset, id: asset.id?.trim() || `asset-${randomUUID()}`, name });
        }

        if (!added.length) {
            return NextResponse.json({ code: 0, data: { added: 0, assets: [], project: existing }, msg: "没有发现新的资产" });
        }

        const saved = await updateDramaProjectForUser(user.id, id, { ...existing, [collection]: [...current, ...added] });
        return NextResponse.json({ code: 0, data: { added: added.length, assets: added, project: saved }, msg: `已提取 ${added.length} 个资产` });
    } catch (error) {
        const status = error instanceof DramaLabAssetExtractionError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "资产提取失败" }, { status });
    }
}
