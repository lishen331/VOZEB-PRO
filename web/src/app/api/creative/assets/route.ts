import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { creativeUploadLimitMessage } from "@/lib/creative-upload";
import { CreativeRuntimeServiceError, referenceAssetForUser, uploadAssetForUser } from "@/lib/server/creative-runtime-service";
import { readRequestBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_REQUEST_BYTES = 800 * 1024 * 1024 + 64 * 1024;
const MAX_REFERENCE_ASSET_REQUEST_BYTES = 64 * 1024;

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const contentType = request.headers.get("content-type") || "";
        if (contentType.toLowerCase().includes("application/json")) {
            let body: Record<string, unknown>;
            try {
                body = JSON.parse(new TextDecoder().decode(await readRequestBodyBytes(request, MAX_REFERENCE_ASSET_REQUEST_BYTES))) as Record<string, unknown>;
            } catch (error) {
                if (error instanceof RequestBodyTooLargeError) {
                    throw new CreativeRuntimeServiceError("引用素材参数不能超过 64KB", error.status);
                }
                throw new CreativeRuntimeServiceError("引用素材参数格式不正确", 400);
            }
            const conversationId = String(body.conversationId || "").trim();
            if (!conversationId) throw new CreativeRuntimeServiceError("创作会话不能为空", 400);
            const sourceUrl = String(body.sourceUrl || "").trim();
            if (!sourceUrl) throw new CreativeRuntimeServiceError("参考素材地址不能为空", 400);
            const asset = await referenceAssetForUser(user.id, conversationId, { sourceUrl, title: String(body.title || "").trim() });
            return NextResponse.json({ code: 0, data: { asset }, msg: "素材已引用" });
        }
        if (!contentType.toLowerCase().includes("multipart/form-data")) throw new CreativeRuntimeServiceError("上传内容格式不正确", 400);
        let form: FormData;
        try {
            const bytes = await readRequestBodyBytes(request, MAX_UPLOAD_REQUEST_BYTES);
            form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData();
        } catch (error) {
            if (error instanceof RequestBodyTooLargeError) throw error;
            throw new CreativeRuntimeServiceError("上传内容格式不正确", 400);
        }
        const conversationId = String(form.get("conversationId") || "").trim();
        const file = form.get("file");
        if (!conversationId) throw new CreativeRuntimeServiceError("创作会话不能为空", 400);
        if (!(file instanceof File)) throw new CreativeRuntimeServiceError("请选择上传文件", 400);
        const asset = await uploadAssetForUser(user.id, conversationId, file);
        return NextResponse.json({ code: 0, data: { asset }, msg: "素材已上传" });
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ code: error.status, data: null, msg: "上传素材超过 800MB" }, { status: error.status });
        if (error instanceof CreativeRuntimeServiceError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        throw error;
    }
}
