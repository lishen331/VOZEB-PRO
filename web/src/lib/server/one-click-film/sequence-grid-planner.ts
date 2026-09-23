import type { DramaProject, DramaShotFrameType } from "@/lib/drama-project-contract";
import type { DramaLabStoryboardSequenceMode } from "@/lib/drama-lab-storyboard-options";
import { dramaLabStyleContext, renderDramaLabFrameTemplate } from "@/lib/drama-lab-style-prompt";
import { getAuthSettings } from "@/lib/auth/store";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";
import { systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";
import { sanitizeDramaLabFramePrompt } from "@/lib/server/drama-lab-frame-prompt-sanitize";
import { findShot } from "@/lib/server/drama-lab-shot-generation-service";
import { oneClickAngleChineseLabel } from "./video-prompt-rebuild";
import { buildSequenceGridPrompt, sequenceGridPanels } from "./sequence-grid";
import contract from "./sequence-grid-l-contract.json";

type Input = { project: DramaProject; episodeId: string; shotId: string; mode: DramaLabStoryboardSequenceMode };
type Runtime = { userId: string; origin: string; cookie: string; requestId: string };
export type SequencePanelRequest = { index: number; frameType: DramaShotFrameType; angle: string; systemPrompt: string; userPrompt: string; fallback: string; allowedNames: string[] };

/** L framePromptService buildStoryboardContext, adapted only to V's camelCase asset schema. */
export function buildSequencePanelRequest(input: Input, index: number): SequencePanelRequest {
    const { shot } = findShot(input.project, input.episodeId, input.shotId);
    const panels = sequenceGridPanels(input.mode);
    const angle = panels[index].label;
    const frameType = index === 0 ? "first" : index === panels.length - 1 ? "last" : "key";
    const { stylePromptZh, stylePromptEn } = dramaLabStyleContext(input.project.style);
    const scene = input.project.scenes.find((item) => item.id === shot.sceneId);
    const characters = input.project.characters.filter((item) => shot.characterIds?.includes(item.id));
    const anchors = characters.map((item) => {
        const a = item.profile;
        if (a && Object.keys(a).length) {
            const parts = [`Character: ${item.name}`];
            for (const [key, label] of [
                ["face_shape", "Face"],
                ["facial_features", "Features"],
                ["hair_style", "Hair"],
                ["skin_texture", "Skin"],
            ] as const)
                if (a[key] && a[key] !== "unspecified") parts.push(`${label}: ${a[key]}`);
            if (a.color_anchors) {
                const colors = Object.entries(a.color_anchors)
                    .filter(([, v]) => v && v !== "unspecified")
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ");
                if (colors) parts.push(`Colors: ${colors}`);
            }
            if (a.unique_marks && a.unique_marks !== "none" && a.unique_marks !== "unspecified") parts.push(`Marks: ${a.unique_marks}`);
            return parts.join("; ");
        }
        let appearance = item.appearance || "";
        for (const pattern of [
            /身穿[^，。；\n]*/g,
            /穿着[^，。；\n]*/g,
            /衣着[^，。；\n]*/g,
            /手持[^，。；\n]*/g,
            /戴着[^，。；\n]*/g,
            /围[^，。；\n]*巾/g,
            /服装[^，。；\n]*/g,
            /服饰[^，。；\n]*/g,
            /着装[^，。；\n]*/g,
            / dressed in [^，。；\n]*/gi,
            / wearing [^，。；\n]*/gi,
            / holding [^，。；\n]*/gi,
            /着[^，。；\n]*鞋/g,
        ])
            appearance = appearance.replace(pattern, "");
        appearance = appearance
            .replace(/[，、；]\s*[，、；]+/g, "，")
            .replace(/^[，、；\s]+|[，、；\s]+$/g, "")
            .replace(/\s+/g, " ")
            .trim();
        return appearance ? `${item.name}（${appearance}）—— 以上为该角色固定视觉身份锚点，生成画面时必须严格以此为基础，禁止添加任何未在此列出的外貌细节（发型/颜色/脸型/气质等）` : item.name;
    });
    const allowedNames = characters.map((item) => item.name);
    const context = [
        anchors.length ? `【角色视觉锚点 - 最高优先级铁律，必须严格遵守，禁止任何脑补或添加未提供的外貌细节】\n${anchors.join("\n")}` : "",
        allowedNames.length ? `【本分镜允许出场的角色（仅此名单，严禁出现名单外的任何其他人物）】\n${allowedNames.join("、")}` : "",
        shot.layoutDescription?.trim() ? contract.spatialContract.replace("${ld}", shot.layoutDescription.trim()) : "",
        stylePromptZh || stylePromptEn ? `【画风·最高优先级】${stylePromptZh || stylePromptEn}` : "",
        shot.description ? `镜头描述: ${shot.description}` : "",
        scene || shot.location || shot.time ? `场景: ${scene?.name || shot.location || ""}, ${scene?.time || shot.time || ""}` : "",
        ...(
            [
                ["动作", shot.action],
                ["结果", shot.result],
                ["对白", shot.dialogue],
                ["氛围", shot.atmosphere],
                ["景别", shot.shotType],
            ] as const
        ).map(([label, value]) => (value ? `${label}: ${value}` : "")),
        `相机角度：${shot.angleH && shot.angleV && shot.angleS ? oneClickAngleChineseLabel(shot.angleH, shot.angleV, shot.angleS) : contract.angles[angle as keyof typeof contract.angles]}`,
        shot.cameraMotion ? `运镜: ${shot.cameraMotion}` : "",
    ]
        .filter(Boolean)
        .join("\n");
    const kindName = frameType === "first" ? "首帧" : frameType === "key" ? "关键帧" : "尾帧";
    const suffix = frameType === "first" ? "首帧静止画面，动作发生前的初始状态" : frameType === "key" ? "关键帧，动作高潮瞬间" : "尾帧静止画面，动作完成后的最终状态";
    return {
        index,
        frameType,
        angle,
        systemPrompt: renderDramaLabFrameTemplate(contract.systems[frameType], input.project),
        userPrompt: `镜头信息：\n${context}\n\n请直接生成${kindName}的图像提示词（JSON 的 prompt 字段必须全文中文），不要任何解释：`,
        allowedNames,
        fallback: [scene?.name, scene?.time, stylePromptZh || stylePromptEn, suffix].filter(Boolean).join("，"),
    };
}

/** L Promise.all generates 4/9 independent first/key/last prompts, never repeats a cached key prompt. */
export async function planOneClickSequenceGrid(input: Input, runtime: Runtime, generatePanel?: (panel: SequencePanelRequest) => Promise<string>) {
    const panels = sequenceGridPanels(input.mode);
    if (!panels.length) return "";
    const settings = generatePanel ? undefined : await getAuthSettings();
    const model = settings?.defaultModels.textModel;
    const candidates = settings && model ? rankTextPlanningCandidates(resolveLogicalModelCandidates(settings, "text", model)) : [];
    const prompts = await Promise.all(
        panels.map(async (_, index) => {
            const panel = buildSequencePanelRequest(input, index);
            if (generatePanel) return generatePanel(panel);
            // L explicitly falls back per frame on provider failure or invalid JSON.
            for (const candidate of candidates) {
                try {
                    const call = await requestStructuredText({
                        maxTokens: 2400,
                        origin: runtime.origin,
                        cookie: runtime.cookie,
                        candidate,
                        messages: [
                            { role: "system", content: panel.systemPrompt },
                            { role: "user", content: panel.userPrompt },
                        ],
                        tool: { name: "write_sequence_frame", description: "输出帧提示词", parameters: { type: "object", properties: { prompt: { type: "string" }, description: { type: "string" } }, required: ["prompt"] } },
                        headers: systemAiBillingHeaders(model!, systemAiIdempotencyKey("one-click-film-grid-panel", runtime.userId, runtime.requestId, String(index), candidate.channelId, candidate.upstreamModel), candidate.upstreamModel),
                    });
                    const parsed = JSON.parse(call.arguments) as { prompt?: string };
                    if (typeof parsed.prompt === "string") return sanitizeDramaLabFramePrompt(parsed.prompt, panel.allowedNames, panel.allowedNames).prompt;
                } catch {
                    /* L fallback below; no extra image task or reused prompt. */
                }
            }
            return panel.fallback;
        }),
    );
    const style = dramaLabStyleContext(input.project.style);
    const styleHead = [style.stylePromptZh ? `【画风·最高优先级】${style.stylePromptZh}` : "", style.stylePromptEn ? `MANDATORY ART STYLE: ${style.stylePromptEn}.` : ""].filter(Boolean).join("\n");
    return buildSequenceGridPrompt({ mode: input.mode, panelPrompts: prompts, styleHead });
}
