import type { ComputeAllocationRequest, ComputeSettlement, ProductionGroupDetails, ProductionGroupStatus, PersonalComputeAdvance, SchoolComputePoolSummary } from "@/lib/school-compute-domain";
import type { PageResult } from "@/lib/school-domain";
import { serializeApiParams } from "./request";

export type SchoolProjectBillingSummary = {
    schoolName?: string;
    groupName?: string;
    orderTitle?: string;
    availablePoints?: number;
    chargeSource?: "group_school_points" | "group_personal_advance";
};

export const schoolComputeApi = {
    getPool() {
        return request<SchoolComputePoolSummary>("/api/school/compute");
    },
    getSchoolProjectBilling(surface: "canvas" | "drama", projectId: string) {
        return request<SchoolProjectBillingSummary | undefined>(`/api/teaching/project-billing?surface=${encodeURIComponent(surface)}&projectId=${encodeURIComponent(projectId)}`);
    },
    listGroups(input: { page?: number; pageSize?: number; keyword?: string; status?: ProductionGroupStatus } = {}) {
        return request<PageResult<ProductionGroupDetails>>(`/api/school/production-groups?${serializeApiParams(input).toString()}`);
    },
    createGroup(input: { name: string; description?: string; leaderMembershipId: string; memberMembershipIds: string[] }) {
        return request<ProductionGroupDetails>("/api/school/production-groups", json("POST", input));
    },
    getGroup(id: string) {
        return request<ProductionGroupDetails>(`/api/school/production-groups/${encodeURIComponent(id)}`);
    },
    updateGroup(id: string, input: { name?: string; description?: string; status?: ProductionGroupStatus }) {
        return request<ProductionGroupDetails>(`/api/school/production-groups/${encodeURIComponent(id)}`, json("PATCH", input));
    },
    replaceMembers(id: string, input: { leaderMembershipId: string; memberMembershipIds: string[] }) {
        return request<ProductionGroupDetails>(`/api/school/production-groups/${encodeURIComponent(id)}/members`, json("PATCH", input));
    },
    linkOrder(id: string, orderId: string) {
        return request<ProductionGroupDetails>(`/api/school/production-groups/${encodeURIComponent(id)}`, json("PATCH", { action: "link_order", orderId }));
    },
    allocate(id: string, input: { amount: number; reason: string; orderId?: string; idempotencyKey: string }) {
        return request<ProductionGroupDetails>(`/api/school/production-groups/${encodeURIComponent(id)}/allocate`, json("POST", input));
    },
    listAllocationRequests(id: string, input: { page?: number; pageSize?: number } = {}) {
        return request<PageResult<ComputeAllocationRequest>>(`/api/school/production-groups/${encodeURIComponent(id)}/allocation-requests?${serializeApiParams(input).toString()}`);
    },
    reviewAllocation(id: string, requestId: string, input: { decision: "approved" | "rejected"; note: string }) {
        return request<ComputeAllocationRequest>(`/api/school/production-groups/${encodeURIComponent(id)}/allocation-requests`, json("PATCH", { requestId, ...input }));
    },
    listTeachingGroups(input: { page?: number; pageSize?: number } = {}) {
        return request<PageResult<ProductionGroupDetails>>(`/api/teaching/production-groups?${serializeApiParams(input).toString()}`);
    },
    requestAllocation(id: string, input: { orderId: string; amount: number; reason: string }) {
        return request<ComputeAllocationRequest>(`/api/teaching/production-groups/${encodeURIComponent(id)}/allocation-requests`, json("POST", input));
    },
    listOwnAdvances(id: string, input: { page?: number; pageSize?: number } = {}) {
        return request<PageResult<PersonalComputeAdvance>>(`/api/teaching/production-groups/${encodeURIComponent(id)}/personal-advances?${serializeApiParams(input).toString()}`);
    },
    createPersonalAdvance(id: string, input: { orderId: string; amount: number; idempotencyKey: string }) {
        return request<PersonalComputeAdvance>(`/api/teaching/production-groups/${encodeURIComponent(id)}/personal-advances`, json("POST", input));
    },
    listSettlements(id: string, input: { page?: number; pageSize?: number } = {}) {
        return request<PageResult<ComputeSettlement>>(`/api/school/production-groups/${encodeURIComponent(id)}/settlements?${serializeApiParams(input).toString()}`);
    },
    confirmSettlement(groupId: string, settlementId: string, input: { advanceIds?: string[] } = {}) {
        return request<ComputeSettlement>(`/api/school/production-groups/${encodeURIComponent(groupId)}/settlements/${encodeURIComponent(settlementId)}/confirm`, json("POST", input));
    },
};

function json(method: "POST" | "PATCH", body: unknown): RequestInit {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: number; data?: T; msg?: string } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(payload?.msg || "请求失败");
    return payload.data;
}
