import { randomUUID } from "node:crypto";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { getPublicUsersByIds } from "@/lib/auth/store";
import { IP_ASSET_KINDS, IP_AUTHORIZATION_MODES, IP_STATUSES, IP_VISIBILITIES, normalizeIpItemCategory, type IpAssetKind, type IpAuthorizationMode, type IpItemCategory, type IpStatus, type IpVisibility } from "@/lib/ip-library-domain";
import type { IpItemInput, IpPackagePatch, IpSchoolGrantStatus, PageInput } from "@/lib/server/database/repository-types";
import { deleteStoredIpContentFile, readIpContentFile, writeIpContentFile } from "@/lib/server/ip-library-file-storage";
import { SchoolServiceError } from "@/lib/server/school-access-service";
import { createIpLibraryRepository } from "./ip-library-access-service";
import { createSchoolDomainRepository } from "./school-domain-repository";

export type AdminIpCreateInput = { title: string; slug?: string; summary?: string; visibility: IpVisibility };
export type AdminIpPatchInput = Partial<AdminIpCreateInput> & { status?: IpStatus; coverFileId?: string | null };
export type AdminIpItemInput = { kind: IpAssetKind; category: IpItemCategory; title: string; summary?: string; fileId: string; sortOrder?: number };
export type AdminIpSubIpInput = { title: string; summary?: string; coverFileId?: string; tags?: string[]; sortOrder?: number; items?: AdminIpItemInput[] };
export type AdminIpGrantInput = { subIpId: string; schoolId: string; mode: IpAuthorizationMode; startsAt: string; endsAt?: string; note?: string };
export type AdminIpGrantBatchInput = { subIpIds: string[]; schoolIds: string[]; mode: IpAuthorizationMode; startsAt: string; endsAt?: string; note?: string };
export type AdminIpGrantPatchInput = { status?: IpSchoolGrantStatus; endsAt?: string | null; note?: string };

export async function listAdminIps(actorId: string, input: PageInput & { keyword?: string; status?: string; visibility?: string }) {
    await requireAnyIpDuty(actorId);
    await retryIpLibraryFileCleanup();
    return createIpLibraryRepository().listIpPackages(input);
}

export async function getAdminIp(actorId: string, ipId: string) {
    await requireAnyIpDuty(actorId);
    await retryIpLibraryFileCleanup();
    const record = await createIpLibraryRepository().getIpDetail(required(ipId, "IP 标识无效"));
    if (!record) throw new SchoolServiceError(404, "IP 不存在");
    return record;
}

export async function createAdminIp(actorId: string, input: AdminIpCreateInput) {
    await requireContentDuty(actorId);
    const repository = createIpLibraryRepository();
    const title = limitedRequired(input.title, "请填写 IP 名称", 20, "IP 名称");
    const summary = limitedOptional(input.summary, 100, "IP 简介");
    let slug = input.slug ? slugValue(input.slug) : generatedSlug(title);
    if (await repository.getIpPackageBySlug(slug)) {
        if (input.slug) throw new SchoolServiceError(409, "IP 标识已存在，请更换 slug", { field: "slug", reason: "duplicate" });
        slug = `${slug.slice(0, 70)}-${randomUUID().slice(0, 8)}`;
    }
    const record = await translateConflict("slug", () => repository.createIpPackage({ id: randomUUID(), title, slug, summary, visibility: enumValue(input.visibility, IP_VISIBILITIES, "IP 可见范围无效"), status: "enabled", createdByUserId: actorId }));
    // A new IP starts with one child so its content can be edited as a flat page.
    await repository.createIpSubIp(record.id, { id: randomUUID(), ipId: record.id, title, summary: record.summary, tags: [], createdByUserId: actorId });
    return record;
}

