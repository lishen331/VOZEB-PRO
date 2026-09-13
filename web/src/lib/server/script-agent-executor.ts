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
    conversation: { agent: "orchestrator", artifact: "conversation", key: "latest", confirmation: false },
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
export type ScriptExecutionInput = { projectId: string; runId: string; chatSessionId?: string; runType: ScriptRunType; input: Record<string, unknown>; origin: string; cookie: string };
type Deps = {
    resolveProfile: (agent: ScriptAgentKey, skills?: string[]) => Promise<ResolvedScriptAgentProfile>;
    callModel: (input: { profile: ResolvedScriptAgentProfile; task: ScriptExecutionInput; responseSchema: Record<string, unknown>; onDelta?: (delta: string) => Promise<void> }) => Promise<Record<string, unknown>>;
    listArtifacts?: ScriptAgentRepository["listLatestArtifacts"];
    saveChatMessage?: ScriptAgentRepository["saveChatMessage"];
    saveArtifact: (
        scope: PracticeTenantScope,
        input: { id: string; projectId: string; artifactType: string; artifactKey: string; status: string; content: Record<string, unknown>; contentText?: string; sourceRunId: string },
    ) => Promise<{ id?: unknown } | null>;
    replaceChapters?: ScriptAgentRepository["replaceChapters"];
    replaceEpisodes?: ScriptAgentRepository["replaceEpisodes"];
    replaceShots?: ScriptAgentRepository["replaceShots"];
    replaceStoryboardEpisodes?: ScriptAgentRepository["replaceStoryboardEpisodes"];
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
        const context = this.deps.listArtifacts ? await this.deps.listArtifacts(scope, task.projectId) : [];
        const enrichedTask = { ...task, input: { ...task.input, context: context.map(publicArtifactContext) } };
        const structured = await this.deps.callModel({
            profile,
            task: enrichedTask,
            responseSchema: responseSchemaFor(task.runType),
            onDelta: async (delta) => {
                await this.deps.appendEvent(scope, task.projectId, task.runId, "artifact_delta", { artifactType: execution.artifact, artifactKey: execution.key, delta }, this.id());
            },
        });
        await materializeStructuredRows(this.deps, scope, task, structured);
        if (task.runType === "conversation" && task.chatSessionId && this.deps.saveChatMessage) {
            await this.deps.saveChatMessage(scope, { id: this.id(), sessionId: task.chatSessionId, projectId: task.projectId, role: "assistant", agentKey: execution.agent, publicContent: publicText(structured) || "", sourceRunId: task.runId });
        }
        const artifactId = this.id();
        const artifact = await this.deps.saveArtifact(scope, {
            id: artifactId,
            projectId: task.projectId,
            artifactType: execution.artifact,
            artifactKey: execution.key,
            status: execution.confirmation ? "awaiting_review" : "draft",
            content: structured,
            contentText: formatVisibleArtifact(task.runType, structured),
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
        listArtifacts: (...args) => repository.listLatestArtifacts(...args),
        saveChatMessage: (...args) => repository.saveChatMessage(...args),
        saveArtifact: (scope, input) => repository.saveArtifact(scope, input),
        replaceChapters: (...args) => repository.replaceChapters(...args),
        replaceEpisodes: (...args) => repository.replaceEpisodes(...args),
        replaceShots: (...args) => repository.replaceShots(...args),
        replaceStoryboardEpisodes: (...args) => repository.replaceStoryboardEpisodes(...args),
        upsertPromptAssets: (...args) => repository.upsertPromptAssets(...args),
        appendEvent: (scope, projectId, runId, type, data, eventId) => repository.appendRunEvent(scope, projectId, runId, type, data, eventId),
    });
}
async function callConfiguredModel(input: { profile: ResolvedScriptAgentProfile; task: ScriptExecutionInput; responseSchema: Record<string, unknown>; onDelta?: (value: string) => Promise<void> }) {
    const requestId = systemAiIdempotencyKey("script-agent", input.task.runId, input.profile.profile.agentKey, String(input.profile.profile.version));
    const call = await requestStructuredText({
        origin: input.task.origin,
        cookie: input.task.cookie,
        candidate: input.profile.candidate,
        messages: [
            { role: "system", content: `${input.profile.instructions}\n只输出公开成果，不输出思维链。` },
            { role: "user", content: JSON.stringify(input.task.input) },
        ],
        tool: { name: `save_${input.task.runType}`, description: "保存当前剧本阶段的结构化公开成果", parameters: input.responseSchema },
        headers: { "Idempotency-Key": requestId, "X-Client-Request-Id": requestId, ...systemAiBillingHeaders(input.profile.candidate.logicalModelId, requestId, input.profile.candidate.upstreamModel, "open-source-practice") },
        stream: true,
        streamFallback: true,
        allowNaturalLanguage: true,
        preferNativeTools: true,
        onStreamDelta: input.onDelta ? accumulatedDeltaEmitter(input.onDelta) : undefined,
    });
    const text = call.arguments.trim();
    const jsonText = extractJsonObjectText(text);
    if (jsonText) return JSON.parse(jsonText) as Record<string, unknown>;
    return { content: text };
}
function accumulatedDeltaEmitter(onDelta: (delta: string) => Promise<void>) {
    let previous = "";
    return async (accumulated: string) => {
        const delta = accumulated.startsWith(previous) ? accumulated.slice(previous.length) : accumulated;
        previous = accumulated;
        if (delta) await onDelta(delta);
    };
}
function formatVisibleArtifact(runType: ScriptRunType, value: Record<string, unknown>) {
    if (runType === "episode_scripts" && Array.isArray(value.episodes)) {
        return value.episodes
            .map((entry) => {
                const episode = record(entry);
                const script = record(episode.script);
                const blocks = Array.isArray(script.blocks)
                    ? script.blocks
                          .map((block) => record(block).text)
                          .filter((text): text is string => typeof text === "string")
                          .join("\n\n")
                    : "";
                return "## 第" + String(episode.episodeNumber || "") + "集：" + String(episode.title || "") + "\n\n" + blocks;
            })
            .join("\n\n---\n\n");
    }
    if (runType === "text_storyboard" && Array.isArray(value.episodes)) {
        return value.episodes
            .map((entry) => {
                const episode = record(entry);
                const rows = Array.isArray(episode.shots)
                    ? episode.shots
                          .map((shot) => {
                              const row = record(shot);
                              return "| " + String(row.shotNumber || "") + " | " + String(row.shotSize || "") + " | " + String(row.visualDescription || "") + " | " + String(row.cameraMovement || "") + " | " + String(row.durationSeconds || "") + "秒 |";
                          })
                          .join("\n")
                    : "";
                return "## 第" + String(episode.episodeNumber || "") + "集文字分镜\n\n| 镜头 | 景别 | 画面 | 运镜 | 时长 |\n| --- | --- | --- | --- | --- |\n" + rows;
            })
            .join("\n\n");
    }
    if (runType === "asset_prompts" && Array.isArray(value.assets)) {
        return value.assets
            .map((entry) => {
                const asset = record(entry);
                return "## " + String(asset.name || "未命名") + "\n\n- 类型：" + String(asset.type || "") + "\n- 基准提示词：" + String(asset.prompt || "");
            })
            .join("\n\n");
    }
    return publicText(value);
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
    if ((task.runType === "adaptation_bundle" || task.runType === "episode_scripts" || task.runType === "script_review") && Array.isArray(structured.episodes) && deps.replaceEpisodes) {
        const episodes = structured.episodes.map((value, index) => {
            const row = record(value);
            return { episodeNumber: Number(row.episodeNumber || row.episodeIndex || index + 1), title: String(row.title || `第${index + 1}集`), outline: record(row.outline), script: record(row.script || row.screenplay) };
        });
        await deps.replaceEpisodes(scope, task.projectId, task.runId, episodes);
    }
    if (task.runType === "text_storyboard" && Array.isArray(structured.episodes) && deps.replaceStoryboardEpisodes) {
        const episodes = structured.episodes.map((value) => {
            const row = record(value);
            const episodeNumber = Number(row.episodeNumber);
            const normalized = normalizeScriptShots(`episode-${episodeNumber}`, row.shots);
            return { episodeNumber, shots: normalized as unknown as Array<Record<string, unknown>> };
        });
        await deps.replaceStoryboardEpisodes(scope, task.projectId, task.runId, episodes);
    }
    if (task.runType === "asset_prompts" && Array.isArray(structured.assets) && deps.upsertPromptAssets) await deps.upsertPromptAssets(scope, task.projectId, task.runId, normalizePromptAssets(structured.assets));
}
function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function publicArtifactContext(row: Record<string, unknown>) {
    return { type: String(row.artifact_type || ""), key: String(row.artifact_key || ""), status: String(row.status || ""), content: row.content_json || row.content_text || "" };
}

