import type { Asset, CreateLibraryAssetInput } from "@/lib/library-asset-contract";
import type { DramaLibraryAssetType } from "@/lib/drama-lab-library-assets";
import { deleteStoredImages, uploadImage } from "@/services/image-storage";

export function listLibraryAssets() {
    return listLibraryAssetPage({ page: 1, pageSize: 100 }).then((data) => data.assets);
}

export type LibraryAssetPage = { assets: Asset[]; total: number; page: number; pageSize: number; categories?: string[] };

export function listLibraryAssetPage(input: { page: number; pageSize: number; kind?: Asset["kind"]; keyword?: string; category?: string; dramaAssetType?: DramaLibraryAssetType }, signal?: AbortSignal) {
    const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
    if (input.kind) query.set("kind", input.kind);
    if (input.keyword?.trim()) query.set("keyword", input.keyword.trim());
    if (input.category?.trim()) query.set("category", input.category.trim());
    if (input.dramaAssetType) query.set("dramaAssetType", input.dramaAssetType);
    return request<LibraryAssetPage>(`/api/library-assets?${query}`, { cache: "no-store", signal });
}

export async function listAllLibraryAssets() {
    const assets: Asset[] = [];
    for (let page = 1; ; page += 1) {
        const result = await listLibraryAssetPage({ page, pageSize: 100 });
        assets.push(...result.assets);
        if (assets.length >= result.total || !result.assets.length) return assets;
    }
}

export function createLibraryAsset(asset: CreateLibraryAssetInput) {
    return request<{ asset: Asset }>("/api/library-assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(asset) }).then((data) => data.asset);
}

export async function uploadLibraryImageAsset(file: File) {
    const image = await uploadImage(file);
    try {
        return await createLibraryAsset({
            kind: "image",
            title: file.name.trim() || "本地封面",
            coverUrl: image.url,
            tags: [],
            source: "admin-ip-cover-upload",
            data: {
                dataUrl: image.url,
                storageKey: image.storageKey,
                serverUrl: image.url,
                width: image.width,
                height: image.height,
                bytes: image.bytes,
                mimeType: image.mimeType,
            },
        });
    } catch (error) {
        await deleteStoredImages([image.storageKey]).catch(() => undefined);
        throw error;
    }
}

export function saveLibraryAsset(id: string, asset: CreateLibraryAssetInput) {
    return request<{ asset: Asset }>(`/api/library-assets/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(asset) }).then((data) => data.asset);
}

export function deleteLibraryAsset(id: string) {
    return request<{ deleted: boolean }>(`/api/library-assets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as { data?: T; msg?: string };
    if (!response.ok || !payload.data) throw new Error(payload.msg || "素材请求失败");
    return payload.data;
}
