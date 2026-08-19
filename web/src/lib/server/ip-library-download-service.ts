import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { zipSync, type Zippable } from "fflate";

import type { IpItemRecord } from "@/lib/server/database/repository-types";
import { getLibraryAssetById } from "@/lib/server/library-asset-store";
import { getLocalMediaRegistration } from "@/lib/server/local-media-registry";
import { resolveServerDataPath } from "@/lib/server/data-dir";
import { getObjectBytes } from "@/lib/server/object-storage-client";
import { assertObjectStorageConfigured, getObjectStorageRuntimeConfig } from "@/lib/server/object-storage-config";
import { createExternalMediaReadUrl } from "@/lib/server/object-storage-service";
import { SchoolServiceError } from "@/lib/server/school-access-service";
import { createIpUsageForUser } from "./ip-library-service";
import { requireVisibleIp } from "./ip-library-access-service";

export type IpDownloadInput = { versionId?: string; itemIds?: string[]; package: boolean };
export type IpDownloadResult = { kind: "redirect"; url: string; fileName: string; downloadId: string } | { kind: "file"; bytes: Buffer; mimeType: string; fileName: string; downloadId: string };
type PreparedIpDownload = { kind: "redirect"; url: string; fileName: string } | { kind: "file"; bytes: Buffer; mimeType: string; fileName: string };
export type IpPreviewInput = { versionId?: string; itemId?: string; cover?: boolean };

export async function downloadIpForUser(userId: string, request: Request, ipId: string, input: IpDownloadInput): Promise<IpDownloadResult> {
    const itemIds = normalizeItemIds(input.itemIds);
    const access = await requireVisibleIp(userId, requiredText(ipId, "IP 标识无效"), optionalText(input.versionId), input.package ? [] : itemIds);
    const downloadId = randomUUID();
    const selectedItems = input.package ? access.detail.version.items : selectSingleItem(access.detail.version.items, itemIds);
    const prepared = input.package
        ? ({ kind: "file", bytes: await createPackage(access.detail, selectedItems), mimeType: "application/zip", fileName: `${safeName(access.detail.title)}-v${access.detail.version.versionNumber}.zip` } as const)
        : await resolveItemDownload(request, selectedItems[0]);
    await createIpUsageForUser(userId, {
        ipId: access.detail.id,
        versionId: access.detail.version.id,
        itemIds: selectedItems.map((item) => item.id),
        action: input.package ? "download_package" : "download_item",
        targetType: "download",
        targetId: downloadId,
    });
    return { ...prepared, downloadId };
}

export async function previewIpMediaForUser(userId: string, request: Request, ipId: string, input: IpPreviewInput): Promise<PreparedIpDownload> {
    const normalizedIpId = requiredText(ipId, "IP 标识无效");
    const versionId = optionalText(input.versionId);
    if (input.cover) {
        const access = await requireVisibleIp(userId, normalizedIpId, versionId);
        if (!access.detail.coverAssetId) throw new SchoolServiceError(404, "IP 封面不存在");
        return resolveItemDownload(request, {
            id: "cover",
            versionId: access.detail.version.id,
            kind: "image",
            category: "style",
            title: `${access.detail.title}封面`,
            summary: "",
            assetId: access.detail.coverAssetId,
            sortOrder: 0,
            createdAt: access.detail.createdAt,
        });
    }
    const itemId = requiredText(input.itemId || "", "IP 内容项无效");
    const access = await requireVisibleIp(userId, normalizedIpId, versionId, [itemId]);
    const item = access.detail.version.items.find((candidate) => candidate.id === itemId);
    if (!item || item.kind === "text") throw new SchoolServiceError(404, "IP 内容文件不存在");
    return resolveItemDownload(request, item);
}

async function resolveItemDownload(request: Request, item: IpItemRecord): Promise<PreparedIpDownload> {
    const media = await resolveItemMedia(item);
    if (media.kind === "redirect") {
        const signedRequest = new Request(withOriginalDownload(request.url), { headers: request.headers });
        const url = await createExternalMediaReadUrl(signedRequest, media.registration);
        if (!url) throw new SchoolServiceError(404, "IP 内容文件不存在");
        return { kind: "redirect", url, fileName: media.fileName };
    }
    return { kind: "file", bytes: media.bytes, mimeType: media.mimeType, fileName: media.fileName };
}

async function createPackage(detail: { id: string; title: string; summary: string; version: { id: string; versionNumber: number; title: string; summary: string; items: IpItemRecord[] } }, items: IpItemRecord[]) {
    const entries: Zippable = {};
    const manifestItems: Array<Record<string, unknown>> = [];
    const usedNames = new Set<string>();
    for (const item of items) {
        const media = await readMediaBytes(item);
        const fileName = uniqueFileName(`${kindDirectory(item.kind)}/${categoryDirectory(item.category)}/${safeName(item.title)}${extensionFor(item, media.mimeType)}`, usedNames, item.id);
        entries[fileName] = media.bytes;
        manifestItems.push({ id: item.id, kind: item.kind, category: item.category, title: item.title, summary: item.summary, fileName });
    }
    const manifest = {
        ipId: detail.id,
        title: detail.title,
        summary: detail.summary,
        versionId: detail.version.id,
        versionNumber: detail.version.versionNumber,
        versionTitle: detail.version.title,
        versionSummary: detail.version.summary,
        source: "VOZEB PRO 平台线下审核 IP 内容包",
        attribution: "内容仅限当前有效授权范围内的学校教学、练习和创作使用。",
        items: manifestItems,
    };
    entries["manifest.json"] = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
    entries["README.md"] = Buffer.from(`# ${detail.title}\n\n版本：${detail.version.versionNumber}\n\n${manifest.attribution}\n\n本包由 VOZEB PRO IP 库生成，文件来源与内容分类见 manifest.json。`, "utf8");
    return Buffer.from(zipSync(entries, { level: 0 }));
}

