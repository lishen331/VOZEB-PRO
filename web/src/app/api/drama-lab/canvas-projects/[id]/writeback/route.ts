import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { canvasProjectError } from "@/lib/server/canvas-project-service";
import { DramaCanvasWritebackError, writebackDramaCanvasForUser } from "@/lib/server/drama-lab-canvas-writeback-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/drama-lab/canvas-projects/:id/writeback
 *
 * Canvas results stay in the staging CanvasProject until this endpoint is
 * called explicitly. The service validates all project/episode/shot/asset
 * IDs and both optimistic versions before changing DramaProject.
 */
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const parsed = await readJsonBodyResult<unknown>(request, 64 * 1024);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
    try {
        const { id } = await context.params;
        const result = await writebackDramaCanvasForUser(user.id, id, parsed.data);
        return NextResponse.json({ code: 0, data: result, msg: "已应用到短剧" });
    } catch (error) {
        if (error instanceof DramaCanvasWritebackError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        const canvasError = canvasProjectError(error);
        if (canvasError) return NextResponse.json({ code: canvasError.status, data: null, msg: canvasError.message }, { status: canvasError.status });
        throw error;
    }
}
