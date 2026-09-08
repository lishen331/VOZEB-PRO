import type { IpAuthorizationMode, IpStatus } from "@/lib/ip-library-domain";
import type { IpSchoolGrantStatus, PageResult } from "@/lib/server/database/repository-types";
import { serializeApiParams } from "./request";

export type SchoolIpAccessItem = {
    id: string;
    title: string;
    summary: string;
    ipStatus: IpStatus;
    effective: boolean;
    updatedAt: string;
    subIps: SchoolIpAccessSubIp[];
};

export type SchoolIpAccessSubIp = {
    id: string;
    title: string;
    summary: string;
    effective: boolean;
    grants: SchoolIpAccessGrant[];
};

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

export const schoolIpLibraryApi = {
    list(input: { page?: number; pageSize?: number } = {}) {
        return request<PageResult<SchoolIpAccessItem>>(`/api/school/ip-library?${serializeApiParams(input).toString()}`);
    },
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: number; data?: T; msg?: string } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(payload?.msg || "请求失败");
    return payload.data;
}
