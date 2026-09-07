import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { deleteLibraryAssetForUser, LibraryAssetServiceError, updateLibraryAssetForUser } from "@/lib/server/library-asset-service";
import { FeatureModuleDisabledError, requireFeatureModuleEnabled } from "@/lib/server/feature-module-access";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        await requireFeatureModuleEnabled("assets");
        const parsed = await readJsonBodyResult<unknown>(request);
        if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
        const asset = await updateLibraryAssetForUser(user.id, (await context.params).id, parsed.data);
        return NextResponse.json({ code: 0, data: { asset }, msg: "素材已更新" });
    } catch (error) {
        return serviceError(error);
    }
}

export async function DELETE(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        await requireFeatureModuleEnabled("assets");
        await deleteLibraryAssetForUser(user.id, (await context.params).id);
        return NextResponse.json({ code: 0, data: { deleted: true }, msg: "素材已删除" });
    } catch (error) {
        return serviceError(error);
    }
}

function serviceError(error: unknown) {
    if (error instanceof FeatureModuleDisabledError) return NextResponse.json({ code: 403, data: null, msg: error.message }, { status: 403 });
    if (error instanceof LibraryAssetServiceError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
    throw error;
}
