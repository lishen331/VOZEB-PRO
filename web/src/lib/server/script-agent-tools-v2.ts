import { randomUUID } from "node:crypto";
import { normalizeChapterSelection, type PracticeScriptShot } from "./script-agent-domain";

const ALLOWED_SCRIPT_TOOLS = new Set([
    "read_project",
    "read_stage_status",
    "read_story_bible",
    "read_characters",
    "read_relationships",
    "read_novel_outline",
    "read_volume_outline",
    "list_chapters",
    "read_chapters",
    "read_chapter_events",
    "read_story_skeleton",
    "read_adaptation_strategy",
    "list_episodes",
    "read_episode_outline",
    "read_episode_script",
    "read_review_report",
    "read_director_plan",
    "read_storyboard",
    "read_asset_prompts",
    "find_script_block",
    "grep_script",
    "save_project_parameters",
    "save_creative_positioning",
    "save_world_building",
    "upsert_character",
    "upsert_relationship",
    "save_short_story_outline",
    "save_short_story",
    "save_novel_outline",
    "save_volume_outline",
    "save_chapter_outlines",
    "save_chapter",
    "save_chapter_events",
    "save_story_skeleton",
    "save_adaptation_strategy",
    "save_episode_outlines",
    "save_episode_script",
    "save_review_revision",
    "save_review_report",
    "save_director_plan",
    "save_storyboard_shots",
    "upsert_asset_prompt",
    "edit_script_blocks",
    "dispatch_agent",
    "report_progress",
    "request_stage_confirmation",
    "mark_item_failed",
    "retry_failed_items",
    "stop_run",
]);
export const SCRIPT_AGENT_TOOL_NAMES_V2 = [...ALLOWED_SCRIPT_TOOLS];

export function validateScriptToolCall(name: string, input: unknown): Record<string, unknown> {
    if (!ALLOWED_SCRIPT_TOOLS.has(name)) throw new Error("剧本 Agent 不允许调用该 Tool");
    const value = record(input);
    if (name === "save_chapter") return { ...value, chapterNumbers: normalizeChapterSelection(value.chapterNumbers) };
    return value;
}

export function normalizeScriptShots(episodeId: string, value: unknown): PracticeScriptShot[] {
    if (!episodeId.trim() || !Array.isArray(value)) throw new Error("文字分镜格式无效");
    const seen = new Set<string>();
    return value.map((entry) => {
        const row = record(entry);
        const sceneId = required(row.sceneId, "场景 ID");
        const shotNumber = positive(row.shotNumber, "镜头序号");
        const identity = `${sceneId}:${shotNumber}`;
        if (seen.has(identity)) throw new Error("同一场景镜头序号不能重复");
        seen.add(identity);
        return {
            id: optional(row.id) || randomUUID(),
            episodeId,
            sceneId,
            shotNumber,
            visualDescription: required(row.visualDescription, "画面描述"),
            shotSize: required(row.shotSize, "景别"),
            cameraAngle: required(row.cameraAngle, "机位"),
            composition: required(row.composition, "构图"),
            cameraMovement: required(row.cameraMovement, "运镜"),
            characterIds: strings(row.characterIds),
            action: required(row.action, "动作"),
            emotion: required(row.emotion, "情绪"),
            dialogue: optional(row.dialogue),
            narration: optional(row.narration),
            soundNote: optional(row.soundNote),
            durationSeconds: positiveNumber(row.durationSeconds, "镜头时长"),
            continuityNote: optional(row.continuityNote),
            characterAssetIds: strings(row.characterAssetIds),
            locationAssetId: optional(row.locationAssetId),
            propAssetIds: strings(row.propAssetIds),
        };
    });
}

export type NormalizedPromptAsset = { assetType: "character" | "location" | "prop"; canonicalName: string; basePrompt: string; aliases: string[]; variants: unknown[] };
export function normalizePromptAssets(value: unknown): NormalizedPromptAsset[] {
    if (!Array.isArray(value)) throw new Error("资产提示词格式无效");
    const result = new Map<string, NormalizedPromptAsset>();
    for (const entry of value) {
        const row = record(entry);
        const assetType = row.type === "character" || row.type === "location" || row.type === "prop" ? row.type : undefined;
        const canonicalName = required(row.name, "资产名称");
        if (!assetType) throw new Error("资产类型无效");
        const current: NormalizedPromptAsset = { assetType, canonicalName, basePrompt: required(row.prompt, "资产提示词"), aliases: strings(row.aliases), variants: Array.isArray(row.variants) ? row.variants : [] };
        result.set(`${assetType}:${canonicalName.toLocaleLowerCase()}`, current);
    }
    return [...result.values()];
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function optional(value: unknown) {
    return typeof value === "string" ? value.trim() || undefined : undefined;
}
function required(value: unknown, label: string) {
    const text = optional(value);
    if (!text) throw new Error(`${label}不能为空`);
    return text;
}
function strings(value: unknown) {
    return Array.isArray(value)
        ? [
              ...new Set(
                  value
                      .filter((item): item is string => typeof item === "string")
                      .map((item) => item.trim())
                      .filter(Boolean),
              ),
          ]
        : [];
}
function positive(value: unknown, label: string) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label}必须为正整数`);
    return number;
}
function positiveNumber(value: unknown, label: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new Error(`${label}必须大于 0`);
    return number;
}
