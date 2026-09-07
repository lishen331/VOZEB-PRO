import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { decodeDramaNovelBytes } from "@/lib/drama-novel-text-decoder";
import { assertDramaLabStageAllowed, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { DramaLabNovelImportError, importDramaLabNovelForUser } from "@/lib/server/drama-lab-novel-import-service";
import { readRequestBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";
import { FeatureModuleDisabledError, requireFeatureModuleEnabled } from "@/lib/server/feature-module-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMPORT_REQUEST_BYTES = 3 * 1024 * 1024;

/**
 * POST /api/drama-lab/projects/:id/import-novel
 *
 * The first call is a preview (`commit: false` or omitted). A second call
 * with the same source and `commit: true` creates a restore version and
 * replaces only the project's episodes. Assets and project metadata remain.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        await requireFeatureModuleEnabled("drama-lab");
        const { id } = await params;
        const { ownerUserId } = await resolveDramaLabProjectForRequest(user.id, id);
        const input = await readNovelImportRequest(request);
        if (!input.ok) return NextResponse.json({ code: input.status, data: null, msg: input.message }, { status: input.status });
        const { sourceText, fileName, targetCharacters, commit } = input;
        if (commit) await assertDramaLabStageAllowed(user.id, id, "script");
        const result = await importDramaLabNovelForUser({ userId: ownerUserId, projectId: id, sourceText, fileName, targetCharacters, commit });
        return NextResponse.json({ code: 0, data: result, msg: result.committed ? "小说已导入" : "小说解析完成，请确认导入" });
    } catch (error) {
        if (error instanceof FeatureModuleDisabledError) return NextResponse.json({ code: 403, data: null, msg: error.message }, { status: 403 });
        if (error instanceof DramaLabNovelImportError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        const status = error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "小说导入失败" }, { status });
    }
}

async function readNovelImportRequest(request: Request) {
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("multipart/form-data")) {
        const parsed = await readJsonBodyResult<Record<string, unknown>>(request, MAX_IMPORT_REQUEST_BYTES);
        if (!parsed.ok) return parsed;
        const body = parsed.data;
        const targetCharactersValue = typeof body.targetCharacters === "number" || typeof body.targetCharacters === "string" ? Number(body.targetCharacters) : NaN;
        return {
            ok: true as const,
            sourceText: typeof body.sourceText === "string" ? body.sourceText : typeof body.content === "string" ? body.content : "",
            fileName: typeof body.fileName === "string" ? body.fileName : undefined,
            targetCharacters: Number.isFinite(targetCharactersValue) ? targetCharactersValue : undefined,
            commit: body.commit === true,
        };
    }

    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_IMPORT_REQUEST_BYTES + 256 * 1024) return { ok: false as const, status: 413, message: "小说文件请求超过大小限制" };
    let form: FormData;
    try {
        const bytes = await readRequestBodyBytes(request, MAX_IMPORT_REQUEST_BYTES + 256 * 1024);
        form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData();
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) return { ok: false as const, status: error.status, message: "小说文件请求超过大小限制" };
        return { ok: false as const, status: 400, message: "无法读取小说文件" };
    }
    const fileValue = form.get("file") || form.get("novel") || form.get("sourceFile");
    const file = fileValue instanceof File ? fileValue : undefined;
    const sourceTextValue = form.get("sourceText") || form.get("content");
    let sourceText = typeof sourceTextValue === "string" ? sourceTextValue : "";
    if (file) {
        try {
            sourceText = decodeDramaNovelBytes(await file.arrayBuffer()).text;
        } catch (error) {
            return { ok: false as const, status: 415, message: error instanceof Error ? error.message : "无法识别小说文件编码" };
        }
    }
    const fileNameValue = file?.name || form.get("fileName");
    const fileName = typeof fileNameValue === "string" ? fileNameValue : undefined;
    const targetCharactersValue = Number(form.get("targetCharacters"));
    const commitValue = form.get("commit");
    return {
        ok: true as const,
        sourceText,
        fileName,
        targetCharacters: Number.isFinite(targetCharactersValue) ? targetCharactersValue : undefined,
        commit: commitValue === "true" || commitValue === "1",
    };
}
