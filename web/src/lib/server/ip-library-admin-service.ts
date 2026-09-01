import { randomUUID } from "node:crypto";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { getPublicUsersByIds } from "@/lib/auth/store";
import { IP_ASSET_KINDS, IP_AUTHORIZATION_MODES, IP_STATUSES, IP_VISIBILITIES, normalizeIpItemCategory, type IpAssetKind, type IpAuthorizationMode, type IpItemCategory, type IpStatus, type IpVisibility } from "@/lib/ip-library-domain";
import type { IpDraftItemInput, IpPackagePatch, IpSchoolGrantStatus, PageInput } from "@/lib/server/database/repository-types";
import { deleteStoredIpContentFile, readIpContentFile, writeIpContentFile } from "@/lib/server/ip-library-file-storage";
import { SchoolServiceError } from "@/lib/server/school-access-service";
import { createIpLibraryRepository } from "./ip-library-access-service";
import { createSchoolDomainRepository } from "./school-domain-repository";

export type AdminIpCreateInput = { title: string; slug: string; summary?: string; coverAssetId?: string; visibility: IpVisibility; authorizationMode?: IpAuthorizationMode };
export type AdminIpPatchInput = Partial<AdminIpCreateInput> & { status?: IpStatus };
export type AdminIpDraftItemInput = { kind: IpAssetKind; category: IpItemCategory; title: string; summary?: string; fileId: string; sortOrder?: number };
export type AdminIpVersionInput = { title: string; summary?: string; coverFileId?: string; tags?: string[]; sourceNote?: string; changeNote?: string; items: AdminIpDraftItemInput[] };
export type AdminIpCreateVersionInput = Partial<AdminIpVersionInput> & { sourceVersionId?: string };
export type AdminIpGrantInput = { schoolId: string; mode: IpAuthorizationMode; startsAt: string; endsAt?: string; note?: string };
export type AdminIpGrantPatchInput = { status?: IpSchoolGrantStatus; endsAt?: string; note?: string };

export async function listAdminIps(actorId: string, input: PageInput & { keyword?: string; status?: string; visibility?: string }) {
    await requireAnyIpDuty(actorId);
    return createIpLibraryRepository().listIpPackages(input);
}

export async function getAdminIp(actorId: string, ipId: string) {
    await requireAnyIpDuty(actorId);
    const record = await createIpLibraryRepository().getIpPackage(required(ipId, "IP 标识无效"));
    if (!record) throw new SchoolServiceError(404, "IP 不存在");
    return record;
}

export async function createAdminIp(actorId: string, input: AdminIpCreateInput) {
    await requireContentDuty(actorId);
    const visibility = enumValue(input.visibility, IP_VISIBILITIES, "IP 可见范围无效");
    const authorizationMode = visibility === "public" ? "multi_school" : enumValue(input.authorizationMode, IP_AUTHORIZATION_MODES, "IP 授权模式无效");
    return translateConflict(() =>
        createIpLibraryRepository().createIpPackage({
            id: randomUUID(),
            title: required(input.title, "请填写 IP 名称"),
            slug: slugValue(input.slug),
            summary: optional(input.summary),
            coverAssetId: optional(input.coverAssetId) || undefined,
            visibility,
            authorizationMode,
            status: "draft",
            createdByUserId: actorId,
        }),
    );
}

export async function updateAdminIp(actorId: string, ipId: string, input: AdminIpPatchInput) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const current = await getExistingPackage(id);
    const patch: IpPackagePatch = {};
    if (input.title !== undefined) patch.title = required(input.title, "请填写 IP 名称");
    if (input.slug !== undefined) patch.slug = slugValue(input.slug);
    if (input.summary !== undefined) patch.summary = optional(input.summary);
    if (input.coverAssetId !== undefined) patch.coverAssetId = optional(input.coverAssetId) || null;
    if (input.visibility !== undefined) patch.visibility = enumValue(input.visibility, IP_VISIBILITIES, "IP 可见范围无效");
    if (input.authorizationMode !== undefined) patch.authorizationMode = enumValue(input.authorizationMode, IP_AUTHORIZATION_MODES, "IP 授权模式无效");
    if (input.status !== undefined) {
        const status = enumValue(input.status, IP_STATUSES, "IP 状态无效");
        if (status === "draft" || (status === "published" && !current.currentVersionId)) throw new SchoolServiceError(409, "IP 状态不能这样变更");
        patch.status = status;
    }
    if ((patch.visibility || current.visibility) === "public") patch.authorizationMode = "multi_school";
    const updated = await translateConflict(() => createIpLibraryRepository().updateIpPackage(id, patch));
    if (!updated) throw new SchoolServiceError(409, "已有学校授权时不能修改可见范围或授权模式");
    return updated;
}

