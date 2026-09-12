import { randomUUID } from "node:crypto";
import { extractJsonObjectText } from "./structured-model-output";
import { requestStructuredText } from "./text-planning-runtime";
import { systemAiBillingHeaders, systemAiIdempotencyKey } from "./system-ai-billing";
import { ScriptAgentProfileService, type ResolvedScriptAgentProfile } from "./script-agent-profiles";
import type { PracticeTenantScope } from "./practice-tenant-scope";
import type { ScriptAgentKey, ScriptArtifactType, ScriptRunEventType, ScriptRunType } from "./script-agent-domain";
import { normalizePromptAssets, normalizeScriptShots } from "./script-agent-tools-v2";
import { ScriptAgentRepository } from "./database/script-agent-repository";

const EXECUTION: Record<ScriptRunType, { agent: ScriptAgentKey; artifact: ScriptArtifactType; key: string; confirmation: boolean }> = {
    conversation: { agent: "orchestrator", artifact: "creative_positioning", key: "conversation", confirmation: false },
    project_planning: { agent: "novel_planner", artifact: "creative_positioning", key: "project", confirmation: true },
    short_story: { agent: "novel_writer", artifact: "short_story", key: "main", confirmation: true },
    novel_outlines: { agent: "novel_planner", artifact: "chapter_outlines", key: "all", confirmation: true },
    novel_chapters: { agent: "novel_writer", artifact: "chapter_outlines", key: "selected", confirmation: false },
    chapter_analysis: { agent: "chapter_analyst", artifact: "chapter_outlines", key: "events", confirmation: false },
    adaptation_bundle: { agent: "adaptation_planner", artifact: "adaptation_strategy", key: "main", confirmation: true },
    episode_scripts: { agent: "script_writer", artifact: "episode_scripts", key: "all", confirmation: false },
    script_review: { agent: "script_supervisor", artifact: "review_report", key: "main", confirmation: true },
    director_plan: { agent: "director_planner", artifact: "director_plan", key: "main", confirmation: false },
    text_storyboard: { agent: "storyboard_writer", artifact: "text_storyboard", key: "all", confirmation: false },
    asset_prompts: { agent: "asset_prompt_writer", artifact: "asset_prompts", key: "library", confirmation: false },
};
export type ScriptExecutionInput = { projectId: string; runId: string; runType: ScriptRunType; input: Record<string, unknown>; origin: string; cookie: string };
type Deps = {
    resolveProfile: (agent: ScriptAgentKey, skills?: string[]) => Promise<ResolvedScriptAgentProfile>;
    callModel: (input: { profile: ResolvedScriptAgentProfile; task: ScriptExecutionInput; onDelta?: (value: string) => Promise<void> }) => Promise<Record<string, unknown>>;
    saveArtifact: (
        scope: PracticeTenantScope,
        input: { id: string; projectId: string; artifactType: string; artifactKey: string; status: string; content: Record<string, unknown>; contentText?: string; sourceRunId: string },
    ) => Promise<{ id?: unknown } | null>;
    replaceChapters?: ScriptAgentRepository["replaceChapters"];
    replaceEpisodes?: ScriptAgentRepository["replaceEpisodes"];
    replaceShots?: ScriptAgentRepository["replaceShots"];
    upsertPromptAssets?: ScriptAgentRepository["upsertPromptAssets"];
    appendEvent: (scope: PracticeTenantScope, projectId: string, runId: string, type: ScriptRunEventType, data: Record<string, unknown>, eventId: string) => Promise<unknown>;
};
export class ScriptAgentExecutor {
    constructor(
        private readonly deps: Deps,
        private readonly id: () => string = randomUUID,
    ) {}
    async execute(scope: PracticeTenantScope, task: ScriptExecutionInput) {
        const execution = EXECUTION[task.runType];
        const selectedSkills = Array.isArray(task.input.skillIds) ? task.input.skillIds.filter((value): value is string => typeof value === "string") : [];
        const profile = await this.deps.resolveProfile(execution.agent, selectedSkills);
        await this.deps.appendEvent(scope, task.projectId, task.runId, "agent_started", { agentKey: execution.agent, name: profile.profile.name }, this.id());
        await this.deps.appendEvent(scope, task.projectId, task.runId, "assistant_delta", { agentKey: execution.agent, delta: `${profile.profile.name}已开始处理当前任务。` }, this.id());
        const structured = await this.deps.callModel({
            profile,
            task,
            onDelta: async (value) => {
                await this.deps.appendEvent(scope, task.projectId, task.runId, "artifact_delta", { artifactType: execution.artifact, artifactKey: execution.key, delta: value }, this.id());
            },
        });
        await materializeStructuredRows(this.deps, scope, task, structured);
        const artifactId = this.id();
        const artifact = await this.deps.saveArtifact(scope, {
            id: artifactId,
            projectId: task.projectId,
            artifactType: execution.artifact,
            artifactKey: execution.key,
            status: execution.confirmation ? "awaiting_review" : "draft",
            content: structured,
            contentText: publicText(structured),
            sourceRunId: task.runId,
        });
        if (!artifact?.id) throw new Error("剧本成果保存失败");
        await this.deps.appendEvent(scope, task.projectId, task.runId, "artifact_saved", { artifactId, artifactType: execution.artifact, artifactKey: execution.key }, this.id());
        await this.deps.appendEvent(scope, task.projectId, task.runId, "agent_completed", { agentKey: execution.agent }, this.id());
        await this.deps.appendEvent(scope, task.projectId, task.runId, "assistant_delta", { agentKey: execution.agent, delta: `${profile.profile.name}已完成并保存成果。` }, this.id());
        if (execution.confirmation) await this.deps.appendEvent(scope, task.projectId, task.runId, "stage_waiting_confirmation", { artifactId, artifactType: execution.artifact }, this.id());
        return { artifactId: String(artifact.id), artifactType: execution.artifact, artifactKey: execution.key, structured };
    }
}
export function createDefaultScriptAgentExecutor(repository: ScriptAgentRepository) {
    const profiles = new ScriptAgentProfileService();
    return new ScriptAgentExecutor({
        resolveProfile: (agent, skills) => profiles.resolve(agent, skills),
        callModel: callConfiguredModel,
        saveArtifact: (scope, input) => repository.saveArtifact(scope, input),
        replaceChapters: (...args) => repository.replaceChapters(...args),
        replaceEpisodes: (...args) => repository.replaceEpisodes(...args),
        replaceShots: (...args) => repository.replaceShots(...args),
        upsertPromptAssets: (...args) => repository.upsertPromptAssets(...args),
        appendEvent: (scope, projectId, runId, type, data, eventId) => repository.appendRunEvent(scope, projectId, runId, type, data, eventId),
    });
}
async function callConfiguredModel(input: { profile: ResolvedScriptAgentProfile; task: ScriptExecutionInput; onDelta?: (value: string) => Promise<void> }) {
    const requestId = systemAiIdempotencyKey("script-agent", input.task.runId, input.profile.profile.agentKey, String(input.profile.profile.version));
    const call = await requestStructuredText({
        origin: input.task.origin,
        cookie: input.task.cookie,
        candidate: input.profile.candidate,
        messages: [
            { role: "system", content: `${input.profile.instructions}\n只输出公开成果，不输出思维链。` },
            { role: "user", content: JSON.stringify(input.task.input) },
        ],
        tool: { name: `save_${input.task.runType}`, description: "保存当前剧本阶段的结构化公开成果", parameters: { type: "object", additionalProperties: true } },
        headers: { "Idempotency-Key": requestId, "X-Client-Request-Id": requestId, ...systemAiBillingHeaders(input.profile.candidate.logicalModelId, requestId, input.profile.candidate.upstreamModel, "open-source-practice") },
        stream: true,
        streamFallback: true,
        allowNaturalLanguage: true,
        preferNativeTools: true,
        onStreamDelta: input.onDelta,
    });
    const text = call.arguments.trim();
    const jsonText = extractJsonObjectText(text);
    if (jsonText) return JSON.parse(jsonText) as Record<string, unknown>;
    return { content: text };
}
function publicText(value: Record<string, unknown>) {
    for (const key of ["content", "text", "story", "screenplay", "outline", "report"]) if (typeof value[key] === "string") return value[key] as string;
    return undefined;
}