export async function updateAdminIp(actorId: string, ipId: string, input: AdminIpPatchInput) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const repository = createIpLibraryRepository();
    await getExistingPackage(id);
    const patch: IpPackagePatch = {};
    if (input.title !== undefined) patch.title = limitedRequired(input.title, "请填写 IP 名称", 20, "IP 名称");
    if (input.slug !== undefined) {
        patch.slug = slugValue(input.slug);
        if (await repository.getIpPackageBySlug(patch.slug, id)) throw new SchoolServiceError(409, "IP 标识已存在，请更换 slug", { field: "slug", reason: "duplicate" });
    }
    if (input.summary !== undefined) patch.summary = limitedOptional(input.summary, 100, "IP 简介");
    if (input.visibility !== undefined) patch.visibility = enumValue(input.visibility, IP_VISIBILITIES, "IP 可见范围无效");
    if (input.status !== undefined) patch.status = enumValue(input.status, IP_STATUSES, "IP 状态无效");
    if (input.coverFileId !== undefined) {
        patch.coverFileId = optional(input.coverFileId) || null;
        if (patch.coverFileId) await requireReadyPackageCover(repository, id, patch.coverFileId);
    }
    const updated = await translateConflict(patch.slug ? "slug" : "generic", () => repository.updateIpPackage(id, patch));
    if (!updated) throw new SchoolServiceError(404, "IP 不存在");
    return updated;
}

export async function deleteAdminIp(actorId: string, ipId: string) {
    await requireContentDuty(actorId);
    const repository = createIpLibraryRepository();
    const files = await repository.deleteIpPackage(required(ipId, "IP 标识无效"));
    if (files === "has-school-grants") throw new SchoolServiceError(409, "IP 已授权给学校，无法删除；请先撤销全部学校授权");
    if (!files) throw new SchoolServiceError(404, "IP 不存在");
    await retryIpLibraryFileCleanup();
    return { deleted: true };
}

export async function createAdminIpSubIp(actorId: string, ipId: string, input: AdminIpSubIpInput) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const repository = createIpLibraryRepository();
    await getExistingPackage(id);
    // A file belongs to one child IP. Create that child first, then upload
    // its files and set the cover in a later update.
    if (input.coverFileId !== undefined) throw new SchoolServiceError(400, "请先创建子 IP，再上传文件并设置封面");
    if (input.items?.length) throw new SchoolServiceError(400, "请先创建子 IP，再上传文件并保存内容项");
    const subIp = await repository.createIpSubIp(id, {
        id: randomUUID(),
        ipId: id,
        title: limitedRequired(input.title, "请填写子 IP 名称", 20, "子 IP 名称"),
        summary: limitedOptional(input.summary, 100, "子 IP 简介"),
        tags: normalizeTags(input.tags),
        sortOrder: validSortOrder(input.sortOrder),
        createdByUserId: actorId,
    });
    return (await repository.getIpSubIp(id, subIp.id))!;
}

export async function updateAdminIpSubIp(actorId: string, ipId: string, subIpId: string, input: AdminIpSubIpInput) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const childId = required(subIpId, "子 IP 标识无效");
    const repository = createIpLibraryRepository();
    const current = await repository.getIpSubIp(id, childId);
    if (!current) throw new SchoolServiceError(404, "子 IP 不存在");
    const patch = {
        ...(input.title !== undefined ? { title: limitedRequired(input.title, "请填写子 IP 名称", 20, "子 IP 名称") } : {}),
        ...(input.summary !== undefined ? { summary: limitedOptional(input.summary, 100, "子 IP 简介") } : {}),
        ...(input.coverFileId !== undefined ? { coverFileId: optional(input.coverFileId) || null } : {}),
        ...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: validSortOrder(input.sortOrder) } : {}),
    };
    if (patch.coverFileId) await requireReadyFile(repository, id, childId, patch.coverFileId, "image");
    const updated = await repository.updateIpSubIp(id, childId, patch);
    if (!updated) throw new SchoolServiceError(404, "子 IP 不存在");
    if (input.items !== undefined) await replaceAdminIpSubIpItems(actorId, id, childId, input.items);
    return (await repository.getIpSubIp(id, childId))!;
}

