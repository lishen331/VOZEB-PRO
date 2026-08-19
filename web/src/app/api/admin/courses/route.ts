import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { PlatformCourseInput } from "@/lib/school-domain";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk, positiveInteger } from "@/lib/server/school-api-response";
import { createPlatformCourse, listPlatformCourses } from "@/lib/server/school-course-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    if (status && status !== "draft" && status !== "published" && status !== "disabled") return schoolApiError(400, "课程状态筛选无效");
    try {
        return schoolApiOk(
            await listPlatformCourses(user.id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
                keyword: params.get("keyword") || undefined,
                status: status as "draft" | "published" | "disabled" | undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取课程列表失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return schoolApiError(403, "当前管理员没有产教运营职责权限");
    const parsed = await readJsonBodyResult<PlatformCourseInput>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        const course = await createPlatformCourse(user.id, parsed.data);
        await safeRecordAuditLog({ action: "admin.course.create", actor: auditActorFromRequest(request, user), target: { type: "platform_course", id: course.id }, metadata: { status: course.status } });
        return schoolApiOk(course);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.course.create", status: "failure", actor: auditActorFromRequest(request, user), metadata: { errorStatus: errorStatus(error) } });
        return schoolApiFailure(error, "创建课程失败");
    }
}

function errorStatus(error: unknown) {
    return error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
}
