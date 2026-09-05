import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { workPublicationError, workPublicationOk, unauthorized } from "@/app/api/_shared/work-publication-response";
import { copyPublicWorkToPractice, PublicWorkProcessServiceError } from "@/lib/server/public-work-process-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return unauthorized();
    const parsed = await readJsonBodyResult<unknown>(request, 64 * 1024);
    if (!parsed.ok) return workPublicationError(new PublicWorkProcessServiceError(parsed.message, parsed.status), parsed.message, "Copy public work process body failed");
    try {
        const body = parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data) ? (parsed.data as Record<string, unknown>) : {};
        const { slug } = await context.params;
        const kind = body.kind === "canvas" || body.kind === "drama" ? body.kind : undefined;
        return workPublicationOk(await copyPublicWorkToPractice(user, slug, body.clientRequestId, kind), "已复制到练习");
    } catch (error) {
        return workPublicationError(error, "复制到练习失败", "Copy public work process failed");
    }
}
