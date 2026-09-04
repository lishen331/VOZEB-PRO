import { AUTH_DATA_FILE } from "@/lib/auth/store-foundation";
import { readJsonDataFile, withJsonDataFileLocks, writeJsonDataFile } from "@/lib/server/data-adapter";
import type {
    IpDetailRecord,
    IpContentFileCreateInput,
    IpContentFilePatch,
    IpContentFileRecord,
    IpDownloadCreateInput,
    IpDownloadRecord,
    IpDraftVersionInput,
    IpPackageCreateInput,
    IpPackagePatch,
    IpPackageRecord,
    IpSchoolGrantCreateInput,
    IpSchoolGrantRecord,
    IpSchoolGrantUpdateInput,
    IpSummaryRecord,
    IpUsageCreateInput,
    IpUsageRecord,
    IpVersionRecord,
    PageResult,
} from "@/lib/server/database/repository-types";
import type { IpAssetKind, IpItemCategory } from "@/lib/ip-library-domain";
import { SCHOOL_DOMAIN_DATA_FILE } from "./school-domain-file-repository";
import type { AdminIpListInput, IpGrantConflictInput, IpGrantListInput, IpUsageListInput, VisibleIpDetailInput, VisibleIpListInput } from "./database/ip-library-repository";

export const IP_LIBRARY_DATA_FILE = "ip-library.json";

type IpLibraryFile = {
    version: 2;
    packages: IpPackageRecord[];
    versions: IpVersionRecord[];
    files: IpContentFileRecord[];
    grants: IpSchoolGrantRecord[];
    usages: IpUsageRecord[];
    downloads: IpDownloadRecord[];
};

const EMPTY_FILE: IpLibraryFile = { version: 2, packages: [], versions: [], files: [], grants: [], usages: [], downloads: [] };

type AuthSnapshot = { users?: Array<{ id?: string; status?: string }> };
type SchoolSnapshot = { schools?: Array<{ id?: string; status?: string }>; memberships?: Array<{ userId?: string; schoolId?: string; status?: string }> };

export function createFileIpLibraryRepository() {
    return new FileIpLibraryRepository();
}

export class FileIpLibraryRepository {
    async getIpPackage(ipId: string): Promise<IpPackageRecord | null> {
        return detached((await readFile()).packages.find((item) => item.id === ipId));
    }

    async getIpPackageBySlug(slug: string, excludeIpId?: string): Promise<IpPackageRecord | null> {
        const normalized = slug.toLowerCase();
        return detached((await readFile()).packages.find((item) => item.id !== excludeIpId && item.slug.toLowerCase() === normalized));
    }

    createIpPackage(input: IpPackageCreateInput): Promise<IpPackageRecord> {
        return mutate(async (state) => {
            if (state.packages.some((item) => item.id === input.id || item.slug.toLowerCase() === input.slug.toLowerCase())) throw new Error("IP 标识或 slug 已存在");
            const now = new Date().toISOString();
            const record: IpPackageRecord = { ...structuredClone(input), createdAt: now, updatedAt: now };
            state.packages.push(record);
            return structuredClone(record);
        });
    }

    async listIpPackages(input: AdminIpListInput = {}): Promise<PageResult<IpSummaryRecord>> {
        const page = positiveInteger(input.page, 1);
        const pageSize = Math.min(100, positiveInteger(input.pageSize, 20));
        const keyword = input.keyword?.trim().toLowerCase();
        const state = await readFile();
        const records = state.packages
            .filter((item) => (!keyword || `${item.title}\n${item.summary}\n${item.slug}`.toLowerCase().includes(keyword)) && (!input.status || item.status === input.status) && (!input.visibility || item.visibility === input.visibility))
            .map((item) => {
                const version = state.versions.find((candidate) => candidate.id === item.currentVersionId);
                return { ...structuredClone(item), versionNumber: version?.versionNumber || 0, itemCount: version?.items.length || 0 };
            })
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
        return { items: records.slice((page - 1) * pageSize, page * pageSize), total: records.length, page, pageSize };
    }

