import { createHash, randomUUID } from "node:crypto";

import type { IpAssetKind, IpItemCategory, IpUsageAction } from "@/lib/ip-library-domain";
import type { IpDetailRecord, IpItemRecord, IpSubIpDetailRecord, IpSummaryRecord, IpUsageRecord, IpUsageTargetType, PageResult } from "@/lib/server/database/repository-types";
import { createIpLibraryRepository, requireActiveIpLibraryUser, requireVisibleIp } from "./ip-library-access-service";
import { getSchoolContextForUser, requireActiveSchoolContext, SchoolServiceError } from "./school-access-service";

export type IpListInput = { scope: "public" | "school"; page?: number; pageSize?: number; keyword?: string; kind?: IpAssetKind; category?: IpItemCategory; tags?: string[] };
export type IpPublicItem = Omit<IpItemRecord, "fileId"> & { textContent?: string; previewUrl?: string };
export type IpPublicSubIp = Omit<IpSubIpDetailRecord, "items" | "createdByUserId"> & { items: IpPublicItem[]; isExclusive: boolean; coverPreviewUrl?: string };
export type IpSummary = Omit<IpSummaryRecord, "createdByUserId" | "coverFileId"> & { coverPreviewUrl?: string };
export type IpDetail = Omit<IpDetailRecord, "createdByUserId" | "coverFileId" | "subIps"> & { coverPreviewUrl?: string; subIps: IpPublicSubIp[]; singleSubIp: boolean };
export type IpUsageInput = { ipId: string; subIpId?: string; itemIds?: string[]; action: IpUsageAction; targetType: IpUsageTargetType; targetId: string };

export async function listIpLibraryForUser(userId: string, input: IpListInput): Promise<PageResult<IpSummary>> {
    await requireActiveIpLibraryUser(userId);
    if (input.scope !== "public" && input.scope !== "school") throw new SchoolServiceError(400, "IP 范围无效");
    const schoolId = input.scope === "school" ? (await requireActiveSchoolContext(userId)).school.id : undefined;
    const result = await createIpLibraryRepository().listVisibleIps({ ...input, userId, schoolId });
    return { ...result, items: result.items.map(toUserSummary) };
}
export async function getIpDetailForUser(userId: string, ipId: string, subIpId?: string): Promise<IpDetail> {
    return toUserDetail((await requireVisibleIp(userId, requiredText(ipId, "IP 标识无效"), optionalText(subIpId))).detail);
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
    const access = await requireVisibleIp(userId, requiredText(input.ipId, "IP 标识无效"), optionalText(input.subIpId), itemIds);
    let schoolId = access.schoolId;
    if (!schoolId) {
        const context = await getSchoolContextForUser(userId);
        if (context?.school.status === "active" && context.membership.status === "active") schoolId = context.school.id;
    }
    const targetId = requiredText(input.targetId, "IP 使用目标无效");
    return {
        id: input.action === "reference" ? referenceUsageId(userId, access.detail.id, access.subIp.id, itemIds, input.targetType, targetId) : randomUUID(),
        ipId: access.detail.id,
        subIpId: access.subIp.id,
        itemIds,
        schoolId,
        userId,
        action: input.action,
        targetType: input.targetType,
        targetId,
    };
}
function referenceUsageId(userId: string, ipId: string, subIpId: string, itemIds: string[], targetType: IpUsageTargetType, targetId: string) {
    return `ip-usage-${createHash("sha256")
        .update([userId, ipId, subIpId, targetType, targetId, ...[...itemIds].sort()].join("\0"))
        .digest("hex")}`;
}
function toUserSummary(record: IpSummaryRecord): IpSummary {
    const { createdByUserId: _creator, coverFileId, ...summary } = record;
    return { ...summary, ...(coverFileId ? { coverPreviewUrl: coverPreview(record.id) } : {}) };
}
async function toUserDetail(record: IpDetailRecord): Promise<IpDetail> {
    const repository = createIpLibraryRepository();
    const subIps = await Promise.all(
        record.subIps.map(async (subIp) => {
            const files = await Promise.all(subIp.items.map((item) => repository.getIpContentFile(record.id, item.fileId, subIp.id)));
            const { createdByUserId: _creator, items, ...publicSubIp } = subIp;
            return {
                ...publicSubIp,
                isExclusive: subIp.grantMode === "exclusive",
                ...(subIp.coverFileId ? { coverPreviewUrl: coverPreview(record.id, subIp.id) } : {}),
                items: items.map(({ fileId: _fileId, ...item }, index) => ({
                    ...item,
                    ...(files[index]?.kind === "text" && files[index]?.extractedText ? { textContent: files[index]!.extractedText } : {}),
                    ...(files[index]?.status === "ready" && files[index]?.kind !== "text" ? { previewUrl: itemPreview(record.id, subIp.id, item.id) } : {}),
                })),
            };
        }),
    );
    const { createdByUserId: _creator, coverFileId, ...detail } = record;
    return { ...detail, ...(coverFileId ? { coverPreviewUrl: coverPreview(record.id) } : {}), subIps, singleSubIp: subIps.length === 1 };
}
function coverPreview(ipId: string, subIpId?: string) {
    const query = subIpId ? `?subIpId=${encodeURIComponent(subIpId)}` : "";
    return `/api/ip-library/${encodeURIComponent(ipId)}/cover${query}`;
}
function itemPreview(ipId: string, subIpId: string, itemId: string) {
    return `/api/ip-library/${encodeURIComponent(ipId)}/items/${encodeURIComponent(itemId)}/media?subIpId=${encodeURIComponent(subIpId)}`;
}
function normalizeItemIds(value: string[] | undefined) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new SchoolServiceError(400, "IP 内容项无效");
    return value.map((item) => item.trim());
}
function validateUsageTarget(action: IpUsageAction, targetType: IpUsageTargetType, targetId: string, itemIds: string[]) {
    requiredText(targetId, "IP 使用目标无效");
    if (!["reference", "download_item", "download_package"].includes(action)) throw new SchoolServiceError(400, "IP 使用动作无效");
    if (!["canvas", "drama", "practice", "download"].includes(targetType)) throw new SchoolServiceError(400, "IP 使用目标无效");
    if (action === "reference" && !["canvas", "drama", "practice"].includes(targetType)) throw new SchoolServiceError(400, "IP 引用目标无效");
    if (action !== "reference" && targetType !== "download") throw new SchoolServiceError(400, "IP 下载目标无效");
    if (action === "download_item" && itemIds.length !== 1) throw new SchoolServiceError(400, "单项下载必须指定一个 IP 内容项");
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
