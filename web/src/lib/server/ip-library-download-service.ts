import { randomUUID } from "node:crypto";

import { zipSync, type Zippable } from "fflate";
import type { IpContentFileRecord, IpDetailRecord, IpItemRecord, IpSubIpDetailRecord } from "@/lib/server/database/repository-types";
import { createIpLibraryRepository, requireVisibleIp } from "./ip-library-access-service";
import { readIpContentFile, readIpContentFileBytes } from "./ip-library-file-storage";
import { SchoolServiceError } from "./school-access-service";

export type IpDownloadInput = { subIpId?: string; itemIds?: string[]; package: boolean; packageScope?: "ip" | "sub_ip" };
export type IpDownloadResult =
    { kind: "redirect"; url: string; fileName: string; downloadId: string } | { kind: "response"; response: Response; fileName: string; downloadId: string } | { kind: "file"; bytes: Buffer; mimeType: string; fileName: string; downloadId: string };
type PreparedIpDownload = { kind: "redirect"; url: string; fileName: string } | { kind: "response"; response: Response; fileName: string } | { kind: "file"; bytes: Buffer; mimeType: string; fileName: string };
export type IpPreviewInput = { subIpId?: string; itemId?: string; cover?: boolean };

export async function downloadIpForUser(userId: string, request: Request, ipId: string, input: IpDownloadInput): Promise<IpDownloadResult> {
    const itemIds = normalizeItemIds(input.itemIds);
    const packageScope = input.package ? normalizePackageScope(input.packageScope) : undefined;
    if (!input.package && input.packageScope !== undefined) throw new SchoolServiceError(400, "下载内容范围无效");
    if (packageScope === "ip" && input.subIpId !== undefined) throw new SchoolServiceError(400, "下载 IP 内容包时无需指定子 IP");
    const access = await requireVisibleIp(userId, requiredText(ipId, "IP 标识无效"), packageScope === "ip" ? undefined : optionalText(input.subIpId), input.package ? [] : itemIds);
    const selectedItems = input.package ? access.subIp.items : selectSingleItem(access.subIp.items, itemIds);
    const record = {
        id: randomUUID(),
        ipId: access.detail.id,
        ...(packageScope === "ip" ? {} : { subIpId: access.subIp.id }),
        itemId: input.package ? undefined : selectedItems[0]?.id,
        schoolId: access.schoolId,
        userId,
        downloadType: input.package ? ("package" as const) : ("item" as const),
        ...(packageScope ? { packageScope } : {}),
    };
    const repository = createIpLibraryRepository();
    let prepared: PreparedIpDownload;
    try {
        prepared = input.package
            ? packageScope === "ip"
                ? { kind: "file", bytes: await createIpPackageArchive(repository, access.detail), mimeType: "application/zip", fileName: `${safeName(access.detail.title)}.zip` }
                : { kind: "file", bytes: await createSubIpPackage(repository, access.detail.title, access.subIp, selectedItems), mimeType: "application/zip", fileName: `${safeName(access.detail.title)}-${safeName(access.subIp.title)}.zip` }
            : await resolveItemDownload(repository, request, access.detail.id, access.subIp.id, selectedItems[0]);
    } catch (error) {
        await repository.recordIpDownload({ ...record, result: "failed" }).catch(() => undefined);
        throw error;
    }
    await repository.recordIpDownload({ ...record, result: "succeeded" });
    return { ...prepared, downloadId: record.id };
}
export async function previewIpMediaForUser(userId: string, request: Request, ipId: string, input: IpPreviewInput): Promise<PreparedIpDownload> {
    const subIpId = optionalText(input.subIpId);
    const access = await requireVisibleIp(userId, requiredText(ipId, "IP 标识无效"), subIpId, input.itemId ? [input.itemId] : []);
    const repository = createIpLibraryRepository();
    if (input.cover) {
        const coverFileId = subIpId ? access.subIp.coverFileId : access.detail.coverFileId;
        if (!coverFileId) throw new SchoolServiceError(404, subIpId ? "子 IP 封面不存在" : "IP 封面不存在");
        const file = await repository.getIpContentFile(access.detail.id, coverFileId, subIpId ? access.subIp.id : undefined);
        if (!file || file.kind !== "image" || file.status !== "ready") throw new SchoolServiceError(404, subIpId ? "子 IP 封面不存在" : "IP 封面不存在");
        return resolveStoredFile(request, file, false);
    }
    const item = access.subIp.items.find((candidate) => candidate.id === requiredText(input.itemId, "IP 内容项无效"));
    if (!item || item.kind === "text") throw new SchoolServiceError(404, "IP 内容文件不存在");
    return resolveItemDownload(repository, request, access.detail.id, access.subIp.id, item, false);
}
async function resolveItemDownload(repository: ReturnType<typeof createIpLibraryRepository>, request: Request, ipId: string, subIpId: string, item: IpItemRecord, original = true): Promise<PreparedIpDownload> {
    const file = await repository.getIpContentFile(ipId, item.fileId, subIpId);
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
async function createIpPackageArchive(repository: ReturnType<typeof createIpLibraryRepository>, detail: IpDetailRecord) {
    const entries: Zippable = {};
    const names = new Set<string>();
    const children: Array<{ id: string; title: string; fileName: string }> = [];
    for (const subIp of detail.subIps) {
        const fileName = uniqueFileName(`${safeName(subIp.title)}.zip`, names, subIp.id);
        entries[fileName] = await createSubIpPackage(repository, detail.title, subIp, subIp.items);
        children.push({ id: subIp.id, title: subIp.title, fileName });
    }
    entries["manifest.json"] = Buffer.from(JSON.stringify({ ipId: detail.id, ipTitle: detail.title, summary: detail.summary, source: "VOZEB PRO 平台 IP 内容包", subIpPackages: children }, null, 2), "utf8");
    entries["README.md"] = Buffer.from(`# ${detail.title}\n\n本压缩包内每个子 IP 均为独立内容包。\n`, "utf8");
    return Buffer.from(zipSync(entries, { level: 0 }));
}
async function createSubIpPackage(repository: ReturnType<typeof createIpLibraryRepository>, ipTitle: string, subIp: IpSubIpDetailRecord, items: IpItemRecord[]) {
    const entries: Zippable = {};
    const manifestItems: Array<Record<string, unknown>> = [];
    const names = new Set<string>();
    if (subIp.coverFileId) await addCover(repository, entries, names, subIp);
    for (const item of items) {
        const file = await repository.getIpContentFile(subIp.ipId, item.fileId, subIp.id);
        if (!file || file.kind !== item.kind || file.status !== "ready") throw new SchoolServiceError(404, "IP 内容原文件不存在");
        const bytes = await readIpContentFileBytes(file);
        if (!bytes) throw new SchoolServiceError(404, "IP 内容原文件不存在");
        const fileName = uniqueFileName(`${kindDirectory(item.kind)}/${categoryDirectory(item.kind, item.category)}${safeName(item.title)}${file.extension}`, names, item.id);
        entries[fileName] = bytes;
        manifestItems.push({ id: item.id, kind: item.kind, category: item.category, title: item.title, summary: item.summary, fileName, originalName: file.originalName, mimeType: file.mimeType, byteSize: file.byteSize, sha256: file.sha256 });
    }
    const manifest = {
        ipTitle,
        subIpId: subIp.id,
        subIpTitle: subIp.title,
        summary: subIp.summary,
        tags: subIp.tags,
        source: "VOZEB PRO 平台 IP 内容包",
        attribution: "内容仅限当前有效授权范围内的学校教学、练习和创作使用。",
        items: manifestItems,
    };
    entries["manifest.json"] = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
    entries["README.md"] = Buffer.from(`# ${ipTitle}\n\n子 IP：${subIp.title}\n\n${manifest.attribution}\n`, "utf8");
    return Buffer.from(zipSync(entries, { level: 0 }));
}
async function addCover(repository: ReturnType<typeof createIpLibraryRepository>, entries: Zippable, names: Set<string>, subIp: IpSubIpDetailRecord) {
    const file = await repository.getIpContentFile(subIp.ipId, subIp.coverFileId!, subIp.id);
    if (!file || file.kind !== "image" || file.status !== "ready") throw new SchoolServiceError(404, "子 IP 封面原文件不存在");
    const bytes = await readIpContentFileBytes(file);
    if (!bytes) throw new SchoolServiceError(404, "子 IP 封面原文件不存在");
    entries[uniqueFileName(`封面/${safeName(file.originalName)}`, names, file.id)] = bytes;
}
function selectSingleItem(items: IpItemRecord[], ids: string[]) {
    if (ids.length !== 1) throw new SchoolServiceError(400, "单项下载必须指定一个 IP 内容项");
    const item = items.find((candidate) => candidate.id === ids[0]);
    if (!item) throw new SchoolServiceError(403, "IP 内容项不存在或不属于当前子 IP");
    return [item];
}
function normalizeItemIds(value: string[] | undefined) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new SchoolServiceError(400, "IP 内容项无效");
    const ids = value.map((item) => item.trim());
    if (ids.some((item) => !item) || new Set(ids).size !== ids.length) throw new SchoolServiceError(400, "IP 内容项无效");
    return ids;
}
function normalizePackageScope(value: unknown): "ip" | "sub_ip" {
    if (value === undefined) return "sub_ip" as const;
    if (value === "ip" || value === "sub_ip") return value;
    throw new SchoolServiceError(400, "下载内容范围无效");
}
function requiredText(value: unknown, message: string) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new SchoolServiceError(400, message);
    return text;
}
function optionalText(value: unknown) {
    const text = typeof value === "string" ? value.trim() : "";
    return text || undefined;
}
function kindDirectory(kind: IpItemRecord["kind"]) {
    return kind === "audio" ? "音乐与声音" : kind === "image" ? "图片" : kind === "video" ? "视频参考" : "文本";
}
function categoryDirectory(kind: IpItemRecord["kind"], category: string) {
    if (kind !== "image") return "";
    return `${{ character: "角色", scene: "场景", prop: "道具", effect: "特效", style: "风格参考" }[category] || safeName(category.replace(/_/g, "-"))}/`;
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