export async function deleteAdminIpSubIp(actorId: string, ipId: string, subIpId: string) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const childId = required(subIpId, "子 IP 标识无效");
    const repository = createIpLibraryRepository();
    const detail = await repository.getIpDetail(id);
    if (!detail) throw new SchoolServiceError(404, "IP 不存在");
    if (detail.subIps.length <= 1) throw new SchoolServiceError(409, "IP 至少保留一个子 IP");
    const files = await repository.deleteIpSubIp(id, childId);
    if (files === "last-sub-ip") throw new SchoolServiceError(409, "IP 至少保留一个子 IP");
    if (!files) throw new SchoolServiceError(404, "子 IP 不存在");
    await retryIpLibraryFileCleanup();
    return { deleted: true };
}

export async function replaceAdminIpSubIpItems(actorId: string, ipId: string, subIpId: string, inputs: AdminIpItemInput[]) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const childId = required(subIpId, "子 IP 标识无效");
    if (!Array.isArray(inputs)) throw new SchoolServiceError(400, "IP 内容无效");
    const repository = createIpLibraryRepository();
    const items: IpItemInput[] = [];
    for (const [index, input] of inputs.entries()) items.push(await normalizeItem(repository, id, childId, input, index));
    const updated = await translateConflict("generic", () => repository.replaceIpSubIpItems(id, childId, items));
    if (!updated) throw new SchoolServiceError(404, "子 IP 不存在");
    return updated;
}

export async function listAdminIpFiles(actorId: string, ipId: string, subIpId?: string) {
    await requireAnyIpDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    if (subIpId) await requireSubIp(id, required(subIpId, "子 IP 标识无效"));
    return createIpLibraryRepository().listIpContentFiles(id, subIpId);
}

export async function uploadAdminIpFile(actorId: string, ipId: string, subIpId: string, kindValue: unknown, file: File) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const childId = required(subIpId, "子 IP 标识无效");
    await requireSubIp(id, childId);
    if (!(file instanceof File)) throw new SchoolServiceError(400, "请选择要上传的文件");
    const kind = enumValue(kindValue, IP_ASSET_KINDS, "IP 内容类型无效");
    const repository = createIpLibraryRepository();
    const stored = await writeIpContentFile({ ipId: id, subIpId: childId, fileId: randomUUID(), kind, originalName: file.name, bytes: Buffer.from(await file.arrayBuffer()), uploadedByUserId: actorId });
    try {
        return await repository.createIpContentFile(stored);
    } catch (error) {
        await deleteStoredIpContentFile(stored).catch(() => undefined);
        throw error;
    }
}

export async function readAdminIpFile(actorId: string, request: Request, ipId: string, fileId: string) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const file = await createIpLibraryRepository().getIpContentFile(id, required(fileId, "文件标识无效"));
    if (!file) throw new SchoolServiceError(404, "IP 内容文件不存在");
    const response = await readIpContentFile(request, file);
    if (!response) throw new SchoolServiceError(404, "IP 内容文件不存在");
    return response;
}

export async function deleteAdminIpFile(actorId: string, ipId: string, fileId: string) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const file = await createIpLibraryRepository().claimIpContentFileDeletion(id, required(fileId, "文件标识无效"));
    if (!file) throw new SchoolServiceError(409, "IP 内容文件已被内容或封面引用");
    await deleteStoredIpContentFile(file);
    const deleted = await createIpLibraryRepository().finalizeIpContentFileDeletion(id, file.id);
    if (!deleted) throw new SchoolServiceError(409, "IP 内容文件正在删除，请稍后重试");
    return { deleted: true };
}

