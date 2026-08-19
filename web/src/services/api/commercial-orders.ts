import type {
    AdminCommercialOrder,
    AdminCommercialOrderDetails,
    CommercialOrderDelivery,
    CommercialOrderInput,
    CommercialOrderParticipantCandidatePage,
    CommercialOrderParticipantSubmission,
    CommercialOrderStatus,
    PageResult,
    SchoolCommercialOrder,
    SchoolContentReference,
} from "@/lib/school-domain";
import { serializeApiParams } from "@/services/api/request";

type PageInput = { page?: number; pageSize?: number };
type RequestOptions = Pick<RequestInit, "signal">;
export type CommercialOrderSubmissions = {
    order: SchoolCommercialOrder;
    participants: PageResult<CommercialOrderParticipantSubmission>;
    deliveries: PageResult<CommercialOrderDelivery>;
};

export const commercialOrdersApi = {
    listPlatformCommercialOrders(input: PageInput & { keyword?: string; status?: CommercialOrderStatus } = {}, options: RequestOptions = {}) {
        return request<PageResult<AdminCommercialOrder>>(`/api/admin/commercial-orders${query(input)}`, options);
    },
    createCommercialOrder(input: CommercialOrderInput) {
        return request<AdminCommercialOrder>("/api/admin/commercial-orders", jsonRequest("POST", input));
    },
    getPlatformCommercialOrder(id: string, input: PageInput = {}) {
        return request<AdminCommercialOrderDetails>(`/api/admin/commercial-orders/${encodeURIComponent(id)}${query(input)}`);
    },
    updateCommercialOrder(id: string, input: Partial<CommercialOrderInput>) {
        return request<AdminCommercialOrder>(`/api/admin/commercial-orders/${encodeURIComponent(id)}`, jsonRequest("PATCH", { action: "update", ...input }));
    },
    assignCommercialOrder(id: string, schoolId: string) {
        return request<AdminCommercialOrder>(`/api/admin/commercial-orders/${encodeURIComponent(id)}`, jsonRequest("PATCH", { action: "assign", schoolId }));
    },
    cancelCommercialOrder(id: string) {
        return request<AdminCommercialOrder>(`/api/admin/commercial-orders/${encodeURIComponent(id)}`, jsonRequest("PATCH", { action: "cancel" }));
    },
    reviewCommercialOrder(id: string, input: { decision: "revision_required" | "accepted"; feedback?: string }) {
        return request<AdminCommercialOrder>(`/api/admin/commercial-orders/${encodeURIComponent(id)}/review`, jsonRequest("POST", input));
    },
    listSchoolCommercialOrders(input: PageInput = {}, options: RequestOptions = {}) {
        return request<PageResult<SchoolCommercialOrder>>(`/api/school/commercial-orders${query(input)}`, options);
    },
    getSchoolCommercialOrder(id: string) {
        return request<SchoolCommercialOrder>(`/api/school/commercial-orders/${encodeURIComponent(id)}`);
    },
    configureCommercialOrder(id: string, input: { teacherMembershipId: string; classId?: string; participantMembershipIds: string[] }) {
        return request<SchoolCommercialOrder>(`/api/school/commercial-orders/${encodeURIComponent(id)}`, jsonRequest("PATCH", { action: "configure", ...input }));
    },
    configureCommercialOrderParticipants(id: string, participantMembershipIds: string[]) {
        return request<PageResult<CommercialOrderParticipantSubmission>>(`/api/teaching/commercial-orders/${encodeURIComponent(id)}/submissions`, jsonRequest("POST", { action: "participants", participantMembershipIds }));
    },
    startCommercialOrder(id: string) {
        return request<SchoolCommercialOrder>(`/api/school/commercial-orders/${encodeURIComponent(id)}`, jsonRequest("PATCH", { action: "start" }));
    },
    listTeachingCommercialOrders(input: PageInput = {}, options: RequestOptions = {}) {
        return request<PageResult<SchoolCommercialOrder>>(`/api/teaching/commercial-orders${query(input)}`, options);
    },
    listCommercialOrderSubmissions(id: string, input: PageInput = {}, options: RequestOptions = {}) {
        return request<CommercialOrderSubmissions>(`/api/teaching/commercial-orders/${encodeURIComponent(id)}/submissions${query(input)}`, options);
    },
    listCommercialOrderParticipantCandidates(id: string, input: PageInput & { keyword?: string } = {}, options: RequestOptions = {}) {
        return request<CommercialOrderParticipantCandidatePage>(`/api/teaching/commercial-orders/${encodeURIComponent(id)}/participants${query(input)}`, options);
    },
    submitCommercialOrderWork(id: string, input: { note?: string; references: SchoolContentReference[] }) {
        return request<CommercialOrderParticipantSubmission>(`/api/teaching/commercial-orders/${encodeURIComponent(id)}/submissions`, jsonRequest("POST", { action: "candidate", ...input }));
    },
    submitCommercialOrderDelivery(id: string, input: { note?: string; references: SchoolContentReference[] }) {
        return request<CommercialOrderDelivery>(`/api/teaching/commercial-orders/${encodeURIComponent(id)}/submissions`, jsonRequest("POST", { action: "delivery", ...input }));
    },
};

function query(input: Record<string, string | number | undefined>) {
    const params = serializeApiParams(input);
    return params.size ? `?${params.toString()}` : "";
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