    updateIpPackage(ipId: string, patch: IpPackagePatch): Promise<IpPackageRecord | null> {
        return mutate(async (state) => {
            const record = state.packages.find((item) => item.id === ipId);
            if (!record) return null;
            if (patch.slug && state.packages.some((item) => item.id !== ipId && item.slug.toLowerCase() === patch.slug!.toLowerCase())) throw new Error("IP slug 已存在");
            if (state.grants.some((grant) => grant.ipId === ipId) && ((patch.visibility && patch.visibility !== record.visibility) || (patch.authorizationMode && patch.authorizationMode !== record.authorizationMode))) return null;
            const { coverAssetId, ...values } = structuredClone(patch);
            Object.assign(record, values, { updatedAt: new Date().toISOString() });
            if (coverAssetId === null) record.coverAssetId = undefined;
            else if (coverAssetId !== undefined) record.coverAssetId = coverAssetId;
            return structuredClone(record);
        });
    }

    createIpContentFile(input: IpContentFileCreateInput): Promise<IpContentFileRecord> {
        return mutate(async (state) => {
            if (!state.packages.some((item) => item.id === input.ipId)) throw new Error("IP 不存在");
            if (state.files.some((item) => item.id === input.id)) throw new Error("IP 内容文件已存在");
            const now = new Date().toISOString();
            const record: IpContentFileRecord = { ...structuredClone(input), createdAt: now, updatedAt: now };
            state.files.push(record);
            return structuredClone(record);
        });
    }

    async getIpContentFile(ipId: string, fileId: string): Promise<IpContentFileRecord | null> {
        return detached((await readFile()).files.find((item) => item.ipId === ipId && item.id === fileId));
    }

