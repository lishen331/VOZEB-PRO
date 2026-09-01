import { createHash, randomUUID } from "node:crypto";

import type { IpAssetKind, IpItemCategory, IpUsageAction } from "@/lib/ip-library-domain";
import type { IpDetailRecord, IpItemRecord, IpSummaryRecord, IpUsageRecord, IpUsageTargetType, PageResult } from "@/lib/server/database/repository-types";
import { createIpLibraryRepository, requireActiveIpLibraryUser, requireVisibleIp } from "./ip-library-access-service";
import { getSchoolContextForUser, requireActiveSchoolContext, SchoolServiceError } from "./school-access-service";

export type IpListInput = { scope: "public" | "school"; page?: number; pageSize?: number; keyword?: string; kind?: IpAssetKind; category?: IpItemCategory };
export type IpSummary = Omit<IpSummaryRecord, "authorizationMode" | "grantMode" | "createdByUserId" | "coverAssetId" | "coverFileId"> & { isExclusive: boolean; coverPreviewUrl?: string };
export type IpPublicItem = Omit<IpItemRecord, "assetId" | "fileId" | "textContent"> & { textContent?: string; previewUrl?: string };
export type IpDetail = Omit<IpDetailRecord, "authorizationMode" | "grantMode" | "createdByUserId" | "coverAssetId" | "version"> & {
    isExclusive: boolean;
    coverPreviewUrl?: string;
    version: Omit<IpDetailRecord["version"], "manifest" | "createdByUserId" | "items"> & { items: IpPublicItem[] };
};
export type IpUsageInput = {
    ipId: string;
    versionId?: string;
    itemIds?: string[];
    action: IpUsageAction;
    targetType: IpUsageTargetType;
    targetId: string;
};

export async function listIpLibraryForUser(userId: string, input: IpListInput): Promise<PageResult<IpSummary>> {
    await requireActiveIpLibraryUser(userId);
    if (input.scope !== "public" && input.scope !== "school") throw new SchoolServiceError(400, "IP 范围无效");
    const schoolId = input.scope === "school" ? (await requireActiveSchoolContext(userId)).school.id : undefined;
    const result = await createIpLibraryRepository().listVisibleIps({ ...input, userId, schoolId });
    return { ...result, items: result.items.map(toUserSummary) };
}

export async function getIpDetailForUser(userId: string, ipId: string, versionId?: string): Promise<IpDetail> {
    return toUserDetail((await requireVisibleIp(userId, requiredText(ipId, "IP 标识无效"), optionalText(versionId))).detail);
}

export async function createIpUsageForUser(userId: string, input: IpUsageInput): Promise<IpUsageRecord> {
    return createIpLibraryRepository().recordIpUsage(await prepareIpUsage(userId, input));
}

export async function createIpUsagesForUser(userId: string, inputs: IpUsageInput[]): Promise<IpUsageRecord[]> {
    if (!Array.isArray(inputs) || !inputs.length) return [];
    const records = await Promise.all(inputs.map((input) => prepareIpUsage(userId, input)));
    return createIpLibraryRepository().recordIpUsages([...new Map(records.map((record) => [record.id, record])).values()]);
}

async function prepareIpUsage(userId: string, input: IpUsageInput) {
    const itemIds = normalizeItemIds(input.itemIds);
    validateUsageTarget(input.action, input.targetType, input.targetId, itemIds);
    const access = await requireVisibleIp(userId, requiredText(input.ipId, "IP 标识无效"), optionalText(input.versionId), itemIds);
    let schoolId = access.schoolId;
    if (!schoolId) {
        const context = await getSchoolContextForUser(userId);
        if (context?.school.status === "active" && context.membership.status === "active") schoolId = context.school.id;
    }
    const targetId = input.targetId.trim();
    return {
        id: input.action === "reference" ? referenceUsageId(userId, access.detail.id, access.detail.version.id, itemIds, input.targetType, targetId) : randomUUID(),
        ipId: access.detail.id,
        versionId: access.detail.version.id,
        itemIds,
        schoolId,
        userId,
        action: input.action,
        targetType: input.targetType,
        targetId,
    };
}

function referenceUsageId(userId: string, ipId: string, versionId: string, itemIds: string[], targetType: IpUsageTargetType, targetId: string) {
    const digest = createHash("sha256")
        .update([userId, ipId, versionId, targetType, targetId, ...[...itemIds].sort()].join("\0"))
        .digest("hex");
    return `ip-usage-${digest}`;
}

function toUserSummary(record: IpSummaryRecord): IpSummary {
    const { authorizationMode: _authorizationMode, grantMode, createdByUserId: _createdByUserId, coverAssetId: _coverAssetId, coverFileId, ...summary } = record;
    return { ...summary, isExclusive: grantMode === "exclusive", ...(coverFileId ? { coverPreviewUrl: coverPreview(record.id, record.currentVersionId) } : {}) };
}

async function toUserDetail(record: IpDetailRecord): Promise<IpDetail> {
    const { authorizationMode: _authorizationMode, grantMode, createdByUserId: _createdByUserId, coverAssetId: _coverAssetId, version, ...detail } = record;
    const { manifest: _manifest, createdByUserId: _versionCreator, items, ...publicVersion } = version;
    const repository = createIpLibraryRepository();
    const files = await Promise.all(items.map((item) => (item.fileId ? repository.getIpContentFile(record.id, item.fileId) : null)));
    return {
        ...detail,
        title: version.title,
        summary: version.summary,
        isExclusive: grantMode === "exclusive",
        ...(version.coverFileId ? { coverPreviewUrl: coverPreview(record.id, version.id) } : {}),
        version: {
            ...publicVersion,
            items: items.map(({ assetId: _assetId, fileId: _fileId, textContent: _textContent, ...item }, index) => ({
                ...item,
                ...(files[index]?.kind === "text" && files[index]?.extractedText ? { textContent: files[index]!.extractedText } : {}),
                ...(files[index]?.status === "ready" && files[index]?.kind !== "text" ? { previewUrl: itemPreview(record.id, version.id, item.id) } : {}),
            })),
        },
    };
}

function coverPreview(ipId: string, versionId?: string) {
    const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
    return `/api/ip-library/${encodeURIComponent(ipId)}/cover${query}`;
}

function itemPreview(ipId: string, versionId: string, itemId: string) {
    return `/api/ip-library/${encodeURIComponent(ipId)}/items/${encodeURIComponent(itemId)}/media?versionId=${encodeURIComponent(versionId)}`;
}

function normalizeItemIds(value: string[] | undefined) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new SchoolServiceError(400, "IP 内容项无效");
    return value.map((item) => item.trim());
}

function validateUsageTarget(action: IpUsageAction, targetType: IpUsageTargetType, targetId: string, itemIds: string[]) {
    const target = requiredText(targetId, "IP 使用目标无效");
    if (!["reference", "download_item", "download_package"].includes(action)) throw new SchoolServiceError(400, "IP 使用动作无效");
    if (!["canvas", "drama", "practice", "download"].includes(targetType)) throw new SchoolServiceError(400, "IP 使用目标无效");
    if (action === "reference" && !["canvas", "drama", "practice"].includes(targetType)) throw new SchoolServiceError(400, "IP 引用目标无效");
    if (action !== "reference" && targetType !== "download") throw new SchoolServiceError(400, "IP 下载目标无效");
    if (action === "download_item" && itemIds.length !== 1) throw new SchoolServiceError(400, "单项下载必须指定一个 IP 内容项");
    if (!target) throw new SchoolServiceError(400, "IP 使用目标无效");
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
