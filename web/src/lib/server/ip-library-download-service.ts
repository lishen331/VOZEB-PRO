import { randomUUID } from "node:crypto";

import { zipSync, type Zippable } from "fflate";

import type { IpContentFileRecord, IpDetailRecord, IpItemRecord } from "@/lib/server/database/repository-types";
import { SchoolServiceError } from "@/lib/server/school-access-service";
import { createIpLibraryRepository, requireVisibleIp } from "./ip-library-access-service";
import { readIpContentFile, readIpContentFileBytes } from "./ip-library-file-storage";

export type IpDownloadInput = { versionId?: string; itemIds?: string[]; package: boolean };
export type IpDownloadResult =
    | { kind: "redirect"; url: string; fileName: string; downloadId: string }
    | { kind: "response"; response: Response; fileName: string; downloadId: string }
    | { kind: "file"; bytes: Buffer; mimeType: string; fileName: string; downloadId: string };
type PreparedIpDownload =
    | { kind: "redirect"; url: string; fileName: string }
    | { kind: "response"; response: Response; fileName: string }
    | { kind: "file"; bytes: Buffer; mimeType: string; fileName: string };
export type IpPreviewInput = { versionId?: string; itemId?: string; cover?: boolean };

export async function downloadIpForUser(userId: string, request: Request, ipId: string, input: IpDownloadInput): Promise<IpDownloadResult> {
    const itemIds = normalizeItemIds(input.itemIds);
    const access = await requireVisibleIp(userId, requiredText(ipId, "IP 标识无效"), optionalText(input.versionId), input.package ? [] : itemIds);
    const downloadId = randomUUID();
    const selectedItems = input.package ? access.detail.version.items : selectSingleItem(access.detail.version.items, itemIds);
    const repository = createIpLibraryRepository();
    const record = {
        id: downloadId,
        ipId: access.detail.id,
        versionId: access.detail.version.id,
        itemId: input.package ? undefined : selectedItems[0]?.id,
        schoolId: access.schoolId,
        userId,
        downloadType: input.package ? ("package" as const) : ("item" as const),
    };
    let prepared: PreparedIpDownload;
    try {
        prepared = input.package
            ? { kind: "file", bytes: await createPackage(repository, access.detail, selectedItems), mimeType: "application/zip", fileName: `${safeName(access.detail.title)}-v${access.detail.version.versionNumber}.zip` }
            : await resolveItemDownload(repository, request, access.detail.id, selectedItems[0]);
    } catch (error) {
        await repository.recordIpDownload({ ...record, result: "failed" }).catch(() => undefined);
        throw error;
    }
    await repository.recordIpDownload({ ...record, result: "succeeded" });
    return { ...prepared, downloadId };
}

export async function previewIpMediaForUser(userId: string, request: Request, ipId: string, input: IpPreviewInput): Promise<PreparedIpDownload> {
    const normalizedIpId = requiredText(ipId, "IP 标识无效");
    const versionId = optionalText(input.versionId);
    const repository = createIpLibraryRepository();
    if (input.cover) {
        const access = await requireVisibleIp(userId, normalizedIpId, versionId);
        const coverFileId = access.detail.version.coverFileId;
        if (!coverFileId) throw new SchoolServiceError(404, "IP 封面不存在");
        const file = await repository.getIpContentFile(access.detail.id, coverFileId);
        if (!file || file.kind !== "image" || file.status !== "ready") throw new SchoolServiceError(404, "IP 封面不存在");
        return resolveStoredFile(request, file, false);
    }
    const itemId = requiredText(input.itemId || "", "IP 内容项无效");
    const access = await requireVisibleIp(userId, normalizedIpId, versionId, [itemId]);
    const item = access.detail.version.items.find((candidate) => candidate.id === itemId);
    if (!item || item.kind === "text") throw new SchoolServiceError(404, "IP 内容文件不存在");
    return resolveItemDownload(repository, request, access.detail.id, item, false);
}

