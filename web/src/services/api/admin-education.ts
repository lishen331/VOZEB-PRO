import type { CreateSchoolInput, PageResult, SchoolDetail, SchoolStatus, SchoolSummary, UpdateSchoolInput } from "@/lib/school-domain";
import { serializeApiParams } from "@/services/api/request";

export const adminEducationApi = {
    listSchools(input: { page?: number; pageSize?: number; keyword?: string; status?: SchoolStatus } = {}) {
        const query = serializeApiParams(input);
        return request<PageResult<SchoolSummary>>(`/api/admin/schools${query.size ? `?${query.toString()}` : ""}`);
    },
    createSchool(input: CreateSchoolInput) {
        return request<SchoolDetail>("/api/admin/schools", jsonRequest("POST", input));
    },
    getSchool(id: string) {
        return request<SchoolDetail>(`/api/admin/schools/${encodeURIComponent(id)}`);
    },
    updateSchool(id: string, input: UpdateSchoolInput) {
        return request<SchoolDetail>(`/api/admin/schools/${encodeURIComponent(id)}`, jsonRequest("PATCH", input));
    },
};

function jsonRequest(method: "POST" | "PATCH", body: unknown): RequestInit {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: number; data?: T; msg?: string } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(payload?.msg || "请求失败");
    return payload.data;
}
