import { readAuthDb } from "@/lib/auth/store-repository";
import type { IpDetailRecord, IpItemRecord, IpSubIpDetailRecord } from "@/lib/server/database/repository-types";
import { getDatabaseProvider } from "@/lib/server/database/postgres";
import { createPostgresRepositories } from "@/lib/server/database/repositories";
import { createFileIpLibraryRepository } from "./ip-library-file-repository";
import { requireActiveSchoolContext, SchoolServiceError } from "./school-access-service";

export type IpAccessContext = { userId: string; schoolId?: string; detail: IpDetailRecord; subIp: IpSubIpDetailRecord };

export function createIpLibraryRepository() {
    return getDatabaseProvider() === "file" ? createFileIpLibraryRepository() : createPostgresRepositories().ipLibrary;
}
export async function requireActiveIpLibraryUser(userId: string) {
    const user = getDatabaseProvider() === "file" ? (await readAuthDb()).users.find((item) => item.id === userId) : await createPostgresRepositories().users.getById(userId);
    if (!user || user.status !== "active") throw new SchoolServiceError(403, "当前账号不可用");
    return user;
}
export async function requireVisibleIp(userId: string, ipId: string, subIpId?: string, itemIds: string[] = []): Promise<IpAccessContext> {
    await requireActiveIpLibraryUser(userId);
    const repository = createIpLibraryRepository();
    const packageRecord = await repository.getIpPackage(ipId);
    if (!packageRecord || packageRecord.status !== "enabled") throw new SchoolServiceError(404, "IP 不存在或无权访问");
    const schoolId = packageRecord.visibility === "school" ? (await requireActiveSchoolContext(userId)).school.id : undefined;
    const detail = await repository.getVisibleIp({ userId, schoolId, ipId, subIpId });
    if (!detail?.subIps.length) throw new SchoolServiceError(404, "IP 不存在或无权访问");
    const subIp = subIpId ? detail.subIps.find((item) => item.id === subIpId) : detail.subIps[0];
    if (!subIp) throw new SchoolServiceError(404, "子 IP 不存在或无权访问");
    requireIpItems(subIp.items, itemIds);
    return { userId, schoolId, detail, subIp };
}
function requireIpItems(items: IpItemRecord[], rawItemIds: string[]) {
    const itemIds = rawItemIds.map((item) => item.trim()).filter(Boolean);
    if (itemIds.length !== rawItemIds.length || new Set(itemIds).size !== itemIds.length) throw new SchoolServiceError(400, "IP 内容项无效");
    const allowed = new Set(items.map((item) => item.id));
    if (itemIds.some((item) => !allowed.has(item))) throw new SchoolServiceError(403, "IP 内容项不存在或不属于当前子 IP");
}
