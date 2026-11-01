import { getCurrentUser } from "@/lib/auth/session";
import { schoolApiError, schoolApiFailure, schoolApiOk, positiveInteger } from "@/lib/server/school-api-response";
import { listSchoolCourseCatalog } from "@/lib/server/school-course-catalog-service";

export const runtime = "nodejs";

const CATALOG_SCOPES = new Set(["all", "locked", "unlocked"]);

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    const scope = params.get("scope") || "all";
    try {
        return schoolApiOk(
            await listSchoolCourseCatalog(user.id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
                keyword: params.get("keyword")?.trim() || undefined,
                scope: CATALOG_SCOPES.has(scope) ? (scope as "all" | "locked" | "unlocked") : "all",
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取备课大厅失败");
    }
}
