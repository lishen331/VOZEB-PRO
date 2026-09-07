import { AUTH_DATA_FILE } from "@/lib/auth/store-foundation";
import { readJsonDataFile, withJsonDataFileLocks, writeJsonDataFile } from "@/lib/server/data-adapter";
import type {
    IpContentFileCreateInput,
    IpContentFilePatch,
    IpContentFileRecord,
    IpDetailRecord,
    IpDownloadCreateInput,
    IpDownloadRecord,
    IpFileCleanupRecord,
    IpItemInput,
    IpItemRecord,
    IpPackageCreateInput,
    IpPackagePatch,
    IpPackageRecord,
    IpSchoolGrantCreateInput,
    IpSchoolGrantRecord,
    IpSchoolGrantUpdateInput,
    IpSubIpCreateInput,
    IpSubIpDetailRecord,
    IpSubIpPatch,
    IpSubIpRecord,
    IpSummaryRecord,
    IpUsageCreateInput,
    IpUsageRecord,
    PageResult,
} from "@/lib/server/database/repository-types";
import type { AdminIpListInput, IpDownloadListInput, IpGrantConflictInput, IpGrantListInput, IpUsageListInput, VisibleIpDetailInput, VisibleIpListInput } from "@/lib/server/database/ip-library-repository";
import { SCHOOL_DOMAIN_DATA_FILE } from "./school-domain-file-repository";

export const IP_LIBRARY_DATA_FILE = "ip-library.json";

type IpLibraryFile = {
    version: 3;
    packages: IpPackageRecord[];
    subIps: IpSubIpRecord[];
    items: IpItemRecord[];
    files: IpContentFileRecord[];
    grants: IpSchoolGrantRecord[];
    usages: IpUsageRecord[];
    downloads: IpDownloadRecord[];
    cleanup: IpFileCleanupRecord[];
};
type AuthSnapshot = { users?: Array<{ id?: string; status?: string }> };
type SchoolSnapshot = { schools?: Array<{ id?: string; status?: string }>; memberships?: Array<{ userId?: string; schoolId?: string; status?: string }> };
const EMPTY_FILE: IpLibraryFile = { version: 3, packages: [], subIps: [], items: [], files: [], grants: [], usages: [], downloads: [], cleanup: [] };

export function createFileIpLibraryRepository() {
    return new FileIpLibraryRepository();
}