export async function listAdminIpVersions(actorId: string, ipId: string, input: PageInput = {}) {
    await requireAnyIpDuty(actorId);
    await getExistingPackage(required(ipId, "IP 标识无效"));
    return createIpLibraryRepository().listIpVersions(ipId, input);
}

export async function listAdminIpFiles(actorId: string, ipId: string) {
    await requireAnyIpDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    await getExistingPackage(id);
    return createIpLibraryRepository().listIpContentFiles(id);
}

export async function uploadAdminIpFile(actorId: string, ipId: string, kindValue: unknown, file: File) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const packageRecord = await getExistingPackage(id);
    if (packageRecord.status === "disabled") throw new SchoolServiceError(409, "已停用 IP 不能上传文件");
    if (!(file instanceof File)) throw new SchoolServiceError(400, "请选择要上传的文件");
    const kind = enumValue(kindValue, IP_ASSET_KINDS, "IP 内容类型无效");
    const repository = createIpLibraryRepository();
    const stored = await writeIpContentFile({ ipId: id, fileId: randomUUID(), kind, originalName: file.name, bytes: Buffer.from(await file.arrayBuffer()), uploadedByUserId: actorId });
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
    const normalizedFileId = required(fileId, "文件标识无效");
    const repository = createIpLibraryRepository();
    const file = await repository.getIpContentFile(id, normalizedFileId);
    if (!file) throw new SchoolServiceError(404, "IP 内容文件不存在");
    const deleted = await translateConflict(() => repository.deleteIpContentFile(id, normalizedFileId));
    if (!deleted) throw new SchoolServiceError(404, "IP 内容文件不存在");
    await deleteStoredIpContentFile(file);
}

export async function createAdminIpVersion(actorId: string, ipId: string, input: AdminIpCreateVersionInput) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const packageRecord = await getExistingPackage(id);
    if (packageRecord.status === "disabled") throw new SchoolServiceError(409, "已停用 IP 不能创建新版本");
    const repository = createIpLibraryRepository();
    const sourceVersionId = optional(input.sourceVersionId);
    const sourceVersion = sourceVersionId ? await repository.getIpVersion(id, sourceVersionId) : null;
    if (sourceVersionId && !sourceVersion) throw new SchoolServiceError(404, "源 IP 版本不存在");
    const coverFileId = input.coverFileId !== undefined ? optional(input.coverFileId) || undefined : sourceVersion?.coverFileId;
    if (coverFileId) await requireReadyFile(repository, id, coverFileId, "image");
    const draftItems = input.items ?? sourceVersion?.items ?? [];
    if (!Array.isArray(draftItems)) throw new SchoolServiceError(400, "IP 版本内容无效");
    const items: IpDraftItemInput[] = [];
    for (const [index, item] of draftItems.entries()) items.push(await normalizeDraftItem(repository, id, item, index));
    return translateConflict(() =>
        repository.createIpDraftVersion(id, {
            id: randomUUID(),
            title: required(input.title ?? sourceVersion?.title, "请填写版本名称"),
            summary: input.summary !== undefined ? optional(input.summary) : sourceVersion?.summary || "",
            coverFileId,
            tags: input.tags !== undefined ? normalizeTags(input.tags) : sourceVersion?.tags || [],
            sourceNote: input.sourceNote !== undefined ? optional(input.sourceNote) : sourceVersion?.sourceNote || "",
            changeNote: optional(input.changeNote),
            createdByUserId: actorId,
            items,
        }),
    );
}

