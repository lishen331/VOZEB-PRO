import { normalizeIpReference, type IpAssetKind, type IpItemCategory, type IpReference } from "@/lib/ip-library-domain";
import { SchoolServiceError } from "./school-access-service";
import { getCanvasProject } from "./canvas-project-store";
import { getDramaProject } from "./drama-project-store";
import { createIpUsagesForUser, getIpDetailForUser } from "./ip-library-service";
import type { GenerationTaskContext } from "./generation-task-types";

export type IpReferencePreview = {
    reference: IpReference;
    title: string;
    subIpTitle: string;
    coverPreviewUrl?: string;
    items: Array<{ id: string; kind: IpAssetKind; category: IpItemCategory; title: string; previewUrl?: string }>;
};

export async function validateIpReferences(userId: string, value: unknown): Promise<IpReferencePreview[]> {
    const references = normalizeReferences(value);
    return Promise.all(
        references.map(async (reference) => {
            const detail = await getIpDetailForUser(userId, reference.id, reference.subIpId);
            const subIp = detail.subIps[0];
            if (!subIp) throw new SchoolServiceError(404, "子 IP 不存在或无权访问");
            const selected = reference.itemIds.length ? subIp.items.filter((item) => reference.itemIds.includes(item.id)) : subIp.items;
            if (selected.length !== reference.itemIds.length && reference.itemIds.length) throw new SchoolServiceError(404, "IP 内容项不存在或无权访问");
            return {
                reference,
                title: detail.title,
                subIpTitle: subIp.title,
                ...(subIp.coverPreviewUrl ? { coverPreviewUrl: subIp.coverPreviewUrl } : {}),
                items: selected.map((item) => ({
                    id: item.id,
                    kind: item.kind,
                    category: item.category,
                    title: item.title,
                    ...(item.previewUrl ? { previewUrl: item.previewUrl } : {}),
                })),
            };
        }),
    );
}

export async function recordIpReferenceUsage(userId: string, input: { targetType: "canvas" | "drama" | "practice"; targetId: string; references: unknown }) {
    const targetId = typeof input.targetId === "string" ? input.targetId.trim() : "";
    if (!targetId) throw new SchoolServiceError(400, "IP 引用目标无效");
    const previews = await validateIpReferences(userId, input.references);
    await createIpUsagesForUser(
        userId,
        previews.map(({ reference }) => ({
            ipId: reference.id,
            subIpId: reference.subIpId,
            itemIds: reference.itemIds,
            action: "reference",
            targetType: input.targetType,
            targetId,
        })),
    );
}

export function normalizeIpReferences(value: unknown): IpReference[] {
    return normalizeReferences(value);
}

export async function validateCreativeProjectIpReferencesForRun(userId: string, surface: "canvas" | "drama", projectId: string) {
    const project = surface === "canvas" ? await getCanvasProject(projectId, userId) : await getDramaProject(projectId, userId);
    if (!project) throw new SchoolServiceError(404, surface === "canvas" ? "画布项目不存在" : "短剧项目不存在");
    await validateIpReferences(userId, project.ipReferences);
}

export async function validateGenerationContextIpReferences(userId: string, context?: GenerationTaskContext) {
    if (context?.executionProfile === "open-source-practice") {
        await validateIpReferences(userId, context.ipReferences);
        return;
    }
    if (context?.surface !== "canvas" && context?.surface !== "drama") return;
    const projectId = context.projectId?.trim();
    if (!projectId) throw new SchoolServiceError(400, "创作项目上下文无效");
    await validateCreativeProjectIpReferencesForRun(userId, context.surface, projectId);
}

function normalizeReferences(value: unknown) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new SchoolServiceError(400, "IP 引用无效");
    const references = value.map((item) => normalizeIpReference(item));
    if (references.some((item) => !item)) throw new SchoolServiceError(400, "IP 引用无效");
    const normalized = references as IpReference[];
    const keys = normalized.map((item) => `${item.id}:${item.subIpId}`);
    if (new Set(keys).size !== keys.length) throw new SchoolServiceError(400, "同一子 IP 不能重复引用");
    return normalized;
}
