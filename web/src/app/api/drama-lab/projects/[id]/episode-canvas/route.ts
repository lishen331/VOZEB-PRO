import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { canvasProjectError } from "@/lib/server/canvas-project-service";
import { DramaLabEpisodeCanvasServiceError, getOrCreateDramaLabEpisodeCanvasForUser } from "@/lib/server/drama-lab-episode-canvas-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    const parsed = await readJsonBodyResult<{ episodeId?: unknown; shotId?: unknown }>(request);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });

    try {
        const { id } = await params;
        const episodeId = typeof parsed.data.episodeId === "string" ? parsed.data.episodeId : "";
        const shotId = typeof parsed.data.shotId === "string" ? parsed.data.shotId : "";
        const resolved = shotId ? await getOrCreateDramaLabEpisodeCanvasForUser(user.id, id, episodeId, shotId) : await getOrCreateDramaLabEpisodeCanvasForUser(user.id, id, episodeId);
        return NextResponse.json({ code: 0, data: { canvasId: resolved.project.id, project: resolved.project }, msg: "OK" });
    } catch (error) {
        if (error instanceof DramaLabEpisodeCanvasServiceError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        const canvasError = canvasProjectError(error);
        if (canvasError) return NextResponse.json({ code: canvasError.status, data: null, msg: canvasError.message }, { status: canvasError.status });
        throw error;
    }
}
