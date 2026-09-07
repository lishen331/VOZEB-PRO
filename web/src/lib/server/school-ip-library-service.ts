import type { IpAuthorizationMode, IpStatus } from "@/lib/ip-library-domain";
import type { IpSchoolGrantRecord, IpSchoolGrantStatus, PageInput, PageResult } from "@/lib/server/database/repository-types";
import { createIpLibraryRepository } from "./ip-library-access-service";
import { requireSchoolManager } from "./school-access-service";

export type SchoolIpAccessGrant = {
    id: string;
    mode: IpAuthorizationMode;
    status: IpSchoolGrantStatus;
    startsAt: string;
    endsAt?: string;
    revokedAt?: string;
    effective: boolean;
    updatedAt: string;
};

export type SchoolIpAccessSubIp = {
    id: string;
    title: string;
    summary: string;
    effective: boolean;
    grants: SchoolIpAccessGrant[];
};

export type SchoolIpAccessItem = {
    id: string;
    title: string;
    summary: string;
    ipStatus: IpStatus;
    effective: boolean;
    updatedAt: string;
    subIps: SchoolIpAccessSubIp[];
};

export async function listSchoolIpAccess(userId: string, input: PageInput = {}, at = new Date()): Promise<PageResult<SchoolIpAccessItem>> {
    const context = await requireSchoolManager(userId);
    const repository = createIpLibraryRepository();
    const result = await repository.listSchoolGrantPackages({ schoolId: context.school.id, page: input.page, pageSize: input.pageSize });
    return {
        ...result,
        items: result.items.map((packageRecord) => {
            const subIpById = new Map(packageRecord.subIps.map((subIp) => [subIp.id, subIp]));
            const grantsBySubIp = groupGrants(packageRecord.grants, packageRecord.status, at);
            const subIps = [...grantsBySubIp.entries()]
                .map(([subIpId, grants]) => {
                    const subIp = subIpById.get(subIpId);
                    return {
                        id: subIpId,
                        title: subIp?.title || "不可用子 IP",
                        summary: subIp?.summary || "",
                        effective: grants.some((grant) => grant.effective),
                        grants,
                    };
                })
                .sort((left, right) => {
                    const leftOrder = subIpById.get(left.id)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
                    const rightOrder = subIpById.get(right.id)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
                    return leftOrder - rightOrder || left.title.localeCompare(right.title, "zh-CN") || left.id.localeCompare(right.id);
                });
            return {
                id: packageRecord.id,
                title: packageRecord.title,
                summary: packageRecord.summary,
                ipStatus: packageRecord.status,
                effective: packageRecord.status === "enabled" && subIps.some((subIp) => subIp.effective),
                updatedAt: packageRecord.updatedAt,
                subIps,
            };
        }),
    };
}

function groupGrants(grants: IpSchoolGrantRecord[], ipStatus: IpStatus, at: Date) {
    const groups = new Map<string, SchoolIpAccessGrant[]>();
    for (const grant of grants) {
        const item = {
            id: grant.id,
            mode: grant.mode,
            status: grant.status,
            startsAt: grant.startsAt,
            ...(grant.endsAt ? { endsAt: grant.endsAt } : {}),
            ...(grant.revokedAt ? { revokedAt: grant.revokedAt } : {}),
            effective: ipStatus === "enabled" && grantEffective(grant, at),
            updatedAt: grant.updatedAt,
        };
        const values = groups.get(grant.subIpId) || [];
        values.push(item);
        groups.set(grant.subIpId, values);
    }
    for (const values of groups.values()) values.sort((left, right) => grantPriority(right, at) - grantPriority(left, at) || right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
    return groups;
}

function grantEffective(grant: IpSchoolGrantRecord, at: Date) {
    return grant.status === "active" && Date.parse(grant.startsAt) <= at.getTime() && (!grant.endsAt || Date.parse(grant.endsAt) > at.getTime());
}

function grantPriority(grant: SchoolIpAccessGrant, at: Date) {
    if (grant.effective) return 4;
    if (grant.status === "active" && Date.parse(grant.startsAt) > at.getTime()) return 3;
    if (grant.status === "suspended") return 2;
    if (grant.status === "revoked") return 1;
    return 0;
}
