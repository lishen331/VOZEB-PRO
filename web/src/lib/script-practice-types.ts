export const SCRIPT_BLOCK_TYPES = ["scene-heading", "action", "character", "parenthetical", "dialogue", "transition", "note"] as const;
export type ScriptBlockType = (typeof SCRIPT_BLOCK_TYPES)[number];
export type ScriptBlock = { id: string; type: ScriptBlockType; text: string };
export type ScriptSourceType = "idea" | "fountain" | "fdx" | "text" | "markdown";
export type ScriptProjectStatus = "draft" | "writing" | "completed";
export type ScriptStageKey = "idea" | "synopsis" | "outline" | "entities" | "scenes" | "screenplay" | "revision";
export type ScriptStageStatus = "not_started" | "draft" | "generating" | "awaiting_review" | "confirmed" | "failed" | "stale";
export type ScriptAgentOperation =
    "generate_synopsis" | "generate_outline" | "generate_entities" | "generate_scenes" | "generate_screenplay" | "rewrite_selection" | "expand_selection" | "polish_selection" | "enhance_conflict" | "check_continuity" | "validate_format";
export type ScriptFormatOptions = { projectId?: string; documentId?: string; version?: number; now?: string };
export type ScriptDocument = { id: string; projectId: string; format: "structured"; blocks: ScriptBlock[]; version: number; schemaVersion: 1; createdAt: string; updatedAt: string };
export type ScriptEntityType = "character" | "location" | "episode" | "scene" | "beat";
export type ScriptEntity = { id: string; projectId: string; type: ScriptEntityType; name: string; description?: string; metadata?: Record<string, unknown> };
export type ScriptPracticeProject = {
    id: string;
    userId: string;
    title: string;
    genre?: string;
    logline?: string;
    synopsis?: string;
    status: ScriptProjectStatus;
    sourceType: ScriptSourceType;
    currentVersionId?: string;
    createdAt: string;
    updatedAt: string;
};
export type ScriptStage = { projectId: string; key: ScriptStageKey; status: ScriptStageStatus; draft?: unknown; confirmed?: unknown; error?: string; updatedAt: string };
export type ScriptVersion = { id: string; projectId: string; documentSnapshot: ScriptDocument; source: "user" | "ai" | "import" | "restore"; operation?: string; parentVersionId?: string; createdAt: string };