async function resolveItemDownload(repository: ReturnType<typeof createIpLibraryRepository>, request: Request, ipId: string, item: IpItemRecord, original = true): Promise<PreparedIpDownload> {
    const file = item.fileId ? await repository.getIpContentFile(ipId, item.fileId) : null;
    if (!file || file.kind !== item.kind || file.status !== "ready") throw new SchoolServiceError(404, "IP 内容文件不存在");
    return resolveStoredFile(request, file, original);
}

async function resolveStoredFile(request: Request, file: IpContentFileRecord, original: boolean): Promise<PreparedIpDownload> {
    const url = new URL(request.url);
    if (original) url.searchParams.set("download", "original");
    const response = await readIpContentFile(new Request(url, { headers: request.headers, method: request.method }), file);
    if (!response) throw new SchoolServiceError(404, "IP 内容文件不存在");
    if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("Location");
        if (!location) throw new SchoolServiceError(404, "IP 内容文件不存在");
        return { kind: "redirect", url: location, fileName: file.originalName };
    }
    return { kind: "response", response, fileName: file.originalName };
}

async function createPackage(repository: ReturnType<typeof createIpLibraryRepository>, detail: IpDetailRecord, items: IpItemRecord[]) {
    const entries: Zippable = {};
    const manifestItems: Array<Record<string, unknown>> = [];
    const usedNames = new Set<string>();
    if (detail.version.coverFileId) {
        const cover = await repository.getIpContentFile(detail.id, detail.version.coverFileId);
        if (!cover || cover.kind !== "image" || cover.status !== "ready") throw new SchoolServiceError(404, "IP 封面原文件不存在");
        const bytes = await readIpContentFileBytes(cover);
        if (!bytes) throw new SchoolServiceError(404, "IP 封面原文件不存在");
        const fileName = uniqueFileName(`封面/${safeName(cover.originalName)}`, usedNames, cover.id);
        entries[fileName] = bytes;
    }
    for (const item of items) {
        const file = item.fileId ? await repository.getIpContentFile(detail.id, item.fileId) : null;
        if (!file || file.kind !== item.kind || file.status !== "ready") throw new SchoolServiceError(404, "IP 内容原文件不存在");
        const bytes = await readIpContentFileBytes(file);
        if (!bytes) throw new SchoolServiceError(404, "IP 内容原文件不存在");
        const category = categoryDirectory(item.kind, item.category);
        const fileName = uniqueFileName(`${kindDirectory(item.kind)}/${category ? `${category}/` : ""}${safeName(item.title)}${file.extension}`, usedNames, item.id);
        entries[fileName] = bytes;
        manifestItems.push({ id: item.id, kind: item.kind, category: item.category, title: item.title, summary: item.summary, fileName, originalName: file.originalName, mimeType: file.mimeType, byteSize: file.byteSize, sha256: file.sha256 });
    }
    const manifest = {
        ipId: detail.id,
        title: detail.title,
        summary: detail.summary,
        versionId: detail.version.id,
        versionNumber: detail.version.versionNumber,
        versionTitle: detail.version.title,
        versionSummary: detail.version.summary,
        tags: detail.version.tags,
        sourceNote: detail.version.sourceNote,
        changeNote: detail.version.changeNote,
        publishedAt: detail.version.publishedAt,
        source: "VOZEB PRO 平台线下审核 IP 内容包",
        attribution: "内容仅限当前有效授权范围内的学校教学、练习和创作使用。",
        items: manifestItems,
    };
    entries["manifest.json"] = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
    entries["README.md"] = Buffer.from(`# ${detail.title}\n\n版本：${detail.version.versionNumber}\n\n来源说明：${detail.version.sourceNote || "无"}\n\n${manifest.attribution}\n\n本包由 VOZEB PRO IP 库生成，文件来源与内容分类见 manifest.json。`, "utf8");
    return Buffer.from(zipSync(entries, { level: 0 }));
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
function kindDirectory(kind: IpItemRecord["kind"]) {
    return kind === "audio" ? "音乐与声音" : kind === "image" ? "图片" : kind === "video" ? "视频参考" : "文本";
}
function categoryDirectory(kind: IpItemRecord["kind"], category: string) {
    if (kind !== "image") return "";
    return { character: "角色", scene: "场景", prop: "道具", effect: "特效", style: "风格参考" }[category] || safeName(category.replace(/_/g, "-"));
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
