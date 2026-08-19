import { getCurrentUser } from "@/lib/auth/session";
import { IP_ASSET_KINDS, IP_ITEM_CATEGORIES, type IpAssetKind, type IpItemCategory } from "@/lib/ip-library-domain";
import { schoolApiError, schoolApiFailure, schoolApiOk, positiveInteger } from "@/lib/server/school-api-response";
import { listIpLibraryForUser } from "@/lib/server/ip-library-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<string>(IP_ASSET_KINDS);
const CATEGORIES = new Set<string>(Object.values(IP_ITEM_CATEGORIES).flat());

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    const scope = params.get("scope") || "public";
    const kind = params.get("kind") || undefined;
    const category = params.get("category") || undefined;
    if (kind && !KINDS.has(kind)) return schoolApiError(400, "IP 内容类型无效");
    if (category && !CATEGORIES.has(category)) return schoolApiError(400, "IP 内容分类无效");
    try {
        return schoolApiOk(
            await listIpLibraryForUser(user.id, {
                scope: scope as "public" | "school",
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
                keyword: params.get("keyword") || undefined,
                kind: kind as IpAssetKind | undefined,
                category: category as IpItemCategory | undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取 IP 库失败");
    }
}
