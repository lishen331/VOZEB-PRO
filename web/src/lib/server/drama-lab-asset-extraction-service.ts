import { nanoid } from "nanoid";

import type { DramaCharacter, DramaProject, DramaProp, DramaScene } from "@/lib/drama-project-contract";
import { getAuthSettings, refundUserPoints } from "@/lib/auth/store";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { resolveDramaLabPrompt, withDramaLabPromptContract } from "@/lib/server/drama-lab-prompt-template-service";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";
import { hasSystemAiCharge, readSystemAiBilling, systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";

export const DRAMA_LAB_ASSET_TYPES = ["character", "scene", "prop"] as const;
export type DramaLabAssetType = (typeof DRAMA_LAB_ASSET_TYPES)[number];

type ExtractableAsset = DramaCharacter | DramaScene | DramaProp;

export class DramaLabAssetExtractionError extends Error {
    constructor(
        message: string,
        readonly status = 502,
    ) {
        super(message);
        this.name = "DramaLabAssetExtractionError";
    }
}

export function isDramaLabAssetType(value: unknown): value is DramaLabAssetType {
    return typeof value === "string" && (DRAMA_LAB_ASSET_TYPES as readonly string[]).includes(value);
}

export async function extractDramaLabAssets(input: {
    userId: string;
    origin: string;
    cookie: string;
    requestId: string;
    project: DramaProject;
    episodeId: string;
    assetType: DramaLabAssetType;
}) {
    const episode = input.project.episodes.find((item) => item.id === input.episodeId);
    const script = episode?.script.trim() || "";
    if (!episode) throw new DramaLabAssetExtractionError("当前剧集不存在", 404);
    if (!script) throw new DramaLabAssetExtractionError("请先填写当前集剧本", 400);

    const promptKey = input.assetType === "character" ? "character_extraction" : input.assetType === "scene" ? "scene_extraction" : "prop_extraction";
    const prompt = await resolveDramaLabPrompt(promptKey);
    const existing = assetsForType(input.project, input.assetType);
    const systemPrompt = withDramaLabPromptContract(
        prompt.template,
        `只调用 extract_drama_assets 并返回 JSON 对象。items 必须是数组；每个项目只保留 name、description，场景可额外提供 time。不要返回 Markdown、解释、图片链接、角色 ID 或任何未定义字段。名称必须来自当前剧本。`,
    );
    const userPrompt = JSON.stringify({
        task: `从当前集剧本提取${assetLabel(input.assetType)}`,
        project: { title: input.project.title, style: input.project.style, aspectRatio: input.project.ratio },
        episode: { id: episode.id, title: episode.title, script },
        existingAssets: existing.map((item) => ({ name: assetName(item), description: item.description || "" })),
    });

    const settings = await getAuthSettings();
    const model = settings.defaultModels.textModel;
    const candidates = resolveLogicalModelCandidates(settings, "text", model);
    if (!model || !candidates.length) throw new DramaLabAssetExtractionError("后台尚未配置可用的默认文本模型", 503);

    let latestError: unknown;
    for (const candidate of rankTextPlanningCandidates(candidates)) {
        const idempotencyKey = systemAiIdempotencyKey("drama-lab-extract-assets", input.userId, input.project.id, input.episodeId, input.assetType, input.requestId, candidate.channelId, candidate.upstreamModel);
        try {
            const call = await requestStructuredText({
                origin: input.origin,
                cookie: input.cookie,
                candidate,
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                tool: extractDramaAssetsTool,
                headers: { "Content-Type": "application/json", ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel) },
                onInvalidResponse: (headers) => refundInvalidResponse(input.userId, model, headers),
            });
            try {
                const items = normalizeExtractedDramaLabAssets(call.arguments, input.assetType, existing);
                return { assets: items, skippedCount: extractedItemCount(call.arguments) - items.length, templateKey: prompt.key };
            } catch (error) {
                await refundInvalidResponse(input.userId, model, call.headers);
                throw error;
            }
        } catch (error) {
            latestError = error;
        }
    }
    throw latestError instanceof DramaLabAssetExtractionError
        ? latestError
        : new DramaLabAssetExtractionError(latestError instanceof Error ? latestError.message : "资产提取失败，请稍后重试");
}

function assetsForType(project: DramaProject, assetType: DramaLabAssetType): ExtractableAsset[] {
    return assetType === "character" ? project.characters : assetType === "scene" ? project.scenes : project.props;
}

export function normalizeExtractedDramaLabAssets(value: string, assetType: DramaLabAssetType, existing: ExtractableAsset[]) {
    const payload = jsonObject(value);
    if (!payload) throw new DramaLabAssetExtractionError("文本模型没有返回有效的资产提取结果");
    const names = new Set(existing.map((item) => normalizedName(assetName(item))).filter(Boolean));
    return array(payload.items).flatMap((value) => {
        const item = object(value);
        if (!item) return [];
        const name = text(item.name, 120);
        if (!name || names.has(normalizedName(name))) return [];
        names.add(normalizedName(name));
        const description = text(item.description, 2_000);
        const base = { id: `${assetType}_${nanoid()}`, name, description };
        if (assetType === "scene") {
            const time = text(item.time, 120);
            return [{ ...base, ...(time ? { time } : {}) }];
        }
        return [base];
    });
}

function extractedItemCount(value: string) {
    const payload = jsonObject(value);
    return payload ? array(payload.items).length : 0;
}

function normalizedName(value: string) {
    return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

function assetName(value: ExtractableAsset) {
    const legacyLocation = (value as ExtractableAsset & { location?: unknown }).location;
    return typeof value.name === "string" && value.name.trim() ? value.name : typeof legacyLocation === "string" ? legacyLocation : "";
}

function assetLabel(assetType: DramaLabAssetType) {
    return assetType === "character" ? "角色" : assetType === "scene" ? "场景" : "道具";
}

function jsonObject(value: string) {
    try {
        const parsed = JSON.parse(value);
        return object(parsed);
    } catch {
        return null;
    }
}

function object(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function array(value: unknown) {
    return Array.isArray(value) ? value : [];
}

function text(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function refundInvalidResponse(userId: string, model: string, headers: Headers) {
    const billing = readSystemAiBilling(headers);
    if (hasSystemAiCharge(billing)) await refundUserPoints(userId, model, billing.pointsCost, "text", 1, undefined, billing.pointsRecordId);
}

const extractDramaAssetsTool = {
    name: "extract_drama_assets",
    description: "从当前短剧集剧本提取指定类型的项目资产",
    parameters: {
        type: "object",
        properties: {
            items: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        time: { type: "string" },
                    },
                    required: ["name", "description"],
                    additionalProperties: false,
                },
            },
        },
        required: ["items"],
        additionalProperties: false,
    },
} as const;
