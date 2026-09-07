import { DramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { DramaLabTaskError, listDramaLabTasksForProject } from "@/lib/server/drama-lab-task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "Please log in" }, { status: 401 });
    try {
        const { id } = await params;
        const status = new URL(request.url).searchParams.get("status") || "active";
        const data = await listDramaLabTasksForProject({ userId: user.id, projectId: id, status });
        return NextResponse.json({ code: 0, data, msg: "OK" });
    } catch (error) {
        const status = error instanceof DramaLabTaskError || error instanceof DramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "Unable to read Drama Lab tasks" }, { status });
    }
}
