import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { getScriptProjectDetail } from "@/lib/server/script-practice-service";
import { serializeFdx, serializeFountain, serializePlainText } from "@/lib/script-practice-contract";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    try {
        await requirePracticeAccess(user, "script");
        const format = new URL(request.url).searchParams.get("format") || "text";
        if (format !== "text" && format !== "fountain" && format !== "fdx") return response(400, "不支持的导出格式");
        const detail = await getScriptProjectDetail(user.id, (await context.params).id);
        if (!detail.document) return response(404, "剧本文档不存在");
        const content = format === "fountain" ? serializeFountain(detail.document) : format === "fdx" ? serializeFdx(detail.document) : serializePlainText(detail.document);
        const mime = format === "fdx" ? "application/xml" : "text/plain; charset=utf-8";
        return new Response(content, { headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="script.${format === "fdx" ? "fdx" : "txt"}"` } });
    } catch (error) {
        return failure(error, "导出剧本失败");
    }
}
function response(code: number, msg: string) {
    return NextResponse.json({ code, data: null, msg }, { status: code });
}
function failure(error: unknown, fallback: string) {
    const status = error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return response(status, status === 500 ? fallback : error instanceof Error ? error.message : fallback);
}
