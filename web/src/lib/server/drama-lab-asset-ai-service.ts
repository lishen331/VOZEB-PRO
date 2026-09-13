import { getAuthSettings } from "@/lib/auth/store";
import { dramaLabStyleContext } from "@/lib/drama-lab-style-prompt";
import { assetPromptPolishInstruction, buildDramaLabAssetFinalPrompt, buildLSceneFinalPrompt, lScenePolishPrompt } from "@/lib/drama-lab-asset-prompt-contract";
import { normalizeDramaAssetGenerationLayout } from "@/lib/drama-asset-generation-contract";
import type { DramaAssetProfile, DramaAssetStage, DramaProject } from "@/lib/drama-project-contract";
import { resolveVisionModelCandidates, resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";
import { systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";

export type DramaLabAssetAiAction = "describe" | "prompt" | "anchor" | "stages";
export type DramaLabAssetAiInput = {
    userId: string;
    origin: string;
    cookie: string;
    requestId: string;
    project: DramaProject;
    assetId: string;
    kind: "characters" | "scenes" | "props";
    action: DramaLabAssetAiAction;
    generationLayout?: "single" | "four_view";
};

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
    const needsVision = (input.action === "anchor" || input.action === "describe") && Boolean(referenceUrl);
    const model = (needsVision ? settings.defaultModels.visionModel : settings.defaultModels.textModel)?.trim() || "";
    const candidates = needsVision ? resolveVisionModelCandidates(settings, model) : resolveLogicalModelCandidates(settings, "text", model);
    if (!model || !candidates.length) throw new DramaLabAssetAiError(needsVision ? "后台尚未配置可用的多模态视觉模型" : "后台尚未配置可用的默认文本模型", 503);
    const assetText =
        input.action === "stages"
            ? characterStagesPrompt(input.project, asset)
            : input.action === "prompt" && input.kind === "scenes"
              ? scenePromptInput(input.project, asset, input.generationLayout)
              : JSON.stringify({
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
                    { role: "system", content: actionInstruction(input.action, input) },
                    { role: "user", content: assetText },
                ],
                tool,
                headers: { "Content-Type": "application/json", ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel) },
            });
            const parsed = JSON.parse(call.arguments) as Record<string, unknown>;
            if (input.action === "prompt") {
                const description = typeof parsed.visualDescription === "string" ? parsed.visualDescription.trim() : typeof parsed.polishedPrompt === "string" ? parsed.polishedPrompt.trim() : "";
                if (!description) throw new DramaLabAssetAiError("文本模型没有返回有效的资产视觉描述");
                const layout = input.kind === "characters" ? "four_view" : normalizeDramaAssetGenerationLayout(input.kind, input.generationLayout || asset.generationLayout);
                const finalPrompt =
                    input.kind === "scenes"
                        ? buildLSceneFinalPrompt({ style: input.project.style, aspectRatio: input.project.ratio }, description, layout)
                        : buildDramaLabAssetFinalPrompt({ style: input.project.style, aspectRatio: input.project.ratio }, { ...asset, generationLayout: layout }, input.kind, description);
                return input.kind === "scenes" && layout === "single" ? { singleImagePrompt: finalPrompt, polishedPrompt: asset.polishedPrompt || "" } : { polishedPrompt: finalPrompt, singleImagePrompt: asset.singleImagePrompt || "" };
            }
            return normalizeActionResult(input.action, parsed, input.project);
        } catch (error) {
            latest = error;
        }
    }
    throw new DramaLabAssetAiError(latest instanceof Error ? latest.message : "资产 AI 操作失败");
}

function scenePromptInput(project: DramaProject, asset: DramaProject["scenes"][number], generationLayout?: "single" | "four_view") {
    const layout = normalizeDramaAssetGenerationLayout("scenes", generationLayout || asset.generationLayout);
    const location = ("location" in asset && typeof asset.location === "string" ? asset.location.trim() : "") || asset.name?.trim() || "未知场景";
    const time = asset.time?.trim() || "";
    const description = asset.description?.trim() || asset.imagePrompt?.trim() || "";
    const sceneDescription = [`场景地点：${location}`, time ? `时间/时段：${time}` : "", description ? `场景描述：${description}` : ""].filter(Boolean).join("\n");
    return `请根据以下场景信息，生成${layout === "single" ? "单图" : "四格"}场景参考图的提示词：\n\n${sceneDescription}`;
}