async function materializeStructuredRows(deps: Deps, scope: PracticeTenantScope, task: ScriptExecutionInput, structured: Record<string, unknown>) {
    if ((task.runType === "novel_outlines" || task.runType === "novel_chapters") && Array.isArray(structured.chapters) && deps.replaceChapters) {
        const chapters = structured.chapters.map((value, index) => {
            const row = record(value);
            return { chapterIndex: Number(row.chapterIndex || index + 1), title: String(row.title || `第${index + 1}章`), outline: record(row.outline), content: typeof row.content === "string" ? row.content : undefined };
        });
        await deps.replaceChapters(scope, task.projectId, task.runId, chapters);
    }
    if ((task.runType === "adaptation_bundle" || task.runType === "episode_scripts") && Array.isArray(structured.episodes) && deps.replaceEpisodes) {
        const episodes = structured.episodes.map((value, index) => {
            const row = record(value);
            return { episodeNumber: Number(row.episodeNumber || row.episodeIndex || index + 1), title: String(row.title || `第${index + 1}集`), outline: record(row.outline), script: record(row.script || row.screenplay) };
        });
        await deps.replaceEpisodes(scope, task.projectId, task.runId, episodes);
    }
    if (task.runType === "text_storyboard" && Array.isArray(structured.shots) && deps.replaceShots) {
        const episodeId = typeof structured.episodeId === "string" ? structured.episodeId : typeof task.input.episodeId === "string" ? task.input.episodeId : "";
        await deps.replaceShots(scope, task.projectId, task.runId, normalizeScriptShots(episodeId, structured.shots) as unknown as Array<Record<string, unknown>>);
    }
    if (task.runType === "asset_prompts" && Array.isArray(structured.assets) && deps.upsertPromptAssets) await deps.upsertPromptAssets(scope, task.projectId, task.runId, normalizePromptAssets(structured.assets));
}
function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
