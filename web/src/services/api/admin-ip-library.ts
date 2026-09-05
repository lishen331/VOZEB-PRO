import type { IpStatus, IpVisibility } from "@/lib/ip-library-domain";
import type { IpContentFileRecord, IpDownloadRecord, IpDownloadResult, IpDownloadType, IpPackageRecord, IpSchoolGrantRecord, IpVersionRecord, PageResult } from "@/lib/server/database/repository-types";
import type { AdminIpCreateInput, AdminIpCreateVersionInput, AdminIpGrantInput, AdminIpGrantPatchInput, AdminIpPatchInput, AdminIpVersionInput } from "@/lib/server/ip-library-admin-service";
import { serializeApiParams } from "@/services/api/request";

export const adminIpLibraryApi = {
    list(input: { page?: number; pageSize?: number; keyword?: string; status?: IpStatus; visibility?: IpVisibility } = {}) {
        return getPage<IpPackageRecord & { versionNumber: number; itemCount: number }>("/api/admin/ip-library", input);
    },
    get(id: string) {
        return request<IpPackageRecord>(ipPath(id));
    },
    create(input: AdminIpCreateInput) {
        return request<IpPackageRecord>("/api/admin/ip-library", jsonRequest("POST", input));
    },
    update(id: string, input: AdminIpPatchInput) {
        return request<IpPackageRecord>(ipPath(id), jsonRequest("PATCH", input));
    },
    listVersions(id: string, input: { page?: number; pageSize?: number } = {}) {
        return getPage<IpVersionRecord>(`${ipPath(id)}/versions`, input);
    },
    createVersion(id: string, input: AdminIpCreateVersionInput) {
        return request<IpVersionRecord>(`${ipPath(id)}/versions`, jsonRequest("POST", { action: "create", ...input }));
    },
    updateVersion(id: string, versionId: string, input: AdminIpVersionInput) {
        return request<IpVersionRecord>(`${ipPath(id)}/versions/${encodeURIComponent(versionId)}`, jsonRequest("PATCH", input));
    },
    listFiles(id: string) {
        return request<IpContentFileRecord[]>(`${ipPath(id)}/files`);
    },
    uploadFile(id: string, kind: IpContentFileRecord["kind"], file: File) {
        const body = new FormData();
        body.set("kind", kind);
        body.set("file", file);
        return request<IpContentFileRecord>(`${ipPath(id)}/files`, { method: "POST", body });
    },
    deleteFile(id: string, fileId: string) {
        return request<{ deleted: boolean }>(`${ipPath(id)}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
    },
    fileUrl(id: string, fileId: string, input: { download?: "original"; width?: number } = {}) {
        const query = serializeApiParams(input);
        return `${ipPath(id)}/files/${encodeURIComponent(fileId)}${query.size ? `?${query.toString()}` : ""}`;
    },
    publishVersion(id: string, versionId: string) {
        return request<IpVersionRecord>(`${ipPath(id)}/versions`, jsonRequest("POST", { action: "publish", versionId }));
    },
    listGrants(id: string, input: { page?: number; pageSize?: number; schoolId?: string; status?: string } = {}) {
        return getPage<AdminIpGrantItem>(`${ipPath(id)}/schools`, input);
    },
    createGrant(id: string, input: AdminIpGrantInput) {
        return request<IpSchoolGrantRecord>(`${ipPath(id)}/schools`, jsonRequest("POST", input));
    },
    updateGrant(id: string, grantId: string, input: AdminIpGrantPatchInput) {
        return request<IpSchoolGrantRecord>(`${ipPath(id)}/schools/${encodeURIComponent(grantId)}`, jsonRequest("PATCH", input));
    },
    listUsage(input: { page?: number; pageSize?: number; ipId?: string; versionId?: string; schoolId?: string; userId?: string; downloadType?: IpDownloadType; result?: IpDownloadResult } = {}) {
        return getPage<AdminIpUsageItem>("/api/admin/ip-library/usage", input);
    },
};

export class AdminIpLibraryRequestError extends Error {
    constructor(
        message: string,
        readonly outcome: "confirmed_failure" | "unknown",
        readonly data?: unknown,
    ) {
        super(message);
    }
}

export function isConfirmedAdminIpLibraryFailure(error: unknown): error is AdminIpLibraryRequestError {
    return error instanceof AdminIpLibraryRequestError && error.outcome === "confirmed_failure";
}

export type AdminIpUsageItem = Omit<IpDownloadRecord, "userId"> & {
    user?: { accountId: string; username: string; displayName: string; email?: string };
    school?: { id: string; name: string };
};
export type AdminIpGrantItem = IpSchoolGrantRecord & { school?: { id: string; name: string } };

function ipPath(id: string) {
    return `/api/admin/ip-library/${encodeURIComponent(id)}`;
}

function getPage<T>(path: string, input: Record<string, string | string[] | number | number[] | undefined>) {
    const query = serializeApiParams(input);
    return request<PageResult<T>>(`${path}${query.size ? `?${query.toString()}` : ""}`);
}

function jsonRequest(method: "POST" | "PATCH", body: unknown): RequestInit {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function request<T>(url: string, init?: RequestInit) {
    let response: Response;
    try {
        response = await fetch(url, { cache: "no-store", ...init });
    } catch (error) {
        throw new AdminIpLibraryRequestError(error instanceof Error ? error.message : "IP 库请求失败", "unknown");
    }
    const payload = (await response.json().catch(() => null)) as { code?: number; data?: T; msg?: string } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) {
        const outcome = payload && payload.code !== undefined && payload.code !== 0 ? "confirmed_failure" : "unknown";
        throw new AdminIpLibraryRequestError(payload?.msg || "IP 库请求失败", outcome, payload?.data);
    }
    return payload.data;
}
