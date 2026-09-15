import { randomUUID } from "node:crypto";
import type { PracticeTenantScope } from "./practice-tenant-scope";
import type { ScriptRunType } from "./script-agent-domain";
import { ScriptAgentRepository } from "./database/script-agent-repository";
import { nextShortFilmRunType } from "./script-agent-executor";

type Prerequisite = { any?: string[]; all?: string[]; confirmed?: string[] };
const PREREQUISITE: Partial<Record<ScriptRunType, Prerequisite>> = {
    short_story: { confirmed: ["creative_positioning"] },
    adaptation_bundle: { any: ["short_story", "chapter_outlines"], confirmed: ["short_story|chapter_outlines"] },
    episode_scripts: { confirmed: ["adaptation_strategy"] },
    script_review: { all: ["episode_scripts"] },
    director_plan: { confirmed: ["review_report"] },
    text_storyboard: { all: ["review_report", "director_plan"], confirmed: ["review_report", "director_plan"] },
    asset_prompts: { all: ["text_storyboard"], confirmed: ["text_storyboard"] },
};
export class ScriptAgentRunService {
    constructor(
        private readonly repository: ScriptAgentRepository,
        private readonly id: () => string = randomUUID,
    ) {}

    async create(scope: PracticeTenantScope, input: { projectId: string; chatSessionId?: string; runType: ScriptRunType; stageKey?: string; clientRequestId: string; configSnapshot?: Record<string, unknown> }) {
        return this.createInternal(scope, input, false);
    }

    async createAfterConfirmation(scope: PracticeTenantScope, input: { projectId: string; chatSessionId?: string; runType: ScriptRunType; stageKey?: string; clientRequestId: string; configSnapshot?: Record<string, unknown> }) {
        return this.createInternal(scope, input, true);
    }

    private async createInternal(
        scope: PracticeTenantScope,
        input: { projectId: string; chatSessionId?: string; runType: ScriptRunType; stageKey?: string; clientRequestId: string; configSnapshot?: Record<string, unknown> },
        trustedConfirmation: boolean,
    ) {
        const regeneration = input.configSnapshot?.regeneration;
        if (regeneration && typeof regeneration === "object" && "listLatestArtifacts" in this.repository) {
            const artifacts = await this.repository.listLatestArtifacts(scope, input.projectId);
            const requestedArtifactId = typeof (regeneration as Record<string, unknown>).artifactId === "string" ? String((regeneration as Record<string, unknown>).artifactId) : "";
            const requestedStage = typeof (regeneration as Record<string, unknown>).stageKey === "string" ? String((regeneration as Record<string, unknown>).stageKey) : "";
            const current = artifacts.find((row: Record<string, unknown>) => String(row.id) === requestedArtifactId);
            const stageRunTypes: Record<string, ScriptRunType> = {
                creative_positioning: "project_planning",
                short_story: "short_story",
                adaptation_strategy: "adaptation_bundle",
                review_report: "script_review",
                director_plan: "director_plan",
                text_storyboard: "text_storyboard",
                asset_prompts: "asset_prompts",
            };
            if (!current || String(current.artifact_type) !== requestedStage || current.status !== "awaiting_review" || stageRunTypes[requestedStage] !== input.runType) throw new ScriptAgentRunError("当前阶段已确认或成果不存在，无法重新生成", 409);
        }
        const required = PREREQUISITE[input.runType];
        if (required && "listLatestArtifacts" in this.repository) {
            const artifacts = await this.repository.listLatestArtifacts(scope, input.projectId);
            const available = new Set(artifacts.map((row: Record<string, unknown>) => String(row.artifact_type)));
            const confirmed = new Set(artifacts.filter((row: Record<string, unknown>) => row.status === "confirmed").map((row: Record<string, unknown>) => String(row.artifact_type)));
            const anySatisfied = !required.any?.length || required.any.some((type) => available.has(type));
            const allSatisfied = !required.all?.length || required.all.every((type) => available.has(type));
            const confirmedSatisfied = !required.confirmed?.length || required.confirmed.every((group) => group.split("|").some((type) => confirmed.has(type)));
            const isRegeneration = Boolean(regeneration && typeof regeneration === "object");
            const expected = nextShortFilmRunType(artifacts);
            const isWorkflowStage = ["short_story", "novel_outlines", "adaptation_bundle", "episode_scripts", "director_plan"].includes(input.runType);
            const automaticStage = ["script_review", "text_storyboard", "asset_prompts"].includes(input.runType);
            const directAutomaticCall = automaticStage;
            if (!trustedConfirmation && !isRegeneration && (!anySatisfied || !allSatisfied || !confirmedSatisfied || (isWorkflowStage && available.has("creative_positioning") && expected && input.runType !== expected) || directAutomaticCall))
                throw new ScriptAgentRunError("请按工作目录顺序完成当前步骤", 409);
        }
        const run = await this.repository.createRun(scope, {
            id: this.id(),
            projectId: input.projectId,
            chatSessionId: input.chatSessionId,
            runType: input.runType,
            stageKey: input.stageKey,
            clientRequestId: input.clientRequestId,
            configSnapshot: input.configSnapshot || {},
        });
        if (!run) throw new ScriptAgentRunError("剧本项目不存在或不属于当前学校", 404);
        if (run.lastEventSequence === 0 && "createRunItem" in this.repository) await this.repository.createRunItem(scope, input.projectId, { id: this.id(), runId: run.id, itemType: "run", itemKey: "main", status: "queued", attemptNo: 0 });
        if (run.lastEventSequence === 0) await this.repository.appendRunEvent(scope, input.projectId, run.id, "run_started", { runType: run.runType, stageKey: run.stageKey }, this.id());
        return run;
    }

    async stop(scope: PracticeTenantScope, projectId: string, runId: string) {
        const run = await this.repository.getRun(scope, projectId, runId);
        if (!run) throw new ScriptAgentRunError("剧本 Run 不存在", 404);
        if (["success", "failed", "stopped"].includes(run.status)) return run;
        const updated = await this.repository.updateRun(scope, projectId, runId, { status: "stopped", completedAt: new Date().toISOString() });
        await this.repository.appendRunEvent(scope, projectId, runId, "run_stopped", {}, this.id());
        return updated || { ...run, status: "stopped" as const };
    }

    async retryFailed(scope: PracticeTenantScope, projectId: string, runId: string) {
        const run = await this.repository.getRun(scope, projectId, runId);
        if (!run) throw new ScriptAgentRunError("剧本 Run 不存在", 404);
        const failed = await this.repository.listRunItems(scope, projectId, runId, "failed");
        const queued = [];
        for (const item of latestItems(failed)) {
            const retry = await this.repository.createRunItem(scope, projectId, { ...item, id: this.id(), status: "queued", attemptNo: item.attemptNo + 1, artifactId: undefined, errorCode: undefined, errorMessage: undefined });
            if (retry) queued.push(retry);
        }
        if (queued.length) await this.repository.updateRun(scope, projectId, runId, { status: "planning", completedAt: undefined, errorCode: undefined, errorMessage: undefined });
        return queued;
    }
}

function latestItems<T extends { itemType: string; itemKey: string; attemptNo: number }>(items: T[]) {
    const latest = new Map<string, T>();
    for (const item of items) {
        const key = `${item.itemType}:${item.itemKey}`;
        const previous = latest.get(key);
        if (!previous || previous.attemptNo < item.attemptNo) latest.set(key, item);
    }
    return [...latest.values()];
}
export class ScriptAgentRunError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