    async listIpContentFiles(ipId: string): Promise<IpContentFileRecord[]> {
        return structuredClone((await readFile()).files.filter((item) => item.ipId === ipId).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)));
    }

    updateIpContentFile(ipId: string, fileId: string, patch: IpContentFilePatch): Promise<IpContentFileRecord | null> {
        return mutate(async (state) => {
            const record = state.files.find((item) => item.ipId === ipId && item.id === fileId);
            if (!record) return null;
            if (isFilePublished(state, fileId)) throw new Error("已发布 IP 内容文件不可修改");
            Object.assign(record, structuredClone(patch), { updatedAt: new Date().toISOString() });
            return structuredClone(record);
        });
    }

    deleteIpContentFile(ipId: string, fileId: string): Promise<boolean> {
        return mutate(async (state) => {
            const index = state.files.findIndex((item) => item.ipId === ipId && item.id === fileId);
            if (index < 0) return false;
            if (
                state.versions.some((version) => version.coverFileId === fileId || version.items.some((item) => item.fileId === fileId)) ||
                state.downloads.some((download) => download.ipId === ipId && download.itemId && state.versions.some((version) => version.id === download.versionId && version.items.some((item) => item.id === download.itemId && item.fileId === fileId)))
            ) {
                throw new Error("IP 内容文件已被引用");
            }
            state.files.splice(index, 1);
            return true;
        });
    }

    canDeleteIpContentFile(ipId: string, fileId: string): Promise<boolean> {
        return readFile().then((state) => {
            const file = state.files.find((item) => item.ipId === ipId && item.id === fileId);
            if (!file) return false;
            return !(
                state.versions.some((version) => version.coverFileId === fileId || version.items.some((item) => item.fileId === fileId)) ||
                state.downloads.some((download) => download.ipId === ipId && download.itemId && state.versions.some((version) => version.id === download.versionId && version.items.some((item) => item.id === download.itemId && item.fileId === fileId)))
            );
        });
    }

    createIpDraftVersion(ipId: string, input: IpDraftVersionInput): Promise<IpVersionRecord> {
        return mutate(async (state) => {
            const packageRecord = state.packages.find((item) => item.id === ipId);
            if (!packageRecord) throw new Error("IP 不存在");
            if (state.versions.some((item) => item.id === input.id)) throw new Error("IP 版本已存在");
            const itemIds = input.items.map((item) => item.id);
            if (new Set(itemIds).size !== itemIds.length || state.versions.some((item) => item.items.some((existing) => itemIds.includes(existing.id)))) throw new Error("IP 内容项已存在");
            const fileIds = [...input.items.map((item) => item.fileId), input.coverFileId].filter((item): item is string => Boolean(item));
            if (fileIds.length !== input.items.length + (input.coverFileId ? 1 : 0) || fileIds.some((fileId) => !state.files.some((file) => file.id === fileId && file.ipId === ipId && file.status === "ready"))) {
                throw new Error("IP 内容文件不存在、未就绪或不属于当前 IP");
            }
            const createdAt = new Date().toISOString();
            const versionNumber = Math.max(0, ...state.versions.filter((item) => item.ipId === ipId).map((item) => item.versionNumber)) + 1;
            const record: IpVersionRecord = {
                id: input.id,
                ipId,
                versionNumber,
                title: input.title,
                summary: input.summary,
                coverFileId: input.coverFileId,
                tags: structuredClone(input.tags || []),
                sourceNote: input.sourceNote || "",
                changeNote: input.changeNote || "",
                status: "draft",
                manifest: {},
                createdByUserId: input.createdByUserId,
                createdAt,
                items: input.items.map((item) => ({ ...structuredClone(item), versionId: input.id, createdAt })),
            };
            state.versions.push(record);
            return structuredClone(record);
        });
    }

    updateIpDraftVersion(ipId: string, versionId: string, input: IpDraftVersionInput): Promise<IpVersionRecord> {
        return mutate(async (state) => {
            const version = state.versions.find((item) => item.id === versionId && item.ipId === ipId);
            if (!version || version.status !== "draft") throw new Error("IP 草稿版本不存在");
            const itemIds = input.items.map((item) => item.id);
            if (new Set(itemIds).size !== itemIds.length || state.versions.some((item) => item.id !== versionId && item.items.some((existing) => itemIds.includes(existing.id)))) throw new Error("IP 内容项已存在");
            const fileIds = [...input.items.map((item) => item.fileId), input.coverFileId].filter((item): item is string => Boolean(item));
            if (fileIds.some((fileId) => !state.files.some((file) => file.id === fileId && file.ipId === ipId && file.status === "ready"))) throw new Error("IP 内容文件不存在、未就绪或不属于当前 IP");
            version.title = input.title;
            version.summary = input.summary;
            version.coverFileId = input.coverFileId;
            version.tags = structuredClone(input.tags);
            version.sourceNote = input.sourceNote;
            version.changeNote = input.changeNote;
            version.items = input.items.map((item) => ({ ...structuredClone(item), versionId, createdAt: version.createdAt }));
            return structuredClone(version);
        });
    }

    publishIpVersion(ipId: string, versionId: string): Promise<IpVersionRecord> {
        return mutate(async (state) => {
            const packageRecord = state.packages.find((item) => item.id === ipId);
            const version = state.versions.find((item) => item.id === versionId && item.ipId === ipId && item.status === "draft");
            if (!packageRecord || !version) throw new Error("IP 草稿版本不存在");
            const publishedAt = new Date().toISOString();
            version.status = "published";
            version.publishedAt = publishedAt;
            version.manifest = manifestFor(version);
            packageRecord.status = "published";
            packageRecord.currentVersionId = version.id;
            packageRecord.updatedAt = publishedAt;
            return structuredClone(version);
        });
    }

    async listVisibleIps(input: VisibleIpListInput): Promise<PageResult<IpSummaryRecord>> {
        const [state, auth, school] = await Promise.all([readFile(), readJsonDataFile<AuthSnapshot>(AUTH_DATA_FILE, {}), readJsonDataFile<SchoolSnapshot>(SCHOOL_DOMAIN_DATA_FILE, {})]);
        const page = positiveInteger(input.page, 1);
        const pageSize = Math.min(100, positiveInteger(input.pageSize, 20));
        if (!activeUser(auth, input.userId) || (input.scope === "school" && (!input.schoolId || !activeMembership(school, input.userId, input.schoolId)))) return { items: [], total: 0, page, pageSize };
        const at = Date.parse(input.at || new Date().toISOString());
        const keyword = input.keyword?.trim().toLowerCase();
        const records = state.packages
            .filter((item) => item.status === "published" && item.visibility === input.scope && item.currentVersionId)
            .map((item) => ({ packageRecord: item, version: state.versions.find((version) => version.id === item.currentVersionId && version.status === "published") }))
            .filter((entry): entry is { packageRecord: IpPackageRecord; version: IpVersionRecord } => Boolean(entry.version))
            .filter(({ packageRecord, version }) => {
                if (input.scope === "school" && !activeGrant(state.grants, packageRecord.id, input.schoolId!, at)) return false;
                if (keyword && !`${packageRecord.title}\n${packageRecord.summary}`.toLowerCase().includes(keyword)) return false;
                if (input.kind || input.category) {
                    const hasMatchingItem = version.items.some((item) => (!input.kind || item.kind === input.kind) && (!input.category || item.category === input.category));
                    if (!hasMatchingItem) return false;
                }
                const tags = input.tags?.map((tag) => tag.trim().toLowerCase()).filter(Boolean) || [];
                if (tags.length && !tags.some((tag) => version.tags.some((versionTag) => versionTag.toLowerCase() === tag))) return false;
                return true;
            })
            .map(({ packageRecord, version }) => ({
                ...structuredClone(packageRecord),
                title: version.title,
                summary: version.summary,
                versionNumber: version.versionNumber,
                itemCount: version.items.length,
                coverFileId: version.coverFileId,
                tags: structuredClone(version.tags || []),
                ...(input.scope === "school" ? { grantMode: activeGrant(state.grants, packageRecord.id, input.schoolId!, at)?.mode } : {}),
            }))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
        return { items: records.slice((page - 1) * pageSize, page * pageSize), total: records.length, page, pageSize };
    }

    async getVisibleIp(input: VisibleIpDetailInput): Promise<IpDetailRecord | null> {
        const [state, auth, school] = await Promise.all([readFile(), readJsonDataFile<AuthSnapshot>(AUTH_DATA_FILE, {}), readJsonDataFile<SchoolSnapshot>(SCHOOL_DOMAIN_DATA_FILE, {})]);
        if (!activeUser(auth, input.userId)) return null;
        const packageRecord = state.packages.find((item) => item.id === input.ipId && item.status === "published");
        if (!packageRecord) return null;
        const version = state.versions.find((item) => item.id === (input.versionId || packageRecord.currentVersionId) && item.ipId === packageRecord.id && item.status === "published");
        if (!version) return null;
        if (packageRecord.visibility === "public") return { ...structuredClone(packageRecord), version: structuredClone(version) };
        if (!input.schoolId || !activeMembership(school, input.userId, input.schoolId)) return null;
        const grant = activeGrant(state.grants, packageRecord.id, input.schoolId, Date.parse(input.at || new Date().toISOString()));
        return grant ? { ...structuredClone(packageRecord), version: structuredClone(version), grantMode: grant.mode } : null;
    }

    async getIpVersion(ipId: string, versionId: string): Promise<IpVersionRecord | null> {
        return detached((await readFile()).versions.find((item) => item.ipId === ipId && item.id === versionId));
    }

    async listIpVersions(ipId: string, input: { page?: number; pageSize?: number } = {}): Promise<PageResult<IpVersionRecord>> {
        const page = positiveInteger(input.page, 1);
        const pageSize = Math.min(100, positiveInteger(input.pageSize, 20));
        const records = (await readFile()).versions.filter((item) => item.ipId === ipId).sort((left, right) => right.versionNumber - left.versionNumber || left.id.localeCompare(right.id));
        return { items: structuredClone(records.slice((page - 1) * pageSize, page * pageSize)), total: records.length, page, pageSize };
    }

    createSchoolGrant(input: IpSchoolGrantCreateInput): Promise<IpSchoolGrantRecord> {
        return mutate(async (state, school) => {
            const packageRecord = state.packages.find((item) => item.id === input.ipId);
            if (!packageRecord || packageRecord.visibility !== "school" || packageRecord.status !== "published") throw new Error("IP 不可授权");
            if (!school.schools?.some((item) => item.id === input.schoolId)) throw new Error("学校不存在");
            if (state.grants.some((item) => item.id === input.id)) throw new Error("授权记录已存在");
            assertGrantWindow(input.startsAt, input.endsAt);
            if (
                input.status === "active" &&
                state.grants.some(
                    (item) => item.ipId === input.ipId && item.status === "active" && rangesOverlap(item.startsAt, item.endsAt, input.startsAt, input.endsAt) && (item.schoolId === input.schoolId || item.mode === "exclusive" || input.mode === "exclusive"),
                )
            )
                throw new Error("IP 学校授权冲突");
            const now = new Date().toISOString();
            const record: IpSchoolGrantRecord = { ...structuredClone(input), memberAccessEnabled: input.memberAccessEnabled === true, createdAt: now, updatedAt: now };
            state.grants.push(record);
            return structuredClone(record);
        });
    }

    async findConflictingSchoolGrant(input: IpGrantConflictInput): Promise<IpSchoolGrantRecord | null> {
        const state = await readFile();
        const startsAt = Date.parse(input.startsAt);
        const endsAt = input.endsAt ? Date.parse(input.endsAt) : Number.POSITIVE_INFINITY;
        return detached(
            state.grants.find((grant) => {
                if (grant.ipId !== input.ipId || grant.status !== "active" || grant.id === input.excludeGrantId) return false;
                if (!(grant.schoolId === input.schoolId || grant.mode === "exclusive" || input.mode === "exclusive")) return false;
                const existingStart = Date.parse(grant.startsAt);
                const existingEnd = grant.endsAt ? Date.parse(grant.endsAt) : Number.POSITIVE_INFINITY;
                return existingStart < endsAt && startsAt < existingEnd;
            }),
        );
    }

    updateSchoolGrant(ipId: string, grantId: string, patch: IpSchoolGrantUpdateInput): Promise<IpSchoolGrantRecord | null> {
        return mutate(async (state) => {
            const grant = state.grants.find((item) => item.ipId === ipId && item.id === grantId);
            if (!grant) return null;
            const nextStatus = patch.status ?? grant.status;
            const nextEndsAt = patch.endsAt ?? grant.endsAt;
            assertGrantWindow(grant.startsAt, nextEndsAt);
            if (
                nextStatus === "active" &&
                state.grants.some(
                    (item) =>
                        item.id !== grant.id &&
                        item.ipId === ipId &&
                        item.status === "active" &&
                        rangesOverlap(item.startsAt, item.endsAt, grant.startsAt, nextEndsAt) &&
                        (item.schoolId === grant.schoolId || item.mode === "exclusive" || grant.mode === "exclusive"),
                )
            )
                throw new Error("IP 学校授权冲突");
            grant.status = nextStatus;
            if (patch.endsAt !== undefined) grant.endsAt = patch.endsAt;
            if (patch.note !== undefined) grant.note = patch.note;
            if (patch.memberAccessEnabled !== undefined) grant.memberAccessEnabled = patch.memberAccessEnabled;
            if (patch.memberAccessUpdatedByUserId !== undefined) grant.memberAccessUpdatedByUserId = patch.memberAccessUpdatedByUserId;
            if (patch.memberAccessUpdatedAt !== undefined) grant.memberAccessUpdatedAt = patch.memberAccessUpdatedAt;
            grant.updatedAt = patch.updatedAt;
            return structuredClone(grant);
        });
    }

    async listSchoolGrants(input: IpGrantListInput): Promise<PageResult<IpSchoolGrantRecord>> {
        const page = positiveInteger(input.page, 1);
        const pageSize = Math.min(100, positiveInteger(input.pageSize, 20));
        const records = (await readFile()).grants
            .filter((item) => (!input.ipId || item.ipId === input.ipId) && (!input.grantId || item.id === input.grantId) && (!input.schoolId || item.schoolId === input.schoolId) && (!input.status || item.status === input.status))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
        return { items: structuredClone(records.slice((page - 1) * pageSize, page * pageSize)), total: records.length, page, pageSize };
    }

    recordIpUsage(input: IpUsageCreateInput): Promise<IpUsageRecord> {
        return mutate(async (state, school, auth) => {
            if (!activeUser(auth, input.userId)) throw new Error("用户不可用");
            const existing = state.usages.find((item) => item.id === input.id);
            if (existing) {
                if (!sameUsage(existing, input)) throw new Error("IP 使用记录冲突");
                return structuredClone(existing);
            }
            const version = state.versions.find((item) => item.id === input.versionId && item.ipId === input.ipId && item.status === "published");
            if (!version || input.itemIds.some((id) => !version.items.some((item) => item.id === id))) throw new Error("IP 内容项不存在或不属于当前版本");
            if (input.schoolId && !activeMembership(school, input.userId, input.schoolId)) throw new Error("学校成员不可用");
            const record: IpUsageRecord = { ...structuredClone(input), createdAt: new Date().toISOString() };
            state.usages.push(record);
            return structuredClone(record);
        });
    }

    recordIpUsages(inputs: IpUsageCreateInput[]): Promise<IpUsageRecord[]> {
        if (!inputs.length) return Promise.resolve([]);
        return mutate(async (state, school, auth) => {
            const known = new Map(state.usages.map((item) => [item.id, item]));
            const createdAt = new Date().toISOString();
            const records: IpUsageRecord[] = [];
            const additions: IpUsageRecord[] = [];
            for (const input of inputs) {
                if (!activeUser(auth, input.userId)) throw new Error("用户不可用");
                const existing = known.get(input.id);
                if (existing) {
                    if (!sameUsage(existing, input)) throw new Error("IP 使用记录冲突");
                    records.push(existing);
                    continue;
                }
                const version = state.versions.find((item) => item.id === input.versionId && item.ipId === input.ipId && item.status === "published");
                if (!version || input.itemIds.some((id) => !version.items.some((item) => item.id === id))) throw new Error("IP 内容项不存在或不属于当前版本");
                if (input.schoolId && !activeMembership(school, input.userId, input.schoolId)) throw new Error("学校成员不可用");
                const record = { ...structuredClone(input), createdAt };
                known.set(input.id, record);
                additions.push(record);
                records.push(record);
            }
            state.usages.push(...additions);
            return structuredClone(records);
        });
    }

    async listIpUsage(input: IpUsageListInput = {}): Promise<PageResult<IpUsageRecord>> {
        const page = positiveInteger(input.page, 1);
        const pageSize = Math.min(100, positiveInteger(input.pageSize, 20));
        const records = (await readFile()).usages
            .filter(
                (item) =>
                    (!input.ipId || item.ipId === input.ipId) &&
                    (!input.versionId || item.versionId === input.versionId) &&
                    (!input.schoolId || item.schoolId === input.schoolId) &&
                    (!input.userId || item.userId === input.userId) &&
                    (!input.action || item.action === input.action),
            )
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
        return { items: structuredClone(records.slice((page - 1) * pageSize, page * pageSize)), total: records.length, page, pageSize };
    }

    recordIpDownload(input: IpDownloadCreateInput): Promise<IpDownloadRecord> {
        return mutate(async (state, school, auth) => {
            if (!activeUser(auth, input.userId)) throw new Error("用户不可用");
            if (state.downloads.some((item) => item.id === input.id)) throw new Error("IP 下载记录已存在");
            const version = state.versions.find((item) => item.id === input.versionId && item.ipId === input.ipId && item.status === "published");
            if (!version || (input.downloadType === "item" && !version.items.some((item) => item.id === input.itemId)) || (input.downloadType === "package" && input.itemId)) throw new Error("IP 下载对象无效");
            if (input.schoolId && !activeMembership(school, input.userId, input.schoolId)) throw new Error("学校成员不可用");
            const record: IpDownloadRecord = { ...structuredClone(input), createdAt: new Date().toISOString() };
            state.downloads.push(record);
            return structuredClone(record);
        });
    }

    async listIpDownloads(input: { ipId?: string; versionId?: string; schoolId?: string; userId?: string; downloadType?: string; result?: string; page?: number; pageSize?: number } = {}): Promise<PageResult<IpDownloadRecord>> {
        const page = positiveInteger(input.page, 1);
        const pageSize = Math.min(100, positiveInteger(input.pageSize, 20));
        const records = (await readFile()).downloads
            .filter(
                (item) =>
                    (!input.ipId || item.ipId === input.ipId) &&
                    (!input.versionId || item.versionId === input.versionId) &&
                    (!input.schoolId || item.schoolId === input.schoolId) &&
                    (!input.userId || item.userId === input.userId) &&
                    (!input.downloadType || item.downloadType === input.downloadType) &&
                    (!input.result || item.result === input.result),
            )
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
        return { items: structuredClone(records.slice((page - 1) * pageSize, page * pageSize)), total: records.length, page, pageSize };
    }
}