export async function listAdminIpGrants(actorId: string, ipId: string, input: PageInput & { subIpId?: string; schoolId?: string; status?: string } = {}) {
    await requireEducationDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    await getExistingPackage(id);
    const page = await createIpLibraryRepository().listSchoolGrants({ ...input, ipId: id });
    const schools = new Map((await createSchoolDomainRepository().listSchoolsByIds([...new Set(page.items.map((item) => item.schoolId))])).map((school) => [school.id, school]));
    const detail = await createIpLibraryRepository().getIpDetail(id);
    const subIps = new Map(detail?.subIps.map((item) => [item.id, item]) || []);
    return {
        ...page,
        items: page.items.map((item) => ({
            ...item,
            school: schools.has(item.schoolId) ? { id: item.schoolId, name: schools.get(item.schoolId)!.name } : undefined,
            subIp: subIps.has(item.subIpId) ? { id: item.subIpId, title: subIps.get(item.subIpId)!.title } : undefined,
        })),
    };
}

export async function createAdminIpGrant(actorId: string, ipId: string, input: AdminIpGrantInput) {
    const grants = await createAdminIpGrants(actorId, ipId, { subIpIds: [input.subIpId], schoolIds: [input.schoolId], mode: input.mode, startsAt: input.startsAt, endsAt: input.endsAt, note: input.note });
    return grants[0];
}

export async function createAdminIpGrants(actorId: string, ipId: string, input: AdminIpGrantBatchInput) {
    await requireEducationDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const packageRecord = await getExistingPackage(id);
    if (packageRecord.visibility !== "school") throw new SchoolServiceError(409, "只有本校 IP 可以授权给学校");
    const subIpIds = requiredUniqueIds(input.subIpIds, "请选择至少一个子 IP");
    await Promise.all(subIpIds.map((subIpId) => requireSubIp(id, subIpId)));
    const schoolIds = requiredUniqueIds(input.schoolIds, "请选择至少一所学校");
    const mode = enumValue(input.mode, IP_AUTHORIZATION_MODES, "IP 授权模式无效");
    if (mode === "exclusive" && schoolIds.length > 1) throw new SchoolServiceError(400, "独家授权一次只能选择一所学校");
    const startsAt = isoTime(input.startsAt, "授权开始时间无效");
    const endsAt = input.endsAt ? isoTime(input.endsAt, "授权结束时间无效") : undefined;
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new SchoolServiceError(400, "IP 授权时间窗无效");
    const repository = createIpLibraryRepository();
    const records = subIpIds.flatMap((subIpId) => schoolIds.map((schoolId) => ({ id: randomUUID(), ipId: id, subIpId, schoolId, mode, status: "active" as const, startsAt, endsAt, note: optional(input.note), createdByUserId: actorId })));
    return translateConflict("grant", () => repository.createSchoolGrants(records), { ipId: id });
}

export async function updateAdminIpGrant(actorId: string, ipId: string, grantId: string, input: AdminIpGrantPatchInput) {
    await requireEducationDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    await getExistingPackage(id);
    const normalizedGrantId = required(grantId, "授权标识无效");
    const repository = createIpLibraryRepository();
    let endsAt: string | null | undefined;
    if (input.endsAt !== undefined) {
        endsAt = optional(input.endsAt) ? isoTime(input.endsAt, "授权结束时间无效") : null;
        if (endsAt) {
            const existing = await repository.listSchoolGrants({ ipId: id, grantId: normalizedGrantId, pageSize: 1 });
            if (!existing.items[0]) throw new SchoolServiceError(404, "学校授权不存在");
            if (Date.parse(endsAt) <= Date.parse(existing.items[0].startsAt)) throw new SchoolServiceError(400, "IP 授权时间窗无效");
        }
    }
    const updated = await translateConflict("grant", () =>
        repository.updateSchoolGrant(id, normalizedGrantId, {
            ...(input.status !== undefined ? { status: enumValue(input.status, ["active", "suspended", "revoked", "expired"] as const, "授权状态无效") } : {}),
            ...(endsAt !== undefined ? { endsAt } : {}),
            ...(input.note !== undefined ? { note: optional(input.note) } : {}),
            updatedAt: new Date().toISOString(),
        }),
    );
    if (!updated) throw new SchoolServiceError(404, "学校授权不存在");
    return updated;
}

