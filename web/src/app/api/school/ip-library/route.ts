import { getCurrentUser } from "@/lib/auth/session";
import { positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { listSchoolIpAccess } from "@/lib/server/school-ip-library-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(
            await listSchoolIpAccess(user.id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: Math.min(100, positiveInteger(params.get("pageSize"), 20)),
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取学校 IP 授权失败");
    }
}
