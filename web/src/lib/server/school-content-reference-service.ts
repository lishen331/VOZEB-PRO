import { normalizeSchoolContentReference, type SchoolContentReference } from "@/lib/school-domain";
import { getCanvasProjectForUser } from "@/lib/server/canvas-project-service";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { getGenerationLogForUser } from "@/lib/server/generation-log-store";
import { getLibraryAsset } from "@/lib/server/library-asset-store";
import { getWorkPublicationForUser } from "@/lib/server/work-publication-service";
import { requireVisibleIp } from "./ip-library-access-service";
import { requireActiveSchoolContext, SchoolServiceError } from "./school-access-service";

export type SchoolContentReferencePreview = { reference: SchoolContentReference; title: string; previewUrl?: string };

class MissingSchoolContentReferenceError extends Error {}

export async function validateSchoolContentReferences(input: { userId: string; schoolId: string; references: unknown }): Promise<SchoolContentReferencePreview[]> {
    const context = await requireActiveSchoolContext(input.userId);
    if (context.school.id !== input.schoolId) throw new SchoolServiceError(404, "学校不存在或无权访问");
    if (!Array.isArray(input.references)) throw new SchoolServiceError(400, "成果引用无效");

    const references: SchoolContentReference[] = [];
    const identities = new Set<string>();
    for (const value of input.references) {
        const reference = normalizeSchoolContentReference(value);
        if (!reference) throw new SchoolServiceError(400, "成果引用无效");
        const identity = `${reference.type}:${reference.id}`;
        if (identities.has(identity)) throw new SchoolServiceError(400, "成果引用不能重复");
        identities.add(identity);
        references.push(reference);
    }

    return Promise.all(references.map((reference) => resolveReference(input.userId, reference)));
}

async function resolveReference(userId: string, reference: SchoolContentReference): Promise<SchoolContentReferencePreview> {
    try {
        if (reference.type === "work") {
            const work = await getWorkPublicationForUser(userId, reference.id);
            if (!work) throw new MissingSchoolContentReferenceError();
            return preview(reference, nestedText(work, "currentVersion", "title") || text(work, "title") || "作品", nestedText(work, "currentPreview", "previewUrl"));
        }
        if (reference.type === "canvas") {
            const project = await getCanvasProjectForUser(userId, reference.id);
            if (!project) throw new MissingSchoolContentReferenceError();
            return preview(reference, text(project, "title") || "画布项目", text(project, "coverUrl"));
        }
        if (reference.type === "drama") {
            const project = await getDramaProjectForUser(userId, reference.id);
            if (!project) throw new MissingSchoolContentReferenceError();
            return preview(reference, text(project, "title") || "短剧项目", text(project, "coverUrl"));
        }
        if (reference.type === "asset") {
            const asset = await getLibraryAsset(userId, reference.id);
            if (!asset) throw new MissingSchoolContentReferenceError();
            return preview(reference, text(asset, "title") || "素材", text(asset, "coverUrl"));
        }
        if (reference.type === "ip") {
            const access = await requireVisibleIp(userId, reference.id, reference.subIpId, reference.itemIds);
            return preview(reference, access.subIp.title || access.detail.title || "IP 内容");
        }
        const generation = await getGenerationLogForUser(userId, reference.id);
        if (!generation) throw new MissingSchoolContentReferenceError();
        const asset = Array.isArray(generation.assets) ? generation.assets[0] : undefined;
        return preview(reference, generation.title || "生成结果", asset?.serverUrl || asset?.url);
    } catch (error) {
        const status = error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
        if (error instanceof MissingSchoolContentReferenceError || status === 403 || status === 404) throw new SchoolServiceError(404, "引用的成果不存在或无权访问");
        throw error;
    }
}

function preview(reference: SchoolContentReference, title: string, url?: string): SchoolContentReferencePreview {
    const previewUrl = safePreviewUrl(url);
    return { reference, title, ...(previewUrl ? { previewUrl } : {}) };
}

function text(value: unknown, key: string) {
    if (!value || typeof value !== "object") return "";
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === "string" ? candidate.trim() : "";
}

function nestedText(value: unknown, parent: string, key: string) {
    if (!value || typeof value !== "object") return "";
    return text((value as Record<string, unknown>)[parent], key);
}

function safePreviewUrl(value: string | undefined) {
    const url = typeof value === "string" ? value.trim() : "";
    return url && !/^(data|blob):/i.test(url) ? url : undefined;
}