export async function listAdminIpUsage(actorId: string, input: PageInput & { ipId?: string; subIpId?: string; schoolId?: string; userId?: string; downloadType?: string; result?: string } = {}) {
    await requireAnyIpDuty(actorId);
    const page = await createIpLibraryRepository().listIpDownloads(input);
    const details = await Promise.all([...new Set(page.items.map((item) => item.ipId))].map((ipId) => createIpLibraryRepository().getIpDetail(ipId)));
    const ips = new Map(details.filter((item): item is NonNullable<typeof item> => Boolean(item)).map((item) => [item.id, item]));
    const users = new Map((await getPublicUsersByIds([...new Set(page.items.map((item) => item.userId))])).map((user) => [user.id, user]));
    const schools = new Map((await createSchoolDomainRepository().listSchoolsByIds([...new Set(page.items.map((item) => item.schoolId).filter((value): value is string => Boolean(value)))])).map((school) => [school.id, school]));
    return {
        ...page,
        items: page.items.map((item) => {
            const ip = ips.get(item.ipId);
            const subIp = item.subIpId ? ip?.subIps.find((candidate) => candidate.id === item.subIpId) : undefined;
            const content = item.itemId ? subIp?.items.find((candidate) => candidate.id === item.itemId) : undefined;
            return {
                ...item,
                ip: ip ? { id: ip.id, title: ip.title } : undefined,
                subIp: subIp ? { id: subIp.id, title: subIp.title } : undefined,
                item: content ? { id: content.id, title: content.title } : undefined,
                user: users.get(item.userId),
                school: item.schoolId ? schools.get(item.schoolId) : undefined,
                userId: undefined,
            };
        }),
    };
}

export async function retryIpLibraryFileCleanup() {
    const repository = createIpLibraryRepository();
    const records = await repository.listIpFileCleanupQueue();
    for (const record of records) {
        try {
            await deleteStoredIpContentFile(record);
            await repository.removeIpFileCleanupQueueRecord(record.id);
        } catch {
            // Keep the queue record for the next administrative operation.
        }
    }
}