function sameUsage(record: IpUsageRecord, input: IpUsageCreateInput) {
    return (
        record.ipId === input.ipId &&
        record.versionId === input.versionId &&
        record.schoolId === input.schoolId &&
        record.userId === input.userId &&
        record.action === input.action &&
        record.targetType === input.targetType &&
        record.targetId === input.targetId &&
        record.itemIds.length === input.itemIds.length &&
        record.itemIds.every((item, index) => item === input.itemIds[index])
    );
}

async function readFile() {
    const value = await readJsonDataFile<Partial<IpLibraryFile>>(IP_LIBRARY_DATA_FILE, EMPTY_FILE);
    return normalizeFile(value);
}

async function mutate<T>(operation: (state: IpLibraryFile, school: SchoolSnapshot, auth: AuthSnapshot) => Promise<T>) {
    return withJsonDataFileLocks([AUTH_DATA_FILE, IP_LIBRARY_DATA_FILE, SCHOOL_DOMAIN_DATA_FILE], async () => {
        const [state, school, auth] = await Promise.all([readFile(), readJsonDataFile<SchoolSnapshot>(SCHOOL_DOMAIN_DATA_FILE, {}), readJsonDataFile<AuthSnapshot>(AUTH_DATA_FILE, {})]);
        const result = await operation(state, school, auth);
        await writeJsonDataFile(IP_LIBRARY_DATA_FILE, state);
        return result;
    });
}

