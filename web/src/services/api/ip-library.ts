import type { IpAssetKind, IpItemCategory } from "@/lib/ip-library-domain";
import type { IpDetail, IpSummary } from "@/lib/server/ip-library-service";
import type { PageResult } from "@/lib/server/database/repository-types";
import { serializeApiParams } from "@/services/api/request";

export type IpLibraryListInput = { scope: "public" | "school"; page?: number; pageSize?: number; keyword?: string; kind?: IpAssetKind; category?: IpItemCategory; tags?: string[] };

export const ipLibraryApi = {
    list(input: IpLibraryListInput) {
        const { tags, ...params } = input;
        const query = serializeApiParams({ ...params, tag: tags });
        return request<PageResult<IpSummary>>(`/api/ip-library?${query.toString()}`);
    },
    get(id: string, subIpId?: string) {
        const query = serializeApiParams({ subIpId });
        return request<IpDetail>(`/api/ip-library/${encodeURIComponent(id)}${query.size ? `?${query.toString()}` : ""}`);
    },
    async download(id: string, input: { subIpId?: string; itemIds?: string[]; package: boolean; packageScope?: "ip" | "sub_ip" }): Promise<{ url: string; fileName: string } | { blob: Blob; fileName: string }> {
        const response = await fetch(`/api/ip-library/${encodeURIComponent(id)}/download`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" });
        if (!response.ok) throw new Error(await readError(response, "下载 IP 内容失败"));
        if (response.headers.get("content-type")?.includes("application/json")) {
            const payload = (await response.json()) as { code?: number; data?: { url: string; fileName: string }; msg?: string };
            if (payload.code !== 0 || !payload.data?.url) throw new Error(payload.msg || "下载 IP 内容失败");
            return { url: payload.data.url, fileName: payload.data.fileName };
        }
        return { blob: await response.blob(), fileName: fileNameFromDisposition(response.headers.get("content-disposition")) };
    },
};

async function request<T>(url: string) {
    const response = await fetch(url, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { code?: number; data?: T; msg?: string } | null;
    if (!response.ok || payload?.code !== 0 || payload.data === undefined) throw new Error(payload?.msg || "请求失败");
    return payload.data;
}

async function readError(response: Response, fallback: string) {
    const payload = (await response.json().catch(() => null)) as { msg?: string } | null;
    return payload?.msg || fallback;
}

export function fileNameFromDisposition(value: string | null) {
    const encoded = value?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const regular = value?.match(/filename="?([^";]+)"?/i)?.[1];
    let name = encoded || regular || "ip-download";
    try {
        name = decodeURIComponent(name);
    } catch {
        /* use server-provided fallback */
    }
    return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 180) || "ip-download";
}
