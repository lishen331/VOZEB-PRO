import { renderDramaLabFrameTemplate } from "@/lib/drama-lab-style-prompt";
import { nanoid } from "nanoid";

import type { DramaCharacter, DramaProject, DramaProp, DramaScene } from "@/lib/drama-project-contract";
import { getAuthSettings } from "@/lib/auth/store";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { resolveDramaLabPrompt } from "@/lib/server/drama-lab-prompt-template-service";
import { recordDramaLabTextGenerationLog } from "@/lib/server/drama-lab-text-generation-log";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";
import { hasSystemAiCharge, readSystemAiBilling, systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";
import { refundGenerationCharge } from "@/lib/server/generation-charge-service";

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

export async function extractDramaLabAssets(input: { userId: string; origin: string; cookie: string; requestId: string; project: DramaProject; episodeId: string; assetType: DramaLabAssetType }) {
    const episode = input.project.episodes.find((item) => item.id === input.episodeId);
    const script = episode?.script.trim() || "";
    if (!episode) throw new DramaLabAssetExtractionError("当前剧集不存在", 404);
    if (!script) throw new DramaLabAssetExtractionError("请先填写当前集剧本", 400);

    const promptKey = input.assetType === "character" ? "character_extraction" : input.assetType === "scene" ? "scene_extraction" : "prop_extraction";
    const prompt = await resolveDramaLabPrompt(promptKey);
    const existing = assetsForType(input.project, input.assetType);
    const systemPrompt = renderDramaLabFrameTemplate(prompt.template, input.project);
    const userPrompt = lAssetExtractionUserPrompt(input.assetType, script);

    const settings = await getAuthSettings();
    const model = settings.defaultModels.textModel;
    const startedAt = Date.now();
    const logId = `drama-lab-extract:${input.project.id}:${input.episodeId}:${input.assetType}:${input.requestId}`;
    const title = `${assetLabel(input.assetType)}提取`;
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
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                tool: extractDramaAssetsTool(input.assetType),
                headers: { "Content-Type": "application/json", ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel) },
                preferNativeTools: true,
                allowRepair: false,
                onInvalidResponse: (headers) => refundInvalidResponse(input.userId, model, headers),
            });
            try {
                const items = normalizeExtractedDramaLabAssets(call.arguments, input.assetType, existing);
                await recordDramaLabTextGenerationLog({
                    id: logId,
                    userId: input.userId,
                    projectId: input.project.id,
                    episodeId: input.episodeId,
                    title,
                    prompt: userPrompt,
                    model,
                    status: "success",
                    durationMs: call.elapsedMs,
                    createdAt: startedAt,
                });
                return { assets: items, skippedCount: extractedItemCount(call.arguments) - items.length, templateKey: prompt.key };
            } catch (error) {
                await refundInvalidResponse(input.userId, model, call.headers);
                throw error;
            }
        } catch (error) {
            latestError = error;
        }
    }
    await recordDramaLabTextGenerationLog({
        id: logId,
        userId: input.userId,
        projectId: input.project.id,
        episodeId: input.episodeId,
        title,
        prompt: userPrompt,
        model,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: latestError instanceof Error ? latestError.message : "素材提取失败",
        createdAt: startedAt,
    });
    throw latestError instanceof DramaLabAssetExtractionError ? latestError : new DramaLabAssetExtractionError(latestError instanceof Error ? latestError.message : "资产提取失败，请稍后重试");
}

function assetsForType(project: DramaProject, assetType: DramaLabAssetType): ExtractableAsset[] {
    return assetType === "character" ? project.characters : assetType === "scene" ? project.scenes : project.props;
}

