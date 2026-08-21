/**
 * Contract for the isolated drama workflow lab. It is intentionally free of
 * persistence and UI concerns so the server gate and client navigation share
 * one small, testable definition.
 */

export const DRAMA_WORKFLOW_LAB_ENV = "VOZEB_PRO_DRAMA_WORKFLOW_LAB" as const;

export const DRAMA_WORKFLOW_LAB_STAGES = [
    { id: "script", label: "剧本", description: "生成或导入剧本" },
    { id: "assets", label: "资产准备", description: "整理角色、场景、道具与线索" },
    { id: "storyboard", label: "分镜", description: "规划镜头与画面节奏" },
    { id: "shots", label: "镜头生成", description: "生成并复核镜头素材" },
    { id: "review", label: "内容审核", description: "由 AI 审核已生成的创作素材并定位问题" },
    { id: "export", label: "成片导出", description: "合成并导出成片" },
] as const;

export type DramaWorkflowLabStage = (typeof DRAMA_WORKFLOW_LAB_STAGES)[number];
export type DramaWorkflowLabStageId = DramaWorkflowLabStage["id"];
export type DramaWorkflowLabStageStatus = "pending" | "active" | "completed";

export type DramaWorkflowLabProgress = {
    activeStageId: DramaWorkflowLabStageId;
    completedStageIds: ReadonlySet<DramaWorkflowLabStageId>;
};

const ENABLED_FLAG_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const DISABLED_FLAG_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

/** Parse the deliberately small set of boolean values accepted by deployment envs. */
export function parseDramaWorkflowLabFlag(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    if (typeof value !== "string") return false;

    const normalized = value.trim().toLowerCase();
    if (ENABLED_FLAG_VALUES.has(normalized)) return true;
    if (DISABLED_FLAG_VALUES.has(normalized)) return false;
    return false;
}

/** Resolve an explicit flag. Missing and unknown values stay disabled. */
export function isDramaWorkflowLabEnabled(value: unknown = false): boolean {
    return parseDramaWorkflowLabFlag(value);
}

export function getDramaWorkflowLabStage(stageId: string | null | undefined): DramaWorkflowLabStage | undefined {
    return DRAMA_WORKFLOW_LAB_STAGES.find((stage) => stage.id === stageId);
}

export function getDramaWorkflowLabStageIndex(stageId: string | null | undefined): number {
    return DRAMA_WORKFLOW_LAB_STAGES.findIndex((stage) => stage.id === stageId);
}

/** Completed ids take precedence over the currently selected stage. */
export function getDramaWorkflowLabStageStatus(stageId: DramaWorkflowLabStageId, activeStageId?: DramaWorkflowLabStageId | null, completedStageIds: ReadonlySet<DramaWorkflowLabStageId> = new Set()): DramaWorkflowLabStageStatus {
    if (completedStageIds.has(stageId)) return "completed";
    if (activeStageId === stageId) return "active";
    return "pending";
}

/** Keep the first milestone that is not complete as the lab's current stage. */
export function getDramaWorkflowLabProgress(input: { hasScript: boolean; reviewed: boolean; hasAssets: boolean; hasStoryboard: boolean; hasGeneratedShot: boolean; exported: boolean }): DramaWorkflowLabProgress {
    const completedStageIds = new Set<DramaWorkflowLabStageId>();
    const milestones: Array<[DramaWorkflowLabStageId, boolean]> = [
        ["script", input.hasScript],
        ["assets", input.hasAssets],
        ["storyboard", input.hasStoryboard],
        ["shots", input.hasGeneratedShot],
        ["review", input.reviewed],
        ["export", input.exported],
    ];
    for (const [stageId, complete] of milestones) {
        if (!complete) break;
        completedStageIds.add(stageId);
    }
    const activeStageId = DRAMA_WORKFLOW_LAB_STAGES.find((stage) => !completedStageIds.has(stage.id))?.id || "export";
    return { activeStageId, completedStageIds };
}
