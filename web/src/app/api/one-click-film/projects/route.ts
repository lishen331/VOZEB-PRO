import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createDramaProjectForUser, listDramaProjectSummariesForUser, getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { ensureDramaLabProjectGroup } from "@/lib/server/drama-lab-collaboration-service";
export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    const result = await listDramaProjectSummariesForUser(user.id, { page: 1, pageSize: 100, executionProfile: "production" });
    const projects = (await Promise.all(result.items.map(async (summary) => ({ summary, project: await getDramaProjectForUser(user.id, summary.id).catch(() => null) }))))
        .filter((item) => item.project?.sourceHandoffId?.startsWith("one-click-film:"))
        .map((item) => item.summary);
    return NextResponse.json({ code: 0, data: { projects, total: projects.length }, msg: "OK" });
}
export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ code: 400, msg: "项目名称不能为空" }, { status: 400 });
    const project = await createDramaProjectForUser(
        user.id,
        {
            title,
            summary: typeof body.summary === "string" ? body.summary.trim() : "",
            style: typeof body.style === "string" ? body.style : "电影感国漫",
            ratio: typeof body.ratio === "string" ? body.ratio : "16:9",
            sourceHandoffId: `one-click-film:${crypto.randomUUID()}`,
        },
        { executionProfile: "production" },
    );
    await ensureDramaLabProjectGroup(project.id, user.id);
    return NextResponse.json({ code: 0, data: { project: { id: project.id, title: project.title } }, msg: "项目创建成功" });
}
