import { syncOneClickProjectGeneration } from "@/lib/server/one-click-film/sync-runner";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBody } from "@/lib/auth/request";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    try {
        const { id } = await params;
        let project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:") && !project.sourceHandoffId?.startsWith("one-click:")) {
            return NextResponse.json({ code: 404, msg: "一键成片项目不存在" }, { status: 404 });
        }
        try {
            const synced = await syncOneClickProjectGeneration({ userId: user.id, project, origin: resolvePublicRequestOrigin(request), cookie: request.headers.get("cookie") || "" });
            project = { ...project, ...synced, executionProfile: project.executionProfile };
        } catch (error) {
            // A user edit won the optimistic lock: never replay the old result patch over it.
            if (!(error instanceof DramaProjectStoreError) || error.status !== 409) throw error;
            project = await getDramaProjectForUser(user.id, id);
        }
        return NextResponse.json({ code: 0, data: { project }, msg: "OK" });
    } catch (error) {
        return NextResponse.json({ code: 404, msg: error instanceof Error ? error.message : "项目不存在" }, { status: 404 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    try {
        const { id } = await params;
        const existing = await getDramaProjectForUser(user.id, id);
        if (!existing.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, msg: "一键成片项目不存在" }, { status: 404 });
        const body = (await readJsonBody(request).catch(() => ({}))) as Record<string, unknown>;
        const next = { ...existing, ...body, id: existing.id, sourceHandoffId: existing.sourceHandoffId, updatedAt: new Date().toISOString() };
        const project = await updateDramaProjectForUser(user.id, id, next);
        return NextResponse.json({ code: 0, data: { project }, msg: "项目更新成功" });
    } catch (error) {
        return NextResponse.json({ code: 400, msg: error instanceof Error ? error.message : "项目更新失败" }, { status: 400 });
    }
}
