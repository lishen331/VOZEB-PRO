import type { IpAuthorizationMode, IpStatus } from "@/lib/ip-library-domain";
import type { IpSchoolGrantStatus, PageInput, PageResult } from "@/lib/server/database/repository-types";
import { createIpLibraryRepository } from "./ip-library-access-service";
import { requireSchoolManager } from "./school-access-service";

export type SchoolIpAccessItem = {
    id: string;
    ipId: string;
    subIpId: string;
    title: string;
    subIpTitle: string;
    summary: string;
    mode: IpAuthorizationMode;
    status: IpSchoolGrantStatus;
    ipStatus: IpStatus;
    startsAt: string;
    endsAt?: string;
    effective: boolean;
    updatedAt: string;
};
export async function listSchoolIpAccess(userId: string, input: PageInput = {}, at = new Date()): Promise<PageResult<SchoolIpAccessItem>> {
    const context = await requireSchoolManager(userId);
    const repository = createIpLibraryRepository();
    const grants = await repository.listSchoolGrants({ schoolId: context.school.id, page: input.page, pageSize: input.pageSize });
    const items = await Promise.all(
        grants.items.map(async (grant) => {
            const packageRecord = await repository.getIpPackage(grant.ipId);
            const subIp = await repository.getIpSubIp(grant.ipId, grant.subIpId);
            const effective = packageRecord?.status === "enabled" && grant.status === "active" && Date.parse(grant.startsAt) <= at.getTime() && (!grant.endsAt || Date.parse(grant.endsAt) > at.getTime());
            return {
                id: grant.id,
                ipId: grant.ipId,
                subIpId: grant.subIpId,
                title: packageRecord?.title || "不可用 IP",
                subIpTitle: subIp?.title || "不可用子 IP",
                summary: subIp?.summary || "",
                mode: grant.mode,
                status: grant.status,
                ipStatus: packageRecord?.status || "disabled",
                startsAt: grant.startsAt,
                ...(grant.endsAt ? { endsAt: grant.endsAt } : {}),
                effective,
                updatedAt: grant.updatedAt,
            };
        }),
    );
    return { ...grants, items };
}
