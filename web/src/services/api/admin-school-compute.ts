import type { PageResult } from "@/lib/school-domain";
import type { AdminSchoolComputePool, AdminSchoolComputePoolDetails, SchoolComputeLedgerEntry, SchoolComputePoolStatus } from "@/lib/school-compute-domain";
import type { ComputeLedgerPageQuery, ComputePoolPageQuery } from "@/lib/server/school-compute-repository";
import { serializeApiParams } from "@/services/api/request";

type MutationInput = { amount: number; reason: string; idempotencyKey: string };

export const adminSchoolComputeApi = {
    listPools(input: ComputePoolPageQuery = {}) {
        return request<PageResult<AdminSchoolComputePool>>(withQuery("/api/admin/school-compute", { ...input }));
    },
    getPool(schoolId: string) {
        return request<AdminSchoolComputePoolDetails>(`/api/admin/schools/${encodeURIComponent(schoolId)}/compute`);
    },
    credit(schoolId: string, input: MutationInput) {
        return request<AdminSchoolComputePoolDetails>(`/api/admin/schools/${encodeURIComponent(schoolId)}/compute/credit`, jsonRequest("POST", input));
    },
    adjust(schoolId: string, input: MutationInput) {
        return request<AdminSchoolComputePoolDetails>(`/api/admin/schools/${encodeURIComponent(schoolId)}/compute`, jsonRequest("PATCH", input));
    },
    setStatus(schoolId: string, status: Extract<SchoolComputePoolStatus, "active" | "frozen">) {
        return request<AdminSchoolComputePoolDetails>(`/api/admin/schools/${encodeURIComponent(schoolId)}/compute`, jsonRequest("PATCH", { status }));
    },
    listLedger(schoolId: string, input: ComputeLedgerPageQuery = {}) {
        return request<PageResult<SchoolComputeLedgerEntry>>(withQuery(`/api/admin/schools/${encodeURIComponent(schoolId)}/compute/ledger`, { ...input }));
    },
};

function withQuery(path: string, input: NonNullable<Parameters<typeof serializeApiParams>[0]>) {
    const query = serializeApiParams(input);
    return query.size ? `${path}?${query.toString()}` : path;
}

function jsonRequest(method: "POST" | "PATCH", body: unknown): RequestInit {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: number; data?: T; msg?: string } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(payload?.msg || "请求失败");
    return payload.data;
}
