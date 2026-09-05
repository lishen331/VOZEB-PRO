import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { DramaLabCollaborationError, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { DramaLabWorkflowError, getDramaLabWorkflowTask } from "@/lib/server/drama-lab-workflow-task-service";
import { readDramaLabWorkflowExportArtifact } from "@/lib/server/drama-lab-workflow-export-artifact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; artifactId: string }> };

/** Download a ZIP produced by the authenticated workflow task. */
export async function GET(request: Request, { params }: Context) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id: projectId, artifactId } = await params;
        const task = await getDramaLabWorkflowTask(artifactId, user.id, projectId);
        if (!task) return NextResponse.json({ code: 404, data: null, msg: "导出产物不存在或无权访问" }, { status: 404 });
        await resolveDramaLabProjectForRequest(user.id, projectId);
        const output = task.workflow.outputRefs.find((item) => item.artifactId === artifactId);
        if (!output) return NextResponse.json({ code: 404, data: null, msg: "导出产物不存在或已过期" }, { status: 404 });
        const artifact = await readDramaLabWorkflowExportArtifact(artifactId);
        if (!artifact || artifact.metadata.taskId !== task.id || artifact.metadata.projectId !== projectId) return NextResponse.json({ code: 404, data: null, msg: "导出产物不存在或已过期" }, { status: 404 });
        return new Response(artifact.data, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.metadata.fileName)}`,
                "Content-Length": String(artifact.data.byteLength),
                "Cache-Control": "private, no-store, max-age=0",
                Pragma: "no-cache",
            },
        });
    } catch (error) {
        const status = error instanceof DramaLabWorkflowError || error instanceof DramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "导出产物读取失败" }, { status });
    }
}
