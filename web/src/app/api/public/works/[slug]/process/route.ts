import { workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { getPublicWorkProcess } from "@/lib/server/public-work-process-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await context.params;
        return workPublicationOk({ process: await getPublicWorkProcess(slug) });
    } catch (error) {
        return workPublicationError(error, "获取作品制作流程失败", "Get public work process failed");
    }
}