async function normalizeItem(repository: ReturnType<typeof createIpLibraryRepository>, ipId: string, subIpId: string, input: AdminIpItemInput, index: number): Promise<IpItemInput> {
    const kind = enumValue(input.kind, IP_ASSET_KINDS, "IP 内容类型无效");
    const category = normalizeIpItemCategory(kind, input.category);
    if (!category) throw new SchoolServiceError(400, "IP 内容分类无效");
    const fileId = required(input.fileId, "请选择 IP 内容文件");
    await requireReadyFile(repository, ipId, subIpId, fileId, kind);
    return { id: randomUUID(), kind, category, title: required(input.title, "请填写内容项标题"), summary: optional(input.summary), fileId, sortOrder: validSortOrder(input.sortOrder) ?? index };
}
async function requireReadyFile(repository: ReturnType<typeof createIpLibraryRepository>, ipId: string, subIpId: string, fileId: string, kind: IpAssetKind) {
    const file = await repository.getIpContentFile(ipId, fileId, subIpId);
    if (!file || file.kind !== kind) throw new SchoolServiceError(400, "IP 内容文件不存在、跨子 IP 或类型不匹配");
    if (file.status !== "ready") throw new SchoolServiceError(409, "IP 内容文件尚未处理完成");
    return file;
}
async function requireReadyPackageCover(repository: ReturnType<typeof createIpLibraryRepository>, ipId: string, fileId: string) {
    const file = await repository.getIpContentFile(ipId, fileId);
    if (!file || file.kind !== "image") throw new SchoolServiceError(400, "IP 封面文件不存在或不是图片");
    if (file.status !== "ready") throw new SchoolServiceError(409, "IP 封面文件尚未处理完成");
    return file;
}
async function requireSubIp(ipId: string, subIpId: string) {
    const subIp = await createIpLibraryRepository().getIpSubIp(ipId, subIpId);
    if (!subIp) throw new SchoolServiceError(404, "子 IP 不存在");
    return subIp;
}
async function getExistingPackage(ipId: string) {
    const record = await createIpLibraryRepository().getIpPackage(ipId);
    if (!record) throw new SchoolServiceError(404, "IP 不存在");
    return record;
}
async function requireActor(actorId: string) {
    const actor = (await getPublicUsersByIds([actorId]))[0];
    if (!actor || actor.status !== "active" || actor.role !== "admin") throw new SchoolServiceError(403, "当前管理员不可用");
    return actor;
}
async function requireAnyIpDuty(actorId: string) {
    const actor = await requireActor(actorId);
    if (!hasAdminPermission(actor, "content.manage") && !hasAdminPermission(actor, "education.manage")) throw new SchoolServiceError(403, "当前管理员没有 IP 库职责权限");
}
async function requireContentDuty(actorId: string) {
    if (!hasAdminPermission(await requireActor(actorId), "content.manage")) throw new SchoolServiceError(403, "当前管理员没有内容运营职责权限");
}
async function requireEducationDuty(actorId: string) {
    if (!hasAdminPermission(await requireActor(actorId), "education.manage")) throw new SchoolServiceError(403, "当前管理员没有教育运营职责权限");
}
function required(value: unknown, message: string) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new SchoolServiceError(400, message);
    return text;
}
function limitedRequired(value: unknown, message: string, maxLength: number, label: string) {
    const text = required(value, message);
    assertMaxLength(text, maxLength, label);
    return text;
}
function optional(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
function limitedOptional(value: unknown, maxLength: number, label: string) {
    const text = optional(value);
    assertMaxLength(text, maxLength, label);
    return text;
}
function assertMaxLength(value: string, maxLength: number, label: string) {
    if (Array.from(value).length > maxLength) throw new SchoolServiceError(400, `${label}不能超过 ${maxLength} 个字`);
}
function normalizeTags(value: unknown) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new SchoolServiceError(400, "IP 标签无效");
    return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}
function requiredUniqueIds(value: unknown, message: string) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new SchoolServiceError(400, message);
    const ids = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
    if (!ids.length) throw new SchoolServiceError(400, message);
    return ids;
}
function slugValue(value: unknown) {
    const slug = required(value, "请填写 IP 标识").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-_]{1,79}$/.test(slug)) throw new SchoolServiceError(400, "IP 标识仅支持小写字母、数字、中划线和下划线");
    return slug;
}
function generatedSlug(title: string) {
    const slug = title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70);
    return slug.length >= 2 ? slug : `ip-${randomUUID().slice(0, 8)}`;
}
function enumValue<T extends string>(value: unknown, values: readonly T[], message: string): T {
    if (typeof value === "string" && values.includes(value as T)) return value as T;
    throw new SchoolServiceError(400, message);
}
function isoTime(value: unknown, message: string) {
    const text = required(value, message);
    const time = Date.parse(text);
    if (!Number.isFinite(time)) throw new SchoolServiceError(400, message);
    return new Date(time).toISOString();
}
function validSortOrder(value: unknown) {
    return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}
async function translateConflict<T>(kind: "slug" | "grant" | "generic", operation: () => Promise<T>, metadata?: Record<string, string>) {
    try {
        return await operation();
    } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") throw new SchoolServiceError(409, kind === "slug" ? "IP 标识已存在，请更换 slug" : kind === "grant" ? "授权创建失败：当前学校或授权模式存在重叠时间窗" : "数据冲突，请刷新后重试", metadata);
        throw error;
    }
}
