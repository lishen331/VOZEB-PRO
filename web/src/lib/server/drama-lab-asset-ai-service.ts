import { getAuthSettings } from "@/lib/auth/store";
import { dramaLabStyleContext } from "@/lib/drama-lab-style-prompt";
import type { DramaAssetProfile, DramaAssetStage, DramaProject } from "@/lib/drama-project-contract";
import { resolveVisionModelCandidates, resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";
import { systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";

export type DramaLabAssetAiAction = "prompt" | "anchor" | "stages";
export type DramaLabAssetAiInput = { userId: string; origin: string; cookie: string; requestId: string; project: DramaProject; assetId: string; kind: "characters" | "scenes" | "props"; action: DramaLabAssetAiAction };

export class DramaLabAssetAiError extends Error {
    constructor(
        message: string,
        readonly status = 502,
    ) {
        super(message);
        this.name = "DramaLabAssetAiError";
    }
}

export async function runDramaLabAssetAiAction(input: DramaLabAssetAiInput) {
    const asset = input.project[input.kind].find((item) => item.id === input.assetId);
    if (!asset) throw new DramaLabAssetAiError("资产不存在", 404);
    const settings = await getAuthSettings();
    const referenceUrl = asset.references?.find((reference) => reference.id === asset.primaryReferenceId)?.url || asset.references?.[0]?.url || asset.referenceImageUrl;
    const needsVision = input.action === "anchor" && Boolean(referenceUrl);
    const model = (needsVision ? settings.defaultModels.visionModel : settings.defaultModels.textModel)?.trim() || "";
    const candidates = needsVision ? resolveVisionModelCandidates(settings, model) : resolveLogicalModelCandidates(settings, "text", model);
    if (!model || !candidates.length) throw new DramaLabAssetAiError(needsVision ? "后台尚未配置可用的多模态视觉模型" : "后台尚未配置可用的默认文本模型", 503);
    const assetText = JSON.stringify({
        kind: input.kind,
        asset: { name: asset.name, description: asset.description, appearance: asset.appearance, role: asset.role, type: asset.type, time: asset.time, imagePrompt: asset.imagePrompt, profile: asset.profile },
        project: { style: input.project.style, ...dramaLabStyleContext(input.project.style), ratio: input.project.ratio },
    });
    const tool = actionTool(input.action);
    const mediaInputs = needsVision && referenceUrl ? [{ type: "image" as const, url: await readImageDataUrl(referenceUrl, input.origin, input.cookie) }] : undefined;
    let latest: unknown;
    for (const candidate of rankTextPlanningCandidates(candidates)) {
        try {
            const idempotencyKey = systemAiIdempotencyKey("drama-lab-asset-ai", input.userId, input.project.id, input.assetId, input.action, input.requestId, candidate.channelId, candidate.upstreamModel);
            const call = await requestStructuredText({
                origin: input.origin,
                cookie: input.cookie,
                candidate,
                mediaInputs,
                messages: [
                    { role: "system", content: actionInstruction(input.action) },
                    { role: "user", content: assetText },
                ],
                tool,
                headers: { "Content-Type": "application/json", ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel) },
            });
            const parsed = JSON.parse(call.arguments) as Record<string, unknown>;
            return normalizeActionResult(input.action, parsed);
        } catch (error) {
            latest = error;
        }
    }
    throw new DramaLabAssetAiError(latest instanceof Error ? latest.message : "资产 AI 操作失败");
}

function actionInstruction(action: DramaLabAssetAiAction) {
    if (action === "prompt") return "你是短剧实验室资产提示词编辑器。根据资产设定生成可直接用于图片模型的最终提示词。角色必须是固定版式的四视图参考板；场景/道具遵守当前资产类型和项目风格。只返回工具 JSON。";
    if (action === "anchor") return "你是视觉资产分析师。根据文字设定和参考图提炼可复用的视觉锚点，必须返回视觉识别、造型与材质、固定色彩、一致性规则。只返回工具 JSON。";
    return "你是角色造型设计师。根据角色设定生成分集阶段造型 JSON 数组，只返回工具 JSON。";
}

function actionTool(action: DramaLabAssetAiAction) {
    if (action === "prompt")
        return {
            name: "generate_asset_prompt",
            description: "生成最终资产生图提示词",
            parameters: { type: "object", properties: { polishedPrompt: { type: "string", minLength: 1, maxLength: 12000 } }, required: ["polishedPrompt"], additionalProperties: false },
        };
    if (action === "anchor")
        return {
            name: "extract_asset_anchor",
            description: "提炼资产视觉锚点",
            parameters: {
                type: "object",
                properties: { visualIdentity: { type: "string" }, styling: { type: "string" }, colorPalette: { type: "string" }, consistencyRules: { type: "string" } },
                required: ["visualIdentity", "styling", "colorPalette", "consistencyRules"],
                additionalProperties: false,
            },
        };
    return {
        name: "generate_asset_stages",
        description: "生成角色分集造型",
        parameters: {
            type: "object",
            properties: {
                stages: {
                    type: "array",
                    items: { type: "object", properties: { episodeRange: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 }, appearance: { type: "string" } }, required: ["episodeRange", "appearance"], additionalProperties: false },
                },
            },
            required: ["stages"],
            additionalProperties: false,
        },
    };
}

function normalizeActionResult(action: DramaLabAssetAiAction, value: Record<string, unknown>) {
    if (action === "prompt") return { polishedPrompt: typeof value.polishedPrompt === "string" ? value.polishedPrompt.trim() : "" };
    if (action === "anchor") return { profile: { visualIdentity: text(value.visualIdentity), styling: text(value.styling), colorPalette: text(value.colorPalette), consistencyRules: text(value.consistencyRules) } satisfies DramaAssetProfile };
    const stages = Array.isArray(value.stages)
        ? value.stages.flatMap((item) => {
              if (!item || typeof item !== "object") return [];
              const v = item as Record<string, unknown>;
              const range = Array.isArray(v.episodeRange) ? v.episodeRange.map(Number) : [];
              const appearance = text(v.appearance);
              return range.length === 2 && range.every((n) => Number.isFinite(n) && n >= 1) && appearance ? [{ episodeRange: [Math.floor(range[0]), Math.floor(range[1])] as [number, number], appearance }] : [];
          })
        : [];
    return { stages: stages as DramaAssetStage[] };
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim().slice(0, 4000) : "";
}

async function readImageDataUrl(url: string, origin: string, cookie: string) {
    if (url.startsWith("data:image/")) return url;
    const target = url.startsWith("/") ? `${origin.replace(/\/$/, "")}${url}` : url;
    const response = await fetch(target, { headers: cookie ? { cookie } : undefined });
    if (!response.ok) throw new DramaLabAssetAiError("参考图读取失败", 422);
    const mime = response.headers.get("content-type")?.split(";", 1)[0] || "image/png";
    if (!mime.startsWith("image/")) throw new DramaLabAssetAiError("参考文件不是图片", 422);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new DramaLabAssetAiError("参考图大小不符合要求", 422);
    return `data:${mime};base64,${bytes.toString("base64")}`;
}