export class FileIpLibraryRepository {
    async getIpPackage(ipId: string) {
        return detached((await readFile()).packages.find((item) => item.id === ipId));
    }
    async getIpPackageBySlug(slug: string, excludeIpId?: string) {
        return detached((await readFile()).packages.find((item) => item.id !== excludeIpId && item.slug.toLowerCase() === slug.toLowerCase()));
    }
    createIpPackage(input: IpPackageCreateInput) {
        return mutate(async (state) => {
            if (state.packages.some((item) => item.id === input.id || item.slug.toLowerCase() === input.slug.toLowerCase())) throw new Error("IP 标识或 slug 已存在");
            const now = new Date().toISOString();
            const record = { ...structuredClone(input), createdAt: now, updatedAt: now };
            state.packages.push(record);
            return structuredClone(record);
        });
    }
    async updateIpPackage(ipId: string, patch: IpPackagePatch) {
        return mutate(async (state) => {
            const record = state.packages.find((item) => item.id === ipId);
            if (!record) return null;
            if (patch.slug && state.packages.some((item) => item.id !== ipId && item.slug.toLowerCase() === patch.slug!.toLowerCase())) throw new Error("IP slug 已存在");
            Object.assign(record, patch, { updatedAt: new Date().toISOString() });
            if (patch.coverFileId === null) record.coverFileId = undefined;
            return structuredClone(record);
        });
    }
    async listIpPackages(input: AdminIpListInput = {}): Promise<PageResult<IpSummaryRecord>> {
        const state = await readFile();
        return page(
            state.packages
                .filter((item) => matchesPackage(item, input))
                .map((item) => summaryFor(state, item))
                .sort(byUpdated),
            input,
        );
    }
    async getIpDetail(ipId: string): Promise<IpDetailRecord | null> {
        const state = await readFile();
        const packageRecord = state.packages.find((item) => item.id === ipId);
        return packageRecord ? detailFor(state, packageRecord) : null;
    }
    deleteIpPackage(ipId: string) {
        return mutate(async (state) => {
            const packageIndex = state.packages.findIndex((item) => item.id === ipId);
            if (packageIndex < 0) return null;
            if (state.grants.some((item) => item.ipId === ipId)) return "has-school-grants" as const;
            const files = state.files.filter((item) => item.ipId === ipId);
            state.cleanup.push(...files.map(cleanupFor));
            state.packages.splice(packageIndex, 1);
            const subIds = new Set(state.subIps.filter((item) => item.ipId === ipId).map((item) => item.id));
            state.subIps = state.subIps.filter((item) => item.ipId !== ipId);
            state.items = state.items.filter((item) => !subIds.has(item.subIpId));
            state.files = state.files.filter((item) => item.ipId !== ipId);
            state.grants = state.grants.filter((item) => item.ipId !== ipId);
            state.usages = state.usages.filter((item) => item.ipId !== ipId);
            state.downloads = state.downloads.filter((item) => item.ipId !== ipId);
            return structuredClone(files);
        });
    }
    async getIpSubIp(ipId: string, subIpId: string): Promise<IpSubIpDetailRecord | null> {
        const state = await readFile();
        const subIp = state.subIps.find((item) => item.ipId === ipId && item.id === subIpId);
        return subIp ? subIpDetailFor(state, subIp) : null;
    }
    createIpSubIp(ipId: string, input: IpSubIpCreateInput) {
        return mutate(async (state) => {
            if (!state.packages.some((item) => item.id === ipId)) throw new Error("IP 不存在");
            if (state.subIps.some((item) => item.id === input.id)) throw new Error("子 IP 已存在");
            const now = new Date().toISOString();
            const record: IpSubIpRecord = { ...structuredClone(input), ipId, tags: structuredClone(input.tags || []), sourceNote: input.sourceNote || "", sortOrder: input.sortOrder ?? nextOrder(state, ipId), createdAt: now, updatedAt: now };
            state.subIps.push(record);
            return { ...structuredClone(record), items: [] };
        });
    }
    updateIpSubIp(ipId: string, subIpId: string, patch: IpSubIpPatch) {
        return mutate(async (state) => {
            const record = state.subIps.find((item) => item.ipId === ipId && item.id === subIpId);
            if (!record) return null;
            Object.assign(record, patch, { updatedAt: new Date().toISOString() });
            if (patch.coverFileId === null) record.coverFileId = undefined;
            return structuredClone(record);
        });
    }
    deleteIpSubIp(ipId: string, subIpId: string) {
        return mutate(async (state) => {
            const index = state.subIps.findIndex((item) => item.ipId === ipId && item.id === subIpId);
            if (index < 0) return null;
            if (state.subIps.filter((item) => item.ipId === ipId).length <= 1) return "last-sub-ip" as const;
            const files = state.files.filter((item) => item.ipId === ipId && item.subIpId === subIpId);
            state.cleanup.push(...files.map(cleanupFor));
            state.subIps.splice(index, 1);
            state.items = state.items.filter((item) => item.subIpId !== subIpId);
            state.files = state.files.filter((item) => item.subIpId !== subIpId);
            state.grants = state.grants.filter((item) => item.subIpId !== subIpId);
            state.usages = state.usages.filter((item) => item.subIpId !== subIpId);
            state.downloads = state.downloads.filter((item) => item.subIpId !== subIpId);
            return structuredClone(files);
        });
    }
    replaceIpSubIpItems(ipId: string, subIpId: string, inputs: IpItemInput[]) {
        return mutate(async (state) => {
            if (!state.subIps.some((item) => item.ipId === ipId && item.id === subIpId)) return null;
            if (
                new Set(inputs.map((item) => item.id)).size !== inputs.length ||
                inputs.some((item) => !state.files.some((file) => file.id === item.fileId && file.ipId === ipId && file.subIpId === subIpId && file.kind === item.kind && file.status === "ready"))
            )
                throw new Error("IP 内容文件不存在、跨子 IP、类型不匹配或尚未就绪");
            state.items = state.items.filter((item) => item.subIpId !== subIpId);
            const now = new Date().toISOString();
            const records = inputs.map((item, index) => ({ ...structuredClone(item), subIpId, sortOrder: item.sortOrder ?? index, createdAt: now }));
            state.items.push(...records);
            return structuredClone(records);
        });
    }
    createIpContentFile(input: IpContentFileCreateInput) {
        return mutate(async (state) => {
            if (!state.packages.some((item) => item.id === input.ipId) || !state.subIps.some((item) => item.id === input.subIpId && item.ipId === input.ipId)) throw new Error("IP 或子 IP 不存在");
            if (state.files.some((item) => item.id === input.id)) throw new Error("IP 内容文件已存在");
            const now = new Date().toISOString();
            const record = { ...structuredClone(input), createdAt: now, updatedAt: now };
            state.files.push(record);
            return structuredClone(record);
        });
    }
    async getIpContentFile(ipId: string, fileId: string, subIpId?: string) {
        return detached((await readFile()).files.find((item) => item.ipId === ipId && item.id === fileId && (!subIpId || item.subIpId === subIpId)));
    }
    async listIpContentFiles(ipId: string, subIpId?: string) {
        return structuredClone((await readFile()).files.filter((item) => item.ipId === ipId && (!subIpId || item.subIpId === subIpId)).sort(byCreated));
    }
    updateIpContentFile(ipId: string, fileId: string, patch: IpContentFilePatch) {
        return mutate(async (state) => {
            const record = state.files.find((item) => item.ipId === ipId && item.id === fileId);
            if (!record || record.status === "deleting") return null;
            Object.assign(record, structuredClone(patch), { updatedAt: new Date().toISOString() });
            return structuredClone(record);
        });
    }
    claimIpContentFileDeletion(ipId: string, fileId: string) {
        return mutate(async (state) => {
            const record = state.files.find((item) => item.ipId === ipId && item.id === fileId);
            if (!record || isFileReferenced(state, fileId)) return null;
            Object.assign(record, { status: "deleting" as const, errorMessage: undefined, updatedAt: new Date().toISOString() });
            return structuredClone(record);
        });
    }
    finalizeIpContentFileDeletion(ipId: string, fileId: string) {
        return mutate(async (state) => {
            const index = state.files.findIndex((item) => item.ipId === ipId && item.id === fileId && item.status === "deleting");
            if (index < 0 || isFileReferenced(state, fileId)) return false;
            state.files.splice(index, 1);
            return true;
        });
    }
    async listVisibleIps(input: VisibleIpListInput): Promise<PageResult<IpSummaryRecord>> {
        const [state, auth, school] = await readAccessState();
        if (!activeUser(auth, input.userId) || (input.scope === "school" && (!input.schoolId || !activeMembership(school, input.userId, input.schoolId)))) return page([], input);
        const at = Date.parse(input.at || new Date().toISOString());
        const visibleSubIps = state.subIps.filter((subIp) => visibleSubIp(state, subIp, input, at));
        const byIp = new Map<string, IpSubIpRecord[]>();
        for (const subIp of visibleSubIps) byIp.set(subIp.ipId, [...(byIp.get(subIp.ipId) || []), subIp]);
        return page(
            state.packages
                .filter((item) => item.status === "enabled" && item.visibility === input.scope && byIp.has(item.id) && matchesVisible(state, item, byIp.get(item.id)!, input))
                .map((item) => summaryFor(state, item, byIp.get(item.id)!))
                .sort(byUpdated),
            input,
        );
    }
    async getVisibleIp(input: VisibleIpDetailInput): Promise<IpDetailRecord | null> {
        const [state, auth, school] = await readAccessState();
        const packageRecord = state.packages.find((item) => item.id === input.ipId && item.status === "enabled");
        if (!packageRecord || !activeUser(auth, input.userId)) return null;
        const at = Date.parse(input.at || new Date().toISOString());
        const subIps = state.subIps.filter((item) => item.ipId === packageRecord.id && (!input.subIpId || item.id === input.subIpId) && visibleSubIp(state, item, { ...input, scope: packageRecord.visibility }, at));
        if (!subIps.length || (packageRecord.visibility === "school" && (!input.schoolId || !activeMembership(school, input.userId, input.schoolId)))) return null;
        return { ...structuredClone(packageRecord), subIps: subIps.map((item) => ({ ...subIpDetailFor(state, item), ...(packageRecord.visibility === "school" ? { grantMode: activeGrant(state, item.id, input.schoolId!, at)?.mode } : {}) })) };
    }
    createSchoolGrant(input: IpSchoolGrantCreateInput) {
        return mutate(async (state, school) => {
            if (!state.packages.some((item) => item.id === input.ipId && item.visibility === "school") || !state.subIps.some((item) => item.id === input.subIpId && item.ipId === input.ipId) || !school.schools?.some((item) => item.id === input.schoolId))
                throw new Error("IP、子 IP 或学校不存在");
            if (state.grants.some((item) => item.id === input.id)) throw new Error("IP 学校授权已存在");
            assertGrantWindow(input.startsAt, input.endsAt);
            const conflict = grantConflict(state.grants, input);
            if (conflict) throw new Error("IP 学校授权冲突");
            const now = new Date().toISOString();
            const record = { ...structuredClone(input), createdAt: now, updatedAt: now };
            state.grants.push(record);
            return structuredClone(record);
        });
    }
    async findConflictingSchoolGrant(input: IpGrantConflictInput) {
        return detached(grantConflict((await readFile()).grants, input));
    }
    updateSchoolGrant(ipId: string, grantId: string, patch: IpSchoolGrantUpdateInput) {
        return mutate(async (state) => {
            const record = state.grants.find((item) => item.ipId === ipId && item.id === grantId);
            if (!record) return null;
            const next = { ...record, ...structuredClone(patch), endsAt: patch.endsAt === null ? undefined : (patch.endsAt ?? record.endsAt), updatedAt: patch.updatedAt };
            assertGrantWindow(next.startsAt, next.endsAt);
            if (next.status === "active" && grantConflict(state.grants, { ...next, excludeGrantId: record.id })) throw new Error("IP 学校授权冲突");
            Object.assign(record, next);
            return structuredClone(record);
        });
    }
    async listSchoolGrants(input: IpGrantListInput = {}): Promise<PageResult<IpSchoolGrantRecord>> {
        return page(
            (await readFile()).grants
                .filter(
                    (item) =>
                        (!input.ipId || item.ipId === input.ipId) &&
                        (!input.subIpId || item.subIpId === input.subIpId) &&
                        (!input.grantId || item.id === input.grantId) &&
                        (!input.schoolId || item.schoolId === input.schoolId) &&
                        (!input.status || item.status === input.status),
                )
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id)),
            input,
        );
    }
    recordIpUsage(input: IpUsageCreateInput) {
        return mutate(async (state) => {
            const existing = state.usages.find((item) => item.id === input.id);
            if (existing) return structuredClone(existing);
            assertUsage(state, input);
            const record = { ...structuredClone(input), createdAt: new Date().toISOString() };
            state.usages.push(record);
            return structuredClone(record);
        });
    }
    async recordIpUsages(inputs: IpUsageCreateInput[]) {
        return Promise.all(inputs.map((input) => this.recordIpUsage(input)));
    }
    async listIpUsage(input: IpUsageListInput = {}): Promise<PageResult<IpUsageRecord>> {
        return page((await readFile()).usages.filter((item) => matchesRecord(item, input)).sort(byCreatedDesc), input);
    }
    recordIpDownload(input: IpDownloadCreateInput) {
        return mutate(async (state) => {
            if (state.downloads.some((item) => item.id === input.id)) throw new Error("IP 下载记录已存在");
            assertUsage(state, input);
            const record = { ...structuredClone(input), createdAt: new Date().toISOString() };
            state.downloads.push(record);
            return structuredClone(record);
        });
    }
    async listIpDownloads(input: IpDownloadListInput = {}): Promise<PageResult<IpDownloadRecord>> {
        return page((await readFile()).downloads.filter((item) => matchesRecord(item, input) && (!input.downloadType || item.downloadType === input.downloadType) && (!input.result || item.result === input.result)).sort(byCreatedDesc), input);
    }
    async listIpFileCleanupQueue() {
        return structuredClone((await readFile()).cleanup.sort(byCreated));
    }
    removeIpFileCleanupQueueRecord(id: string) {
        return mutate(async (state) => {
            const index = state.cleanup.findIndex((item) => item.id === id);
            if (index < 0) return false;
            state.cleanup.splice(index, 1);
            return true;
        });
    }
}