function normalizeFile(value: Partial<IpLibraryFile>): IpLibraryFile {
    return {
        version: 2,
        packages: Array.isArray(value.packages) ? structuredClone(value.packages) : [],
        versions: Array.isArray(value.versions) ? structuredClone(value.versions) : [],
        files: Array.isArray(value.files) ? structuredClone(value.files) : [],
        grants: Array.isArray(value.grants) ? structuredClone(value.grants) : [],
        usages: Array.isArray(value.usages) ? structuredClone(value.usages) : [],
        downloads: Array.isArray(value.downloads) ? structuredClone(value.downloads) : [],
    };
}

function activeUser(auth: AuthSnapshot, userId: string) {
    return Boolean(auth.users?.some((item) => item.id === userId && item.status === "active"));
}

function activeMembership(school: SchoolSnapshot, userId: string, schoolId: string) {
    return Boolean(school.schools?.some((item) => item.id === schoolId && item.status === "active") && school.memberships?.some((item) => item.userId === userId && item.schoolId === schoolId && item.status === "active"));
}

function activeGrant(grants: IpSchoolGrantRecord[], ipId: string, schoolId: string, at: number) {
    return grants.find((item) => item.ipId === ipId && item.schoolId === schoolId && item.status === "active" && item.memberAccessEnabled && Date.parse(item.startsAt) <= at && (!item.endsAt || Date.parse(item.endsAt) > at));
}