async function resolveItemMedia(item: IpItemRecord): Promise<{ kind: "file"; bytes: Buffer; mimeType: string; fileName: string } | { kind: "redirect"; registration: NonNullable<Awaited<ReturnType<typeof getLocalMediaRegistration>>>; fileName: string }> {
    if (item.kind === "text") return { kind: "file", bytes: Buffer.from(item.textContent || "", "utf8"), mimeType: "text/markdown; charset=utf-8", fileName: `${safeName(item.title)}.md` };
    if (!item.assetId) throw new SchoolServiceError(404, "IP 内容文件不存在");
    const asset = await getLibraryAssetById(item.assetId);
    if (!asset || asset.kind !== item.kind) throw new SchoolServiceError(404, "IP 内容文件不存在");
    const data = asset.data as Record<string, unknown>;
    const dataUrl = typeof data.dataUrl === "string" ? parseDataUrl(data.dataUrl) : null;
    if (dataUrl) return { kind: "file", bytes: dataUrl.bytes, mimeType: dataUrl.mimeType, fileName: `${safeName(item.title)}${extensionFor(item, dataUrl.mimeType)}` };
    const storageKey = typeof data.storageKey === "string" ? data.storageKey.trim() : "";
    const registration = storageKey ? await getLocalMediaRegistration(storageKey) : null;
    if (!registration || registration.type !== item.kind) throw new SchoolServiceError(404, "IP 内容文件不存在");
    const fileName = registration.originalName || `${safeName(item.title)}${extensionFor(item, registration.mimeType)}`;
    if (registration.storageProvider === "object") return { kind: "redirect", registration, fileName };
    const root = resolveServerDataPath(registration.scope === "generation" ? "generation-assets" : "reference-assets");
    const filePath = resolve(root, registration.storageKey);
    if (filePath === root || !filePath.startsWith(`${resolve(root)}${sep}`)) throw new SchoolServiceError(404, "IP 内容文件不存在");
    const bytes = await readFile(filePath).catch(() => null);
    if (!bytes) throw new SchoolServiceError(404, "IP 内容文件不存在");
    return { kind: "file", bytes, mimeType: registration.mimeType || "application/octet-stream", fileName };
}

async function readMediaBytes(item: IpItemRecord) {
    const media = await resolveItemMedia(item);
    if (media.kind === "file") return media;
    const config = await getObjectStorageRuntimeConfig();
    assertObjectStorageConfigured(config);
    if (!media.registration.externalObjectKey) throw new SchoolServiceError(404, "IP 内容文件不存在");
    return { kind: "file" as const, bytes: await getObjectBytes(config, media.registration.externalObjectKey), mimeType: media.registration.mimeType || "application/octet-stream", fileName: media.fileName };
}

function selectSingleItem(items: IpItemRecord[], ids: string[]) {
    if (ids.length !== 1) throw new SchoolServiceError(400, "单项下载必须指定一个 IP 内容项");
    const item = items.find((candidate) => candidate.id === ids[0]);
    if (!item) throw new SchoolServiceError(403, "IP 内容项不存在或不属于当前版本");
    return [item];
}

function normalizeItemIds(value: string[] | undefined) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new SchoolServiceError(400, "IP 内容项无效");
    const ids = value.map((item) => item.trim());
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new SchoolServiceError(400, "IP 内容项无效");
    return ids;
}

function requiredText(value: string, message: string) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new SchoolServiceError(400, message);
    return text;
}
function optionalText(value: string | undefined) {
    const text = typeof value === "string" ? value.trim() : "";
    return text || undefined;
}
function withOriginalDownload(url: string) {
    const next = new URL(url);
    next.searchParams.set("download", "original");
    return next.toString();
}
function kindDirectory(kind: IpItemRecord["kind"]) {
    return kind === "audio" ? "audio" : kind === "image" ? "images" : kind === "video" ? "video" : "text";
}
function categoryDirectory(category: string) {
    return safeName(category.replace(/_/g, "-"));
}
function safeName(value: string) {
    return (
        (value || "内容")
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
            .trim()
            .slice(0, 120) || "内容"
    );
}
function uniqueFileName(name: string, used: Set<string>, id: string) {
    if (!used.has(name)) {
        used.add(name);
        return name;
    }
    const dot = name.lastIndexOf(".");
    const next = `${name.slice(0, dot)}-${safeName(id)}${name.slice(dot)}`;
    used.add(next);
    return next;
}
function extensionFor(item: IpItemRecord, mimeType: string) {
    if (item.kind === "text") return ".md";
    const match = mimeType.match(/\/([a-z0-9]+)(?:;|$)/i)?.[1]?.toLowerCase();
    return match === "mpeg" ? ".mp3" : match ? `.${match}` : item.kind === "image" ? ".bin" : ".dat";
}
function parseDataUrl(value: string) {
    const match = value.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
    if (!match) return null;
    const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    return bytes.length ? { mimeType: match[1], bytes } : null;
}
