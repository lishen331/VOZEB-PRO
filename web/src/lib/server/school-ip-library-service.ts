import type { IpAuthorizationMode, IpStatus } from "@/lib/ip-library-domain";
import type { IpSchoolGrantRecord, IpSchoolGrantStatus, PageInput, PageResult } from "@/lib/server/database/repository-types";
import { createIpLibraryRepository } from "./ip-library-access-service";
import { requireSchoolManager, SchoolServiceError } from "./school-access-service";

export type SchoolIpAccessItem = {
    id: string;
    ipId: string;
    title: string;
    summary: string;
    mode: IpAuthorizationMode;
    status: IpSchoolGrantStatus;
    ipStatus: IpStatus;
    startsAt: string;
    endsAt?: string;
    memberAccessEnabled: boolean;
    effective: boolean;
    updatedAt: string;
};

export async function listSchoolIpAccess(userId: string, input: PageInput = {}, at = new Date()): Promise<PageResult<SchoolIpAccessItem>> {
    const context = await requireSchoolManager(userId);
    const repository = createIpLibraryRepository();
    const grants = await repository.listSchoolGrants({ schoolId: context.school.id, page: input.page, pageSize: input.pageSize });
    const packages = await Promise.all(grants.items.map((grant) => repository.getIpPackage(grant.ipId)));
    return {
        ...grants,
        items: grants.items.map((grant, index) => schoolIpAccessItem(grant, packages[index], at)),
    };
}

export async function updateSchoolIpMemberAccess(userId: string, rawGrantId: string, enabled: boolean): Promise<SchoolIpAccessItem> {
    const grantId = rawGrantId.trim();
    if (!grantId) throw new SchoolServiceError(400, "授权标识无效");
    const context = await requireSchoolManager(userId);
    const repository = createIpLibraryRepository();
    const page = await repository.listSchoolGrants({ schoolId: context.school.id, grantId, page: 1, pageSize: 1 });
    const grant = page.items[0];
    if (!grant) throw new SchoolServiceError(404, "学校 IP 授权不存在");
    const updatedAt = new Date().toISOString();
    const updated = await repository.updateSchoolGrant(grant.ipId, grant.id, {
        memberAccessEnabled: enabled,
        memberAccessUpdatedByUserId: userId,
        memberAccessUpdatedAt: updatedAt,
        updatedAt,
    });
    if (!updated) throw new SchoolServiceError(404, "学校 IP 授权不存在");
    return schoolIpAccessItem(updated, await repository.getIpPackage(updated.ipId), new Date(updatedAt));
}

function schoolIpAccessItem(grant: IpSchoolGrantRecord, packageRecord: Awaited<ReturnType<ReturnType<typeof createIpLibraryRepository>["getIpPackage"]>>, at: Date): SchoolIpAccessItem {
    const ipStatus = packageRecord?.status || "disabled";
    return {
        id: grant.id,
        ipId: grant.ipId,
        title: packageRecord?.title || "不可用 IP",
        summary: packageRecord?.summary || "",
        mode: grant.mode,
        status: grant.status,
        ipStatus,
        startsAt: grant.startsAt,
        ...(grant.endsAt ? { endsAt: grant.endsAt } : {}),
        memberAccessEnabled: grant.memberAccessEnabled,
        effective: grant.memberAccessEnabled && ipStatus === "published" && grant.status === "active" && Date.parse(grant.startsAt) <= at.getTime() && (!grant.endsAt || Date.parse(grant.endsAt) > at.getTime()),
        updatedAt: grant.updatedAt,
    };
}