function actionInstruction(action: DramaLabAssetAiAction, input?: Pick<DramaLabAssetAiInput, "kind" | "project" | "assetId" | "generationLayout">) {
    if (action === "describe") return "你是短剧实验室资产描述分析师。根据参考图和已有文字设定，提炼纯视觉外貌描述；不得描述背景故事、摄影者身份或不可见信息。只返回工具 JSON。";
    if (action === "prompt" && input) {
        const asset = input.project[input.kind].find((item) => item.id === input.assetId);
        const layout = input.kind === "characters" ? "four_view" : normalizeDramaAssetGenerationLayout(input.kind, input.generationLayout || asset?.generationLayout);
        if (input.kind === "scenes") return lScenePolishPrompt(layout, input.project.style);
        return `你是 LocalMiniDrama 资产视觉描述整理器。${assetPromptPolishInstruction(input.kind, layout)} 服务端会另行注入不可编辑版式合同；你只返回 visualDescription，不要复制版式、画风、JSON Schema、解释或 Markdown。`;
    }
    if (action === "prompt") return "你是 LocalMiniDrama 资产视觉描述整理器。只返回 visualDescription。";
    if (action === "anchor" && input?.kind === "characters")
        return `You are a character visual analyst. Extract precise visual identity anchors from character appearance descriptions.

Output ONLY a valid JSON object with these exact 6 keys:
{
  "face_shape": "precise description of face/skull shape, jawline, cheekbones (e.g. oval face, sharp jawline, high cheekbones)",
  "facial_features": "eye shape+color+Hex, nose bridge+tip, lip thickness+shape (e.g. almond eyes #3D2B1F, straight nose, thin lips)",
  "unique_marks": "scars, moles, tattoos, birthmarks, distinctive features — or 'none'",
  "color_anchors": {
    "hair": "#HexCode (e.g. #1A0A00 for black, #C8A96E for blonde)",
    "eyes": "#HexCode",
    "skin": "#HexCode (e.g. #F5DEB3 for wheat, #FDDBB4 for fair)",
    "primary_outfit": "#HexCode of dominant clothing color"
  },
  "skin_texture": "skin tone description + texture (e.g. fair porcelain smooth, tanned slightly weathered)",
  "hair_style": "length + style + texture (e.g. shoulder-length wavy black hair with loose strands, short crew cut)"
}

Rules:
- Use Hex color codes for ALL color values — never use color names like "black" or "brown"
- Extract ONLY what is explicitly stated; infer Hex values from color descriptions
- Keep each field concise (1-2 sentences max)
- If information is missing for a field, write "unspecified"
- Output ONLY the JSON object, no markdown, no explanation`;
    if (action === "anchor") return "你是视觉资产分析师。根据文字设定和参考图提炼可复用的视觉锚点，必须返回视觉识别、造型与材质、固定色彩、一致性规则。只返回工具 JSON。";
    return "你是影视角色连续性设计师。只输出可解析的 JSON 数组，保证字段类型正确、内容具体且便于图像模型执行。";
}

