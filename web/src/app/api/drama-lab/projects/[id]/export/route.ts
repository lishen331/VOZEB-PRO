import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { assertDramaLabStageAllowed, DramaLabCollaborationError, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { DramaLabProjectArchiveError, exportDramaLabProjectForUser } from "@/lib/server/drama-lab-project-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** GET /api/drama-lab/projects/:id/export */
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id } = await context.params;
        const { ownerUserId } = await resolveDramaLabProjectForRequest(user.id, id);
        await assertDramaLabStageAllowed(user.id, id, "final_export");
        const result = await exportDramaLabProjectForUser({
            userId: user.id,
            projectId: id,
            projectOwnerUserId: ownerUserId,
            origin: resolveInternalOrigin(new URL(request.url).origin),
            cookie: request.headers.get("cookie") || "",
        });
        return new Response(result.data, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
                "Content-Length": String(result.data.byteLength),
                "Cache-Control": "private, no-store, max-age=0",
                Pragma: "no-cache",
            },
        });
    } catch (error) {
        if (error instanceof DramaLabProjectArchiveError || error instanceof DramaLabCollaborationError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        console.error("drama lab project export failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "短剧项目导出失败" }, { status: 500 });
    }
}