export async function updateAdminIpVersion(actorId: string, ipId: string, versionId: string, input: AdminIpVersionInput) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const normalizedVersionId = required(versionId, "版本标识无效");
    const repository = createIpLibraryRepository();
    const current = await repository.getIpVersion(id, normalizedVersionId);
    if (!current) throw new SchoolServiceError(404, "IP 版本不存在");
    if (current.status !== "draft") throw new SchoolServiceError(409, "已发布 IP 版本不可修改");
    if (!Array.isArray(input.items)) throw new SchoolServiceError(400, "IP 版本内容无效");
    const coverFileId = optional(input.coverFileId) || undefined;
    if (coverFileId) await requireReadyFile(repository, id, coverFileId, "image");
    const items: IpDraftItemInput[] = [];
    for (const [index, item] of input.items.entries()) items.push(await normalizeDraftItem(repository, id, item, index));
    return translateConflict(() =>
        repository.updateIpDraftVersion(id, normalizedVersionId, {
            id: normalizedVersionId,
            title: required(input.title, "请填写版本名称"),
            summary: optional(input.summary),
            coverFileId,
            tags: normalizeTags(input.tags),
            sourceNote: optional(input.sourceNote),
            changeNote: optional(input.changeNote),
            createdByUserId: actorId,
            items,
        }),
    );
}

export async function publishAdminIpVersion(actorId: string, ipId: string, versionId: string) {
    await requireContentDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const version = await createIpLibraryRepository().getIpVersion(id, required(versionId, "版本标识无效"));
    if (!version || version.status !== "draft") throw new SchoolServiceError(404, "IP 草稿版本不存在");
    if (!version.items.length) throw new SchoolServiceError(400, "IP 版本至少需要一个内容项");
    return translateConflict(() => createIpLibraryRepository().publishIpVersion(id, version.id));
}

export async function listAdminIpGrants(actorId: string, ipId: string, input: PageInput & { schoolId?: string; status?: string } = {}) {
    await requireEducationDuty(actorId);
    await getExistingPackage(required(ipId, "IP 标识无效"));
    const page = await createIpLibraryRepository().listSchoolGrants({ ...input, ipId });
    const schools = new Map((await createSchoolDomainRepository().listSchoolsByIds([...new Set(page.items.map((item) => item.schoolId))])).map((school) => [school.id, school]));
    return { ...page, items: page.items.map((item) => ({ ...item, school: schools.has(item.schoolId) ? { id: item.schoolId, name: schools.get(item.schoolId)!.name } : undefined })) };
}

export async function createAdminIpGrant(actorId: string, ipId: string, input: AdminIpGrantInput) {
    await requireEducationDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    const packageRecord = await getExistingPackage(id);
    if (packageRecord.status !== "published" || packageRecord.visibility !== "school" || !packageRecord.currentVersionId) throw new SchoolServiceError(409, "只有已发布的本校 IP 可以授权");
    const mode = enumValue(input.mode, IP_AUTHORIZATION_MODES, "IP 授权模式无效");
    const startsAt = isoTime(input.startsAt, "授权开始时间无效");
    const endsAt = input.endsAt ? isoTime(input.endsAt, "授权结束时间无效") : undefined;
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new SchoolServiceError(400, "IP 授权时间窗无效");
    return translateConflict(() =>
        createIpLibraryRepository().createSchoolGrant({
            id: randomUUID(),
            ipId: id,
            schoolId: required(input.schoolId, "请选择学校"),
            mode,
            status: "active",
            startsAt,
            endsAt,
            note: optional(input.note),
            createdByUserId: actorId,
        }),
    );
}

export async function updateAdminIpGrant(actorId: string, ipId: string, grantId: string, input: AdminIpGrantPatchInput) {
    await requireEducationDuty(actorId);
    const id = required(ipId, "IP 标识无效");
    await getExistingPackage(id);
    const patch = {
        ...(input.status !== undefined ? { status: enumValue(input.status, ["active", "suspended", "revoked", "expired"] as const, "授权状态无效") } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? isoTime(input.endsAt, "授权结束时间无效") : undefined } : {}),
        ...(input.note !== undefined ? { note: optional(input.note) } : {}),
        updatedAt: new Date().toISOString(),
    };
    const updated = await translateConflict(() => createIpLibraryRepository().updateSchoolGrant(id, required(grantId, "授权标识无效"), patch));
    if (!updated) throw new SchoolServiceError(404, "学校授权不存在");
    return updated;
}

