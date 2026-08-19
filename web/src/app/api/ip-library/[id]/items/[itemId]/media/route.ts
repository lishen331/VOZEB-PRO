import { getCurrentUser } from "@/lib/auth/session";
import { previewIpMediaForUser } from "@/lib/server/ip-library-download-service";
import { schoolApiError, schoolApiFailure } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function GET(request: Request, context: RouteContext) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const { id, itemId } = await context.params;
    try {
        const result = await previewIpMediaForUser(user.id, request, id, { itemId, versionId: new URL(request.url).searchParams.get("versionId") || undefined });
        if (result.kind === "redirect") return new Response(null, { status: 307, headers: { Location: result.url, "Cache-Control": "private, no-store, max-age=0" } });
        return new Response(new Uint8Array(result.bytes), {
            headers: {
                "Content-Type": result.mimeType,
                "Content-Length": String(result.bytes.length),
                "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
                "Cache-Control": "private, no-store, max-age=0",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        return schoolApiFailure(error, "读取 IP 内容失败");
    }
}
