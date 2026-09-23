import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { creativeUploadMaxBytes } from "@/lib/creative-upload";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { DramaLabNovelFileError, extractUploadedText } from "@/lib/server/drama-lab-novel-file-parser";
import { readRequestBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_FILE_BYTES = creativeUploadMaxBytes("text");
/** Decode only: user confirms/saves the returned text through the existing episode editor. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id } = await params;
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, data: null, msg: "一键成片项目不存在" }, { status: 404 });
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("multipart/form-data")) return NextResponse.json({ code: 400, data: null, msg: "请上传剧本文件" }, { status: 400 });
        let form: FormData;
        try {
            const bytes = await readRequestBodyBytes(request, MAX_FILE_BYTES + 64 * 1024);
            form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
        } catch (error) {
            if (error instanceof RequestBodyTooLargeError) throw error;
            return NextResponse.json({ code: 400, data: null, msg: "无法读取上传文件" }, { status: 400 });
        }
        const file = form.get("file");
        if (!(file instanceof File) || !file.size) return NextResponse.json({ code: 400, data: null, msg: "请选择非空剧本文件" }, { status: 400 });
        if (file.size > MAX_FILE_BYTES) throw new RequestBodyTooLargeError("剧本文件不能超过20MB");
        if (!/\.(txt|md|markdown|docx|doc)$/i.test(file.name)) throw new DramaLabNovelFileError("只支持 TXT、MD、DOCX 或 DOC 剧本文件");
        const sourceText = extractUploadedText(new Uint8Array(await file.arrayBuffer()), file.name);
        if (!sourceText.trim()) return NextResponse.json({ code: 400, data: null, msg: "文件没有可识别的剧本文本" }, { status: 400 });
        if (Buffer.byteLength(sourceText, "utf8") > MAX_FILE_BYTES) throw new RequestBodyTooLargeError("解析后的剧本文本超过20MB限制");
        return NextResponse.json({ code: 0, data: { text: sourceText, sourceText, fileName: file.name }, msg: "剧本解析完成，尚未保存" });
    } catch (error) {
        const value = error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
        const status = Number.isInteger(value) && value >= 400 && value <= 599 ? value : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "剧本解析失败" }, { status });
    }
}
