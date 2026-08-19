import { getCurrentUser } from "@/lib/auth/session";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { getIpDetailForUser } from "@/lib/server/ip-library-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const { id } = await context.params;
    const versionId = new URL(request.url).searchParams.get("versionId") || undefined;
    try {
        return schoolApiOk(await getIpDetailForUser(user.id, id, versionId));
    } catch (error) {
        return schoolApiFailure(error, "读取 IP 详情失败");
    }
}
