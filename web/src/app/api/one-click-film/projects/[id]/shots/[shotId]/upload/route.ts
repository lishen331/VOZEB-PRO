import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { creativeUploadMaxBytes } from "@/lib/creative-upload";
import { readRequestBodyBytes } from "@/lib/server/request-body-limit";
import { isOneClickShotUploadTarget, uploadOneClickShotMedia } from "@/lib/server/one-click-film/shot-media-upload";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const query = new URL(request.url).searchParams;
        const episodeId = query.get("episodeId") || "";
        const target = query.get("target") || "";
        if (!episodeId || !isOneClickShotUploadTarget(target)) return NextResponse.json({ code: 400, msg: "请选择分集和上传位置" }, { status: 400 });
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, msg: "一键成片项目不存在" }, { status: 404 });
        const bytes = await readRequestBodyBytes(request, creativeUploadMaxBytes(target === "video" ? "video" : "image") + 65536);
        const form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
        const file = form.get("file");
        if (!(file instanceof File)) return NextResponse.json({ code: 400, msg: "请选择上传文件" }, { status: 400 });
        const data = await uploadOneClickShotMedia({ userId: user.id, project, episodeId, shotId, target, file });
        return NextResponse.json({ code: 0, data, msg: "上传成功" });
    } catch (error) {
        const candidate = error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
        const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
        return NextResponse.json({ code: status, msg: error instanceof Error ? error.message : "上传失败" }, { status });
    }
}
