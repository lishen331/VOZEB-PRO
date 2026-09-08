import { NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { CREATIVE_UPLOAD_MAX_BYTES } from "@/lib/creative-upload";
import { getCurrentUser } from "@/lib/auth/session";
import { readRequestBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";
import { LoginPageMediaError, writeLoginPageMedia } from "@/lib/server/login-page-media";

export const runtime = "nodejs";
const MAX_LOGIN_PAGE_MEDIA_REQUEST_BYTES = CREATIVE_UPLOAD_MAX_BYTES + 64 * 1024;

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "system.manage")) return NextResponse.json({ error: "需要系统管理权限" }, { status: 403 });
    try {
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("multipart/form-data")) throw new LoginPageMediaError("请使用 multipart/form-data 上传登录页物料");
        const bytes = await readRequestBodyBytes(request, MAX_LOGIN_PAGE_MEDIA_REQUEST_BYTES);
        const form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new LoginPageMediaError("请选择登录页物料文件");
        const result = await writeLoginPageMedia(String(form.get("kind") || ""), file);
        return NextResponse.json({ url: result.url });
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "登录页物料文件不能超过 20MB" }, { status: error.status });
        if (error instanceof LoginPageMediaError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Login page media upload failed", error);
        return NextResponse.json({ error: "登录页物料上传失败" }, { status: 500 });
    }
}
