import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickAssetCrudError, createOneClickAsset, type OneClickAssetPatch } from "@/lib/server/one-click-film/asset-crud";
import type { OneClickAssetKind } from "@/lib/server/one-click-film/asset-image-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = OneClickAssetPatch & { kind?: unknown };

function assetKindOf(value: unknown): OneClickAssetKind {
    return value === "scenes" || value === "props" ? value : "characters";
}

/**
 * 手工新增资产。
 *
 * L 侧对应 `POST /scenes` / `POST /props`（角色由提取产生，但也允许手工补）。
 * 之前一键成片只能靠 executor 的 assets 步自动提取，用户无法手动加一个角色，
 * 按规范 §7 P0「不得只有壳子」属缺口，这里补上。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id } = await params;
        const body = await readJsonBody<Body>(request, 256 * 1024).catch(() => ({}) as Body);
        const kind = assetKindOf(body.kind);

        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickAssetCrudError("一键成片项目不存在", 404);

        const { project, asset } = createOneClickAsset(existing, kind, body);
        const saved = await updateDramaProjectForUser(user.id, id, project);
        return NextResponse.json({ code: 0, data: { asset, project: saved }, msg: "资产已创建" }, { status: 201 });
    } catch (error) {
        const status = error instanceof OneClickAssetCrudError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "资产创建失败" }, { status });
    }
}