function responseSchemaFor(runType: ScriptRunType): Record<string, unknown> {
    switch (runType) {
        case "conversation":
            return textResult("给用户的自然语言回复");
        case "project_planning":
            return textResult("创作定位、世界观、人物小传与故事大纲的 Markdown 正文");
        case "short_story":
            return objectSchema({ title: textProperty("故事标题"), content: textProperty("完整小说体短故事正文") }, ["title", "content"]);
        case "novel_outlines":
            return objectSchema({ content: textProperty("总纲、卷纲与章纲"), chapters: chapterArray(false) }, ["content", "chapters"]);
        case "novel_chapters":
            return objectSchema({ content: textProperty("章节生成摘要"), chapters: chapterArray(true) }, ["content", "chapters"]);
        case "chapter_analysis":
            return textResult("章节事件索引");
        case "adaptation_bundle":
            return objectSchema({ content: textProperty("故事骨架、改编策略和分集大纲"), episodes: episodeArray(false) }, ["content", "episodes"]);
        case "episode_scripts":
            return objectSchema({ content: textProperty("分集剧本生成摘要"), episodes: episodeArray(true) }, ["content", "episodes"]);
        case "script_review":
            return objectSchema({ report: textProperty("审核、自动修正和重大待确认项"), episodes: episodeArray(true) }, ["report", "episodes"]);
        case "director_plan":
            return textResult("导演文字规划");
        case "text_storyboard":
            return objectSchema({ content: textProperty("文字分镜摘要"), episodes: storyboardEpisodeArray() }, ["content", "episodes"]);
        case "asset_prompts":
            return objectSchema({ content: textProperty("提示词资产摘要"), assets: promptAssetArray() }, ["content", "assets"]);
    }
}
function textProperty(description: string) {
    return { type: "string", description };
}
function objectSchema(properties: Record<string, unknown>, required: string[]) {
    return { type: "object", properties, required };
}
function textResult(description: string) {
    return objectSchema({ content: textProperty(description) }, ["content"]);
}
function chapterArray(withContent: boolean) {
    const properties: Record<string, unknown> = { chapterIndex: { type: "integer" }, title: { type: "string" }, outline: { type: "object" } };
    if (withContent) properties.content = { type: "string" };
    return { type: "array", items: objectSchema(properties, withContent ? ["chapterIndex", "title", "content"] : ["chapterIndex", "title", "outline"]) };
}
function episodeArray(withScript: boolean) {
    const properties: Record<string, unknown> = { episodeNumber: { type: "integer" }, title: { type: "string" }, outline: { type: "object" } };
    if (withScript) properties.script = objectSchema({ blocks: { type: "array", items: objectSchema({ type: { type: "string" }, text: { type: "string" } }, ["type", "text"]) } }, ["blocks"]);
    return { type: "array", items: objectSchema(properties, withScript ? ["episodeNumber", "title", "script"] : ["episodeNumber", "title", "outline"]) };
}
function storyboardEpisodeArray() {
    return { type: "array", items: objectSchema({ episodeNumber: { type: "integer" }, shots: { type: "array", items: shotSchema() } }, ["episodeNumber", "shots"]) };
}
function promptAssetArray() {
    return {
        type: "array",
        items: objectSchema({ type: { type: "string", enum: ["character", "location", "prop"] }, name: textProperty("规范名"), prompt: textProperty("基准文字提示词"), aliases: { type: "array", items: { type: "string" } }, variants: { type: "array" } }, [
            "type",
            "name",
            "prompt",
        ]),
    };
}
function shotSchema() {
    return objectSchema(
        {
            sceneId: { type: "string" },
            shotNumber: { type: "integer" },
            visualDescription: { type: "string" },
            shotSize: { type: "string" },
            cameraAngle: { type: "string" },
            composition: { type: "string" },
            cameraMovement: { type: "string" },
            characterIds: { type: "array", items: { type: "string" } },
            action: { type: "string" },
            emotion: { type: "string" },
            durationSeconds: { type: "number" },
            characterAssetIds: { type: "array", items: { type: "string" } },
            propAssetIds: { type: "array", items: { type: "string" } },
        },
        ["sceneId", "shotNumber", "visualDescription", "shotSize", "cameraAngle", "composition", "cameraMovement", "action", "emotion", "durationSeconds"],
    );
}