async function readFile() {
    return normalizeFile(await readJsonDataFile<Partial<IpLibraryFile>>(IP_LIBRARY_DATA_FILE, EMPTY_FILE));
}
async function mutate<T>(operation: (state: IpLibraryFile, school: SchoolSnapshot, auth: AuthSnapshot) => Promise<T>) {
    return withJsonDataFileLocks([AUTH_DATA_FILE, IP_LIBRARY_DATA_FILE, SCHOOL_DOMAIN_DATA_FILE], async () => {
        const [state, school, auth] = await Promise.all([readFile(), readJsonDataFile<SchoolSnapshot>(SCHOOL_DOMAIN_DATA_FILE, {}), readJsonDataFile<AuthSnapshot>(AUTH_DATA_FILE, {})]);
        const result = await operation(state, school, auth);
        await writeJsonDataFile(IP_LIBRARY_DATA_FILE, state);
        return result;
    });
}
async function readAccessState() {
    return Promise.all([readFile(), readJsonDataFile<AuthSnapshot>(AUTH_DATA_FILE, {}), readJsonDataFile<SchoolSnapshot>(SCHOOL_DOMAIN_DATA_FILE, {})]) as Promise<[IpLibraryFile, AuthSnapshot, SchoolSnapshot]>;
}
function normalizeFile(value: Partial<IpLibraryFile>): IpLibraryFile {
    if (value.version !== 3) {
        const files = Array.isArray(value.files) ? (value.files as IpContentFileRecord[]) : [];
        const existing = Array.isArray(value.cleanup) ? (value.cleanup as IpFileCleanupRecord[]) : [];
        const cleanup = new Map(existing.map((item) => [item.id, structuredClone(item)]));
        for (const file of files) {
            if (file?.id && file.storageKey) cleanup.set(file.id, cleanupFor(file));
        }
        return { ...EMPTY_FILE, cleanup: [...cleanup.values()] };
    }
    const rawFiles = Array.isArray(value.files) ? structuredClone(value.files) : [];
    const files = rawFiles.filter((file): file is IpContentFileRecord => typeof file?.subIpId === "string" && Boolean(file.subIpId));
    const cleanup = new Map((Array.isArray(value.cleanup) ? value.cleanup : []).map((item) => [item.id, structuredClone(item)]));
    for (const file of rawFiles) {
        if (!files.includes(file) && file?.id && file.storageKey) cleanup.set(file.id, cleanupFor(file));
    }
    return {
        ...EMPTY_FILE,
        version: 3,
        packages: Array.isArray(value.packages) ? structuredClone(value.packages) : [],
        subIps: Array.isArray(value.subIps) ? structuredClone(value.subIps) : [],
        items: Array.isArray(value.items) ? structuredClone(value.items) : [],
        files,
        grants: Array.isArray(value.grants) ? structuredClone(value.grants) : [],
        usages: Array.isArray(value.usages) ? structuredClone(value.usages) : [],
        downloads: Array.isArray(value.downloads) ? structuredClone(value.downloads) : [],
        cleanup: [...cleanup.values()],
    };
}
function detailFor(state: IpLibraryFile, packageRecord: IpPackageRecord): IpDetailRecord {
    return {
        ...structuredClone(packageRecord),
        subIps: state.subIps
            .filter((item) => item.ipId === packageRecord.id)
            .sort(subIpOrder)
            .map((item) => subIpDetailFor(state, item)),
    };
}
function subIpDetailFor(state: IpLibraryFile, subIp: IpSubIpRecord): IpSubIpDetailRecord {
    return { ...structuredClone(subIp), items: structuredClone(state.items.filter((item) => item.subIpId === subIp.id).sort(itemOrder)) };
}
function summaryFor(state: IpLibraryFile, packageRecord: IpPackageRecord, visibleSubIps?: IpSubIpRecord[]): IpSummaryRecord {
    const subIps = visibleSubIps || state.subIps.filter((item) => item.ipId === packageRecord.id);
    const cover = subIps.find((item) => item.coverFileId) || subIps[0];
    return {
        ...structuredClone(packageRecord),
        subIpCount: subIps.length,
        ...(visibleSubIps ? { accessibleSubIpCount: subIps.length } : {}),
        ...(cover?.id ? { coverSubIpId: cover.id } : {}),
        ...(cover?.coverFileId ? { coverFileId: cover.coverFileId } : {}),
    } as IpSummaryRecord;
}
function visibleSubIp(state: IpLibraryFile, subIp: IpSubIpRecord, input: Pick<VisibleIpListInput, "scope" | "schoolId">, at: number) {
    return input.scope === "public" || Boolean(input.schoolId && activeGrant(state, subIp.id, input.schoolId, at));
}
function matchesVisible(state: IpLibraryFile, packageRecord: IpPackageRecord, subIps: IpSubIpRecord[], input: VisibleIpListInput) {
    const keyword = input.keyword?.trim().toLowerCase();
    const tags = input.tags?.map((item) => item.trim().toLowerCase()).filter(Boolean) || [];
    if (keyword && !`${packageRecord.title}\n${packageRecord.summary}\n${subIps.map((item) => `${item.title}\n${item.summary}`).join("\n")}`.toLowerCase().includes(keyword)) return false;
    if ((input.kind || input.category) && !subIps.some((subIp) => state.items.some((item) => item.subIpId === subIp.id && (!input.kind || item.kind === input.kind) && (!input.category || item.category === input.category)))) return false;
    return !tags.length || subIps.some((subIp) => tags.some((tag) => subIp.tags.some((value) => value.toLowerCase() === tag)));
}
function matchesPackage(item: IpPackageRecord, input: AdminIpListInput) {
    const text = `${item.title}\n${item.summary}\n${item.slug}`.toLowerCase();
    return (!input.keyword || text.includes(input.keyword.trim().toLowerCase())) && (!input.status || item.status === input.status) && (!input.visibility || item.visibility === input.visibility);
}
function activeUser(auth: AuthSnapshot, userId: string) {
    return Boolean(auth.users?.some((item) => item.id === userId && item.status === "active"));
}
function activeMembership(school: SchoolSnapshot, userId: string, schoolId: string) {
    return Boolean(school.schools?.some((item) => item.id === schoolId && item.status === "active") && school.memberships?.some((item) => item.userId === userId && item.schoolId === schoolId && item.status === "active"));
}
function activeGrant(state: IpLibraryFile, subIpId: string, schoolId: string, at: number) {
    return state.grants.find((item) => item.subIpId === subIpId && item.schoolId === schoolId && item.status === "active" && Date.parse(item.startsAt) <= at && (!item.endsAt || Date.parse(item.endsAt) > at));
}
function grantConflict(grants: IpSchoolGrantRecord[], input: IpGrantConflictInput | (IpSchoolGrantRecord & { excludeGrantId?: string })) {
    return grants.find(
        (item) =>
            item.subIpId === input.subIpId &&
            item.status === "active" &&
            item.id !== input.excludeGrantId &&
            (item.schoolId === input.schoolId || item.mode === "exclusive" || input.mode === "exclusive") &&
            rangesOverlap(item.startsAt, item.endsAt, input.startsAt, input.endsAt),
    );
}
function assertUsage(state: IpLibraryFile, input: IpUsageCreateInput | IpDownloadCreateInput) {
    const itemIds = "itemIds" in input ? input.itemIds : input.itemId ? [input.itemId] : [];
    if (!state.subIps.some((item) => item.id === input.subIpId && item.ipId === input.ipId) || itemIds.some((id) => !state.items.some((item) => item.id === id && item.subIpId === input.subIpId))) throw new Error("IP 内容项不存在或不属于当前子 IP");
}
function isFileReferenced(state: IpLibraryFile, fileId: string) {
    return state.packages.some((item) => item.coverFileId === fileId) || state.subIps.some((item) => item.coverFileId === fileId) || state.items.some((item) => item.fileId === fileId);
}
function cleanupFor(file: IpContentFileRecord): IpFileCleanupRecord {
    const { id, storageProvider, storageKey, externalStorageId, externalObjectKey } = file;
    return { id, storageProvider, storageKey, externalStorageId, externalObjectKey, createdAt: new Date().toISOString() };
}
function page<T>(items: T[], input: { page?: number; pageSize?: number }): PageResult<T> {
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(100, positiveInteger(input.pageSize, 20));
    return { items: structuredClone(items.slice((page - 1) * pageSize, page * pageSize)), total: items.length, page, pageSize };
}
function nextOrder(state: IpLibraryFile, ipId: string) {
    return Math.max(-1, ...state.subIps.filter((item) => item.ipId === ipId).map((item) => item.sortOrder)) + 1;
}
function assertGrantWindow(startsAt: string, endsAt?: string) {
    const start = Date.parse(startsAt);
    const end = endsAt ? Date.parse(endsAt) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(start) || Number.isNaN(end) || end <= start) throw new Error("IP 授权时间窗无效");
}
function rangesOverlap(leftStart: string, leftEnd: string | undefined, rightStart: string, rightEnd: string | undefined) {
    return Date.parse(leftStart) < (rightEnd ? Date.parse(rightEnd) : Number.POSITIVE_INFINITY) && Date.parse(rightStart) < (leftEnd ? Date.parse(leftEnd) : Number.POSITIVE_INFINITY);
}
function matchesRecord(item: { ipId: string; subIpId: string; schoolId?: string; userId: string }, input: { ipId?: string; subIpId?: string; schoolId?: string; userId?: string }) {
    return (!input.ipId || item.ipId === input.ipId) && (!input.subIpId || item.subIpId === input.subIpId) && (!input.schoolId || item.schoolId === input.schoolId) && (!input.userId || item.userId === input.userId);
}
function detached<T>(value: T | undefined): T | null {
    return value === undefined ? null : structuredClone(value);
}
function positiveInteger(value: number | undefined, fallback: number) {
    return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}
function byUpdated(left: { updatedAt: string; id: string }, right: { updatedAt: string; id: string }) {
    return right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id);
}
function byCreated(left: { createdAt: string; id: string }, right: { createdAt: string; id: string }) {
    return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}
function byCreatedDesc(left: { createdAt: string; id: string }, right: { createdAt: string; id: string }) {
    return right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id);
}
function subIpOrder(left: IpSubIpRecord, right: IpSubIpRecord) {
    return left.sortOrder - right.sortOrder || byCreated(left, right);
}
function itemOrder(left: IpItemRecord, right: IpItemRecord) {
    return left.sortOrder - right.sortOrder || byCreated(left, right);
}