export async function listAdminIpUsage(actorId: string, input: PageInput & { ipId?: string; versionId?: string; schoolId?: string; userId?: string; downloadType?: string; result?: string } = {}) {
    await requireAnyIpDuty(actorId);
    const page = await createIpLibraryRepository().listIpDownloads(input);
    const users = new Map((await getPublicUsersByIds([...new Set(page.items.map((item) => item.userId))])).map((user) => [user.id, user]));
    const schools = new Map((await createSchoolDomainRepository().listSchoolsByIds([...new Set(page.items.map((item) => item.schoolId).filter((schoolId): schoolId is string => Boolean(schoolId)))])).map((school) => [school.id, school]));
    return {
        ...page,
        items: page.items.map((item) => {
            const user = users.get(item.userId);
            const school = item.schoolId ? schools.get(item.schoolId) : undefined;
            return {
                ...item,
                user: user ? { accountId: user.accountId, username: user.username, displayName: user.displayName, email: user.email } : undefined,
                school: school ? { id: school.id, name: school.name } : undefined,
                userId: undefined,
            };
        }),
    };
}

async function normalizeDraftItem(repository: ReturnType<typeof createIpLibraryRepository>, ipId: string, input: AdminIpDraftItemInput, index: number): Promise<IpDraftItemInput> {
    const kind = enumValue(input.kind, IP_ASSET_KINDS, "IP 内容类型无效");
    const category = normalizeIpItemCategory(kind, input.category);
    if (!category) throw new SchoolServiceError(400, "IP 内容分类无效");
    const fileId = required(input.fileId, "请选择 IP 内容文件");
    await requireReadyFile(repository, ipId, fileId, kind);
    return {
        id: randomUUID(),
        kind,
        category,
        title: required(input.title, "请填写内容项标题"),
        summary: optional(input.summary),
        fileId,
        sortOrder: Number.isSafeInteger(input.sortOrder) && Number(input.sortOrder) >= 0 ? Number(input.sortOrder) : index,
    };
}

async function requireReadyFile(repository: ReturnType<typeof createIpLibraryRepository>, ipId: string, fileId: string, kind: IpAssetKind) {
    const file = await repository.getIpContentFile(ipId, fileId);
    if (!file || file.kind !== kind) throw new SchoolServiceError(400, "IP 内容文件不存在、跨 IP 或类型不匹配");
    if (file.status !== "ready") throw new SchoolServiceError(409, "IP 内容文件尚未处理完成");
    return file;
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

async function requireContentDuty(actorId: string) {
    const actor = await requireActor(actorId);
    if (!hasAdminPermission(actor, "content.manage")) throw new SchoolServiceError(403, "当前管理员没有内容运营职责权限");
    return actor;
}
async function requireEducationDuty(actorId: string) {
    const actor = await requireActor(actorId);
    if (!hasAdminPermission(actor, "education.manage")) throw new SchoolServiceError(403, "当前管理员没有产教运营职责权限");
    return actor;
}
async function requireAnyIpDuty(actorId: string) {
    const actor = await requireActor(actorId);
    if (!hasAdminPermission(actor, "content.manage") && !hasAdminPermission(actor, "education.manage")) throw new SchoolServiceError(403, "当前管理员没有 IP 库职责权限");
    return actor;
}

async function translateConflict<T>(operation: () => Promise<T>) {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof SchoolServiceError) throw error;
        const value = error as { code?: string; message?: string };
        if (value.code === "23503" || value.code === "23505" || value.code === "23514" || value.code === "P0001" || /冲突|已存在|不可授权|时间窗|已被引用/.test(value.message || "")) throw new SchoolServiceError(409, value.message || "IP 数据冲突");
        throw error;
    }
}

function required(value: unknown, message: string) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new SchoolServiceError(400, message);
    return text;
}
function optional(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
function normalizeTags(value: unknown) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new SchoolServiceError(400, "IP 标签无效");
    return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}
function slugValue(value: unknown) {
    const slug = required(value, "请填写 IP slug").toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new SchoolServiceError(400, "IP slug 只能使用小写字母、数字和连字符");
    return slug;
}
function enumValue<T extends string>(value: unknown, values: readonly T[], message: string): T {
    if (typeof value !== "string" || !values.includes(value as T)) throw new SchoolServiceError(400, message);
    return value as T;
}
function isoTime(value: unknown, message: string) {
    const text = required(value, message);
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(text) || !Number.isFinite(Date.parse(text))) throw new SchoolServiceError(400, message);
    return new Date(text).toISOString();
}