function characterStagesPrompt(project: DramaProject, asset: DramaProject["characters"][number]) {
    const episodeContext = project.episodes
        .slice(0, 20)
        .map((episode, index) => {
            const script = episode.script.replace(/\s+/g, " ").trim().slice(0, 700);
            return `第${episode.episodeNumber || index + 1}集《${episode.title || ""}》：${script}`;
        })
        .join("\n");
    const anchorText = asset.profile ? JSON.stringify(asset.profile).slice(0, 1800) : "暂无视觉锚点";
    const baseAppearance = [asset.appearance, asset.description].filter(Boolean).join("；") || asset.name || "未命名角色";
    return `请为短剧角色设计跨分集的多阶段造型，返回严格 JSON 数组，不要 Markdown、解释或额外字段。

剧名：${project.title || "未命名短剧"}
角色：${asset.name || "未命名"}（${asset.role || "角色"}）
基础外貌：${baseAppearance}
视觉锚点：${anchorText}
分集剧情：
${episodeContext || "暂无分集剧本，请按角色成长阶段合理设计。"}

输出格式：[{"episodeRange":[起始集,结束集],"appearance":"该阶段完整、可用于生图的外貌与服装描述"}]
要求：覆盖 1 至剧情最后一集；阶段数量 1-6 个；相邻阶段的身份、发型、体型和核心识别特征保持一致，只在剧情需要时改变服装、妆容、道具或状态；episodeRange 必须是两个正整数。`;
}
function actionTool(action: DramaLabAssetAiAction) {
    if (action === "describe")
        return {
            name: "describe_asset_reference",
            description: "提取参考图视觉外貌描述",
            parameters: { type: "object", properties: { appearance: { type: "string", minLength: 1, maxLength: 4000 } }, required: ["appearance"], additionalProperties: false },
        };
    if (action === "prompt")
        return {
            name: "generate_asset_prompt",
            description: "整理资产可见视觉描述，由服务端组合固定版式合同",
            parameters: { type: "object", properties: { visualDescription: { type: "string", minLength: 1, maxLength: 8000 } }, required: ["visualDescription"], additionalProperties: false },
        };
    if (action === "anchor")
        return {
            name: "extract_asset_anchor",
            description: "提炼资产视觉锚点",
            parameters: {
                type: "object",
                properties: {
                    face_shape: { type: "string" },
                    facial_features: { type: "string" },
                    unique_marks: { type: "string" },
                    color_anchors: {
                        type: "object",
                        properties: { hair: { type: "string" }, eyes: { type: "string" }, skin: { type: "string" }, primary_outfit: { type: "string" } },
                        required: ["hair", "eyes", "skin", "primary_outfit"],
                        additionalProperties: false,
                    },
                    skin_texture: { type: "string" },
                    hair_style: { type: "string" },
                },
                required: ["face_shape", "facial_features", "unique_marks", "color_anchors", "skin_texture", "hair_style"],
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

function normalizeActionResult(action: DramaLabAssetAiAction, value: Record<string, unknown>, project: DramaProject) {
    if (action === "describe") return { appearance: text(value.appearance) };
    if (action === "prompt") return { polishedPrompt: typeof value.polishedPrompt === "string" ? value.polishedPrompt.trim() : "" };
    if (action === "anchor") {
        const colors = value.color_anchors && typeof value.color_anchors === "object" && !Array.isArray(value.color_anchors) ? (value.color_anchors as Record<string, unknown>) : {};
        return {
            profile: {
                visualIdentity: "",
                styling: "",
                colorPalette: "",
                consistencyRules: "",
                face_shape: text(value.face_shape),
                facial_features: text(value.facial_features),
                unique_marks: text(value.unique_marks),
                color_anchors: { hair: text(colors.hair), eyes: text(colors.eyes), skin: text(colors.skin), primary_outfit: text(colors.primary_outfit) },
                skin_texture: text(value.skin_texture),
                hair_style: text(value.hair_style),
            } satisfies DramaAssetProfile,
        };
    }
    const maxEpisode = project.episodes.length ? Math.max(...project.episodes.map((episode, index) => Number(episode.episodeNumber) || index + 1)) : 1;
    const stages = Array.isArray(value.stages)
        ? value.stages
              .flatMap((item) => {
                  if (!item || typeof item !== "object") return [];
                  const v = item as Record<string, unknown>;
                  const range = Array.isArray(v.episodeRange) ? v.episodeRange.map(Number) : [];
                  const appearance = text(v.appearance ?? v.description);
                  if (range.length !== 2 || !appearance) return [];
                  let start = Math.max(1, Math.round(Number(range[0]) || 1));
                  let end = Math.max(start, Math.round(Number(range[1]) || start));
                  if (project.episodes.length) {
                      start = Math.min(start, maxEpisode);
                      end = Math.min(Math.max(end, start), maxEpisode);
                  }
                  return [{ episodeRange: [start, end] as [number, number], appearance }];
              })
              .slice(0, 6)
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
