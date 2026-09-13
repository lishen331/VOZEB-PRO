export const SCRIPT_PROJECT_MODES = ["short_story", "long_novel"] as const;
export const SCRIPT_CARRIERS = ["tvc", "vlog", "vertical_short", "horizontal_short", "motion_comic"] as const;
export type ScriptCarrier = (typeof SCRIPT_CARRIERS)[number];
export function normalizeScriptCarrier(value: unknown): ScriptCarrier {
    const normalized =
        typeof value === "string"
            ? value
                  .trim()
                  .toLowerCase()
                  .replace(/[\s_-]+/g, "_")
            : "";
    if (normalized === "tvc") return "tvc";
    if (normalized === "vlog") return "vlog";
    if (normalized === "vertical_short" || normalized === "horizontal_short" || normalized === "motion_comic") return normalized;
    return "vlog";
}
export type ScriptProjectMode = (typeof SCRIPT_PROJECT_MODES)[number];

export const SCRIPT_AGENT_KEYS = ["orchestrator", "novel_planner", "novel_writer", "chapter_analyst", "story_skeleton", "adaptation_planner", "script_writer", "script_supervisor", "director_planner", "storyboard_writer", "asset_prompt_writer"] as const;
export type ScriptAgentKey = (typeof SCRIPT_AGENT_KEYS)[number];

export const SCRIPT_ARTIFACT_ORDER = ["creative_positioning", "world_building", "short_story", "chapter_outlines", "story_skeleton", "adaptation_strategy", "episode_scripts", "review_report", "director_plan", "text_storyboard", "asset_prompts"] as const;
const SCRIPT_ARTIFACT_ORDER_INDEX = new Map<string, number>(SCRIPT_ARTIFACT_ORDER.map((value, index) => [value, index]));
export function compareScriptArtifactTypes(left: string, right: string) {
    return (SCRIPT_ARTIFACT_ORDER_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER) - (SCRIPT_ARTIFACT_ORDER_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right);
}
export function sortScriptArtifactTypes(types: string[]) {
    return [...types].sort(compareScriptArtifactTypes);
}

export const SCRIPT_ARTIFACT_TYPES = [
    "conversation",
    "creative_positioning",
    "world_building",
    "short_story_outline",
    "short_story",
    "novel_outline",
    "volume_outline",
    "chapter_outlines",
    "story_skeleton",
    "adaptation_strategy",
    "episode_outlines",
    "episode_scripts",
    "review_report",
    "director_plan",
    "text_storyboard",
    "asset_prompts",
] as const;
export type ScriptArtifactType = (typeof SCRIPT_ARTIFACT_TYPES)[number];

export const SCRIPT_RUN_TYPES = [
    "conversation",
    "project_planning",
    "short_story",
    "novel_outlines",
    "novel_chapters",
    "chapter_analysis",
    "adaptation_bundle",
    "episode_scripts",
    "script_review",
    "director_plan",
    "text_storyboard",
    "asset_prompts",
] as const;
export type ScriptRunType = (typeof SCRIPT_RUN_TYPES)[number];

export const SCRIPT_RUN_STATUSES = ["planning", "running", "waiting_confirmation", "partial_failed", "success", "failed", "stopped"] as const;
export type ScriptRunStatus = (typeof SCRIPT_RUN_STATUSES)[number];
export const SCRIPT_RUN_ITEM_STATUSES = ["queued", "running", "success", "failed", "stopped"] as const;
export type ScriptRunItemStatus = (typeof SCRIPT_RUN_ITEM_STATUSES)[number];

export const SCRIPT_RUN_EVENT_TYPES = [
    "run_started",
    "agent_started",
    "progress",
    "assistant_delta",
    "tool_started",
    "tool_progress",
    "tool_completed",
    "artifact_delta",
    "artifact_saved",
    "item_started",
    "item_progress",
    "item_completed",
    "item_failed",
    "agent_completed",
    "stage_waiting_confirmation",
    "run_partial_failed",
    "run_completed",
    "run_stopped",
    "error",
    "heartbeat",
] as const;
export type ScriptRunEventType = (typeof SCRIPT_RUN_EVENT_TYPES)[number];

export type ScriptRunEvent = { runId: string; sequence: number; type: ScriptRunEventType; occurredAt: string; data: Record<string, unknown> };

export type PracticeScriptShot = {
    id: string;
    episodeId: string;
    sceneId: string;
    shotNumber: number;
    visualDescription: string;
    shotSize: string;
    cameraAngle: string;
    composition: string;
    cameraMovement: string;
    characterIds: string[];
    action: string;
    emotion: string;
    dialogue?: string;
    narration?: string;
    soundNote?: string;
    durationSeconds: number;
    continuityNote?: string;
    characterAssetIds: string[];
    locationAssetId?: string;
    propAssetIds: string[];
};

export const isScriptAgentKey = (value: unknown): value is ScriptAgentKey => includes(SCRIPT_AGENT_KEYS, value);
export const isScriptArtifactType = (value: unknown): value is ScriptArtifactType => includes(SCRIPT_ARTIFACT_TYPES, value);
export const isScriptRunType = (value: unknown): value is ScriptRunType => includes(SCRIPT_RUN_TYPES, value);
export const isScriptRunEventType = (value: unknown): value is ScriptRunEventType => includes(SCRIPT_RUN_EVENT_TYPES, value);

export function normalizeChapterSelection(value: unknown): number[] {
    if (!Array.isArray(value)) throw new Error("每次请选择 1–5 章");
    const chapters = [...new Set(value.map(Number))].sort((left, right) => left - right);
    if (!chapters.length || chapters.length > 5) throw new Error("每次请选择 1–5 章");
    if (chapters.some((chapter) => !Number.isSafeInteger(chapter) || chapter <= 0)) throw new Error("章节编号必须为正整数");
    return chapters;
}

function includes<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
    return typeof value === "string" && (values as readonly string[]).includes(value);
}