export function normalizeExtractedDramaLabAssets(value: string, assetType: DramaLabAssetType, existing: ExtractableAsset[]) {
    const payload = jsonValue(value);
    const items = Array.isArray(payload) ? payload : array(object(payload)?.items);
    if (payload === null) throw new DramaLabAssetExtractionError("文本模型没有返回有效的资产提取结果");
    const identities = new Set(existing.map((item) => sceneIdentity(item, assetType)).filter(Boolean));
    return items.flatMap((value) => {
        const item = object(value);
        if (!item) return [];
        const name = text(item.name, 120) || (assetType === "scene" ? text(item.location, 120) : "");
        const time = assetType === "scene" ? text(item.time, 120) : "";
        const identity = sceneIdentity({ name, time }, assetType);
        if (!name || identities.has(identity)) return [];
        identities.add(identity);
        const description = text(item.description, 2_000);
        const appearance = typeof item.appearance === "string" ? item.appearance.trim() : "";
        const imagePrompt = [item.image_prompt, item.prompt, item.imagePrompt].find((value) => typeof value === "string" && value.trim());
        const role = typeof item.role === "string" && ["main", "supporting", "minor"].includes(item.role) ? item.role : undefined;
        const type = typeof item.type === "string" ? item.type.trim() : "";
        const base = {
            id: `${assetType}_${nanoid()}`,
            name,
            description,
            ...(assetType === "character" && appearance ? { appearance } : {}),
            ...(assetType === "character" && role ? { role } : {}),
            ...(typeof imagePrompt === "string" ? { imagePrompt: imagePrompt.trim() } : {}),
            ...(assetType === "prop" && type ? { type } : {}),
        };
        if (assetType === "scene") return [{ ...base, ...(time ? { time } : {}) }];
        return [base];
    });
}

function extractedItemCount(value: string) {
    const payload = jsonValue(value);
    return Array.isArray(payload) ? payload.length : array(object(payload)?.items).length;
}

function sceneIdentity(value: Partial<ExtractableAsset> & { time?: string; location?: string }, assetType: DramaLabAssetType) {
    const name = normalizedName(assetName(value));
    return assetType === "scene" ? `${name}\u0000${normalizedName(typeof value.time === "string" ? value.time : "")}` : name;
}

function normalizedName(value: string) {
    return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

function assetName(value: Partial<ExtractableAsset> & { location?: unknown }) {
    const legacyLocation = (value as ExtractableAsset & { location?: unknown }).location;
    return typeof value.name === "string" && value.name.trim() ? value.name : typeof legacyLocation === "string" ? legacyLocation : "";
}

function assetLabel(assetType: DramaLabAssetType) {
    return assetType === "character" ? "角色" : assetType === "scene" ? "场景" : "道具";
}

function jsonValue(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

export function lAssetExtractionUserPrompt(assetType: DramaLabAssetType, script: string) {
    return assetType === "character" ? `剧本内容：\n${script}\n\n请提取剧本中所有有名字角色的设定。` : `【剧本内容】\n${script}`;
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
    if (hasSystemAiCharge(billing)) await refundGenerationCharge({ userId, receiptId: billing.billingReceiptId, model, usageKind: "text", units: 1, idempotencyKey: `drama-lab-refund:${billing.billingReceiptId}` });
}

function extractDramaAssetsTool(assetType: DramaLabAssetType) {
    const itemSchema =
        assetType === "character"
            ? {
                  type: "object",
                  properties: {
                      name: { type: "string" },
                      role: { type: "string", enum: ["main", "supporting", "minor"] },
                      appearance: { type: "string" },
                      description: { type: "string" },
                  },
                  required: ["name", "role", "appearance", "description"],
                  additionalProperties: false,
              }
            : assetType === "scene"
              ? {
                    type: "object",
                    properties: { location: { type: "string" }, time: { type: "string" }, prompt: { type: "string" } },
                    required: ["location", "time", "prompt"],
                    additionalProperties: false,
                }
              : {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        type: { type: "string" },
                        description: { type: "string" },
                        image_prompt: { type: "string" },
                    },
                    required: ["name", "type", "description", "image_prompt"],
                    additionalProperties: false,
                };
    return {
        name: "extract_drama_assets",
        description: "按 LocalMiniDrama 提取当前短剧集的指定资产",
        parameters: {
            type: "object",
            properties: { items: { type: "array", items: itemSchema } },
            required: ["items"],
            additionalProperties: false,
        },
    } as const;
}
