import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { schoolApiError, schoolApiFailure, schoolApiOk, isSchoolApiObject } from "@/lib/server/school-api-response";
import { downloadIpForUser, type IpDownloadInput } from "@/lib/server/ip-library-download-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<unknown>(request);
    if (!parsed.ok || !isSchoolApiObject(parsed.data)) return schoolApiError(parsed.ok ? 400 : parsed.status, parsed.ok ? "下载参数无效" : parsed.message);
    const body = parsed.data;
    const packageMode = body.package;
    if (typeof packageMode !== "boolean") return schoolApiError(400, "下载类型无效");
    const itemIds = body.itemIds;
    const subIpId = body.subIpId;
    const packageScope = body.packageScope;
    if (subIpId !== undefined && typeof subIpId !== "string") return schoolApiError(400, "子 IP 标识无效");
    if (itemIds !== undefined && (!Array.isArray(itemIds) || itemIds.some((item) => typeof item !== "string"))) return schoolApiError(400, "IP 内容项无效");
    if (packageScope !== undefined && packageScope !== "ip" && packageScope !== "sub_ip") return schoolApiError(400, "下载内容范围无效");
    if (!packageMode && packageScope !== undefined) return schoolApiError(400, "下载内容范围无效");
    const { id } = await context.params;
    try {
        const result = await downloadIpForUser(user.id, request, id, { package: packageMode, subIpId, itemIds: itemIds as string[] | undefined, ...(packageScope ? { packageScope } : {}) } satisfies IpDownloadInput);
        if (result.kind === "redirect") {
            const response = schoolApiOk({ url: result.url, fileName: result.fileName, downloadId: result.downloadId });
            response.headers.set("Cache-Control", "private, no-store, max-age=0");
            return response;
        }
        if (result.kind === "response") {
            const headers = new Headers(result.response.headers);
            headers.set("Cache-Control", "private, no-store, max-age=0");
            headers.set("X-IP-Download-Id", result.downloadId);
            headers.set("X-Content-Type-Options", "nosniff");
            return new Response(result.response.body, { status: result.response.status, headers });
        }
        return new Response(new Uint8Array(result.bytes), {
            headers: {
                "Content-Type": result.mimeType,
                "Content-Length": String(result.bytes.length),
                "Content-Disposition": contentDisposition(result.fileName),
                "Cache-Control": "private, no-store, max-age=0",
                "X-IP-Download-Id": result.downloadId,
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        return schoolApiFailure(error, "下载 IP 内容失败");
    }
}

function contentDisposition(fileName: string) {
    const clean = fileName.replace(/[\\/\u0000-\u001f\u007f]/g, "-").slice(0, 180) || "ip-download";
    return `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
