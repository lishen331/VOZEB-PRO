import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { DramaLabProjectArchiveError, importDramaLabProjectForUser } from "@/lib/server/drama-lab-project-archive";
import { readRequestBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ARCHIVE_BYTES = 320 * 1024 * 1024;
const MAX_MULTIPART_REQUEST_BYTES = MAX_ARCHIVE_BYTES + 1024 * 1024;

/** POST /api/drama-lab/projects/import
 *
 * Accepts a multipart field named `file` (the UI path) and also accepts a
 * raw application/zip body for command-line clients and integration tests.
 */
export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const archive = await readArchiveBytes(request);
        const result = await importDramaLabProjectForUser({
            userId: user.id,
            archive,
            origin: resolveInternalOrigin(new URL(request.url).origin),
            cookie: request.headers.get("cookie") || "",
        });
        return NextResponse.json({ code: 0, data: result, msg: "短剧项目导入成功" });
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ code: error.status, data: null, msg: "项目归档超过大小限制" }, { status: error.status });
        if (error instanceof DramaLabProjectArchiveError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        console.error("drama lab project import failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "短剧项目导入失败" }, { status: 500 });
    }
}

async function readArchiveBytes(request: Request) {
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    const multipart = contentType.includes("multipart/form-data");
    const maxRequestBytes = multipart ? MAX_MULTIPART_REQUEST_BYTES : MAX_ARCHIVE_BYTES;
    const length = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(length) && length > maxRequestBytes) throw new RequestBodyTooLargeError();

    if (!multipart) {
        const bytes = await readRequestBodyBytes(request, MAX_ARCHIVE_BYTES);
        if (!bytes.byteLength) throw new DramaLabProjectArchiveError("请选择要导入的项目归档", 400);
        return bytes;
    }

    let form: FormData;
    try {
        const bytes = await readRequestBodyBytes(request, maxRequestBytes);
        form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData();
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) throw error;
        throw new DramaLabProjectArchiveError("无法读取项目归档文件", 400);
    }
    const value = form.get("file") || form.get("archive") || form.get("project");
    if (!(value instanceof File)) throw new DramaLabProjectArchiveError("请选择要导入的项目归档", 400);
    if (value.size > MAX_ARCHIVE_BYTES) throw new RequestBodyTooLargeError();
    const bytes = new Uint8Array(await value.arrayBuffer());
    if (!bytes.byteLength) throw new DramaLabProjectArchiveError("项目归档文件为空", 400);
    return bytes;
}