function isFilePublished(state: IpLibraryFile, fileId: string) {
    return state.versions.some((version) => version.status === "published" && (version.coverFileId === fileId || version.items.some((item) => item.fileId === fileId)));
}

function rangesOverlap(leftStart: string, leftEnd: string | undefined, rightStart: string, rightEnd: string | undefined) {
    return Date.parse(leftStart) < (rightEnd ? Date.parse(rightEnd) : Number.POSITIVE_INFINITY) && Date.parse(rightStart) < (leftEnd ? Date.parse(leftEnd) : Number.POSITIVE_INFINITY);
}

function assertGrantWindow(startsAt: string, endsAt: string | undefined) {
    const start = Date.parse(startsAt);
    const end = endsAt ? Date.parse(endsAt) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(start) || Number.isNaN(end) || end <= start) throw new Error("IP 授权时间窗无效");
}

function manifestFor(version: IpVersionRecord) {
    return {
        id: version.id,
        versionNumber: version.versionNumber,
        title: version.title,
        summary: version.summary,
        ...(version.coverFileId ? { coverFileId: version.coverFileId } : {}),
        tags: version.tags || [],
        sourceNote: version.sourceNote || "",
        changeNote: version.changeNote || "",
        items: version.items.map((item) => ({
            id: item.id,
            kind: item.kind as IpAssetKind,
            category: item.category as IpItemCategory,
            title: item.title,
            summary: item.summary,
            ...(item.fileId ? { fileId: item.fileId } : {}),
            ...(item.textContent ? { textContent: item.textContent } : {}),
            ...(item.assetId ? { assetId: item.assetId } : {}),
            sortOrder: item.sortOrder,
        })),
    };
}

function detached<T>(value: T | undefined): T | null {
    return value === undefined ? null : structuredClone(value);
}

function positiveInteger(value: number | undefined, fallback: number) {
    return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}
