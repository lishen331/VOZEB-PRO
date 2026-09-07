import { DramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { DramaLabTaskError, retryDramaLabTask } from "@/lib/server/drama-lab-task-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "Please log in" }, { status: 401 });
    try {
        const { id, taskId } = await params;
        const task = await retryDramaLabTask({ userId: user.id, projectId: id, taskId, origin: resolveInternalOrigin(new URL(request.url).origin), cookie: request.headers.get("cookie") || "" });
        return NextResponse.json({ code: 0, data: task, msg: "Workflow retry scheduled" });
    } catch (error) {
        const status = error instanceof DramaLabTaskError || error instanceof DramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "Unable to retry task" }, { status });
    }
}
