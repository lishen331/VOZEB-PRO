import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBody } from "@/lib/auth/request";
import { createDramaProjectForUser, listDramaProjectSummariesForUser, getDramaProjectForUser } from "@/lib/server/drama-project-service";
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
    const body = (await readJsonBody(request).catch(() => ({}))) as Record<string, unknown>;
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
    // 这里原先会调 ensureDramaLabProjectGroup，把每个商单项目写进创作工坊协作组表。
    // 后果是教学版的协作成员校验与阶段审批配置会真实拦住商单生产链路（规范 §9.1/§9.2 禁止两者互相影响）。
    //
    // 移除是安全的，已逐条验证：
    // - getDramaProjectForUser → getDramaProject(id, userId)，只按 id+user_id 查，不碰协作组；
    // - assertDramaLabStageAllowed 在查不到组时直接 return，成为空操作；
    // - resolveDramaLabProjectForRequest 在无组时直接返回项目（少一层成员校验）。
    // 已存在的旧项目仍保留其协作组，创建者是 owner/active，不会被锁在外面。
    return NextResponse.json({ code: 0, data: { project: { id: project.id, title: project.title } }, msg: "项目创建成功" });
}
