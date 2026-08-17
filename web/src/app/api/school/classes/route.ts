import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { SchoolClassInput } from "@/lib/school-domain";
import { positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { createSchoolClass, listSchoolClasses } from "@/lib/server/school-tenant-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    try {
        return schoolApiOk(
            await listSchoolClasses(user.id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
                keyword: params.get("keyword")?.trim() || undefined,
                status: status === "active" || status === "disabled" ? status : undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取班级列表失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<SchoolClassInput>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    try {
        return schoolApiOk(await createSchoolClass(user.id, parsed.data));
    } catch (error) {
        return schoolApiFailure(error, "创建班级失败");
    }
}
