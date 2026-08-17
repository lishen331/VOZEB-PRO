import type { PageResult, SchoolClass, SchoolClassDetail, SchoolClassInput, SchoolContext, SchoolDetail, SchoolMember, SchoolMemberCreateInput, SchoolMemberPatch, SchoolMemberRole, SchoolMembershipStatus, UpdateSchoolInput } from "@/lib/school-domain";
import { serializeApiParams } from "@/services/api/request";

export type SchoolInvitePreview = { school: { id: string; name: string }; role: SchoolMemberRole };

export const schoolApi = {
    getContext() {
        return request<SchoolContext | null>("/api/school/context");
    },
    getProfile() {
        return request<SchoolDetail>("/api/school/profile");
    },
    updateProfile(input: Pick<UpdateSchoolInput, "name" | "profile">) {
        return request<SchoolDetail>("/api/school/profile", jsonRequest("PATCH", input));
    },
    listMembers(input: { page?: number; pageSize?: number; keyword?: string; role?: SchoolMemberRole; status?: SchoolMembershipStatus } = {}) {
        const query = serializeApiParams(input);
        return request<PageResult<SchoolMember>>(`/api/school/members${query.size ? `?${query.toString()}` : ""}`);
    },
    createMembers(rows: SchoolMemberCreateInput[]) {
        return request<SchoolMember[]>("/api/school/members", jsonRequest("POST", { rows }));
    },
    importMembers(rows: SchoolMemberCreateInput[]) {
        return request<SchoolMember[]>("/api/school/members/import", jsonRequest("POST", { rows }));
    },
    updateMember(id: string, patch: SchoolMemberPatch) {
        return request<SchoolMember>(`/api/school/members/${encodeURIComponent(id)}`, jsonRequest("PATCH", patch));
    },
    removeMember(id: string) {
        return request<{ removed: boolean }>(`/api/school/members/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    listClasses(input: { page?: number; pageSize?: number } = {}) {
        const query = serializeApiParams(input);
        return request<PageResult<SchoolClass>>(`/api/school/classes${query.size ? `?${query.toString()}` : ""}`);
    },
    createClass(input: SchoolClassInput) {
        return request<SchoolClass>("/api/school/classes", jsonRequest("POST", input));
    },
    getClass(id: string) {
        return request<SchoolClassDetail>(`/api/school/classes/${encodeURIComponent(id)}`);
    },
    updateClass(id: string, input: Partial<SchoolClassInput> & { status?: "active" | "disabled"; teacherMembershipIds?: string[]; studentMembershipIds?: string[] }) {
        return request<SchoolClass | SchoolClassDetail>(`/api/school/classes/${encodeURIComponent(id)}`, jsonRequest("PATCH", input));
    },
    removeClass(id: string) {
        return request<{ id: string }>(`/api/school/classes/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    rotateInviteCode(role: SchoolMemberRole) {
        return request<{ code: string }>("/api/school/invitations", jsonRequest("POST", { role }));
    },
    previewInvite(code: string) {
        return request<SchoolInvitePreview>(`/api/school/invitations/join?${serializeApiParams({ code }).toString()}`);
    },
    joinByInvite(code: string) {
        return request<SchoolContext>("/api/school/invitations/join", jsonRequest("POST", { code }));
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
