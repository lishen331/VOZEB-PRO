import { randomUUID } from "node:crypto";
import { extractJsonObjectText } from "./structured-model-output";
import { requestStructuredText } from "./text-planning-runtime";
import { systemAiBillingHeaders, systemAiIdempotencyKey } from "./system-ai-billing";
import { ScriptAgentProfileService, type ResolvedScriptAgentProfile } from "./script-agent-profiles";
import type { PracticeTenantScope } from "./practice-tenant-scope";
import type { ScriptAgentKey, ScriptArtifactType, ScriptRunEventType, ScriptRunType } from "./script-agent-domain";
import { normalizeScriptCarrier } from "./script-agent-domain";
import { normalizePromptAssets, normalizeScriptShots } from "./script-agent-tools-v2";
import { deriveShortFilmSkillIds, inferShortFilmSkillInput } from "./script-agent-skills";
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
export type ScriptExecutionInput = { projectId: string; runId: string; chatSessionId?: string; runType: ScriptRunType; input: Record<string, unknown>; origin: string; cookie: string; signal?: AbortSignal };
type Deps = {
    resolveProfile: (agent: ScriptAgentKey, skills?: string[]) => Promise<ResolvedScriptAgentProfile>;
    callModel: (input: { profile: ResolvedScriptAgentProfile; task: ScriptExecutionInput; responseSchema: Record<string, unknown>; onDelta?: (delta: string) => Promise<void> }) => Promise<Record<string, unknown>>;
    listArtifacts?: ScriptAgentRepository["listLatestArtifacts"];
    getProject?: ScriptAgentRepository["getProject"];
    listChatMessages?: ScriptAgentRepository["listChatMessages"];
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
export function scriptRunSequence(runType: ScriptRunType, nextRunType?: ScriptRunType): ScriptRunType[] {
    if (runType === "conversation") return nextRunType ? ["conversation", nextRunType] : ["conversation"];
    if (runType === "episode_scripts") return ["episode_scripts", "script_review"];
    if (runType === "director_plan") return ["director_plan", "text_storyboard", "asset_prompts"];
    return [runType];
}

export function nextShortFilmRunType(artifacts: Array<{ artifact_type?: unknown; status?: unknown }>) {
    const confirmed = new Set(artifacts.filter((row) => row.status === "confirmed").map((row) => String(row.artifact_type)));
    const saved = new Set(artifacts.map((row) => String(row.artifact_type)));
    if (!confirmed.has("creative_positioning")) return "project_planning" as const;
    if (!confirmed.has("short_story") && !confirmed.has("chapter_outlines")) return "short_story" as const;
    if (!confirmed.has("adaptation_strategy")) return "adaptation_bundle" as const;
    if (!saved.has("episode_scripts")) return "episode_scripts" as const;
    if (!saved.has("review_report")) return "script_review" as const;
    if (!confirmed.has("review_report")) return "script_review" as const;
    if (!saved.has("director_plan")) return "director_plan" as const;
    if (!saved.has("text_storyboard")) return "text_storyboard" as const;
    if (!saved.has("asset_prompts")) return "asset_prompts" as const;
    return undefined;
}

export function completedRunTypesForArtifacts(artifactTypes: string[]) {
    const artifacts = new Set(artifactTypes);
    return [
        ...(artifacts.has("creative_positioning") ? ["project_planning" as const] : []),
        ...(artifacts.has("conversation") ? ["conversation" as const] : []),
        ...(artifacts.has("episode_scripts") ? ["episode_scripts" as const] : []),
        ...(artifacts.has("review_report") ? ["script_review" as const] : []),
        ...(artifacts.has("director_plan") ? ["director_plan" as const] : []),
        ...(artifacts.has("text_storyboard") ? ["text_storyboard" as const] : []),
        ...(artifacts.has("asset_prompts") ? ["asset_prompts" as const] : []),
    ];
}

export async function executeScriptRunSequence(executor: Pick<ScriptAgentExecutor, "execute">, scope: PracticeTenantScope, task: ScriptExecutionInput, completedRunTypes: string[] = []) {
    let result: Awaited<ReturnType<ScriptAgentExecutor["execute"]>> | undefined;
    const completed = new Set(completedRunTypes);
    const nextRunType = task.runType === "conversation" && task.input.advanceWorkflow === true ? (task.input.nextRunType as ScriptRunType | undefined) : undefined;
    for (const runType of scriptRunSequence(task.runType, nextRunType)) {
        if (completed.has(runType)) continue;
        result = await executor.execute(scope, { ...task, runType });
    }
    return result;
}

export class ScriptAgentExecutor {
    constructor(
        private readonly deps: Deps,
        private readonly id: () => string = randomUUID,
    ) {}
    async execute(scope: PracticeTenantScope, task: ScriptExecutionInput) {
        const execution = EXECUTION[task.runType];
        const context = this.deps.listArtifacts ? await this.deps.listArtifacts(scope, task.projectId) : [];
        const project = typeof this.deps.getProject === "function" ? await this.deps.getProject(scope, task.projectId) : null;
        const projectParameters = project?.project_parameters && typeof project.project_parameters === "object" ? (project.project_parameters as Record<string, unknown>) : {};
        const inferred = inferShortFilmSkillInput(typeof task.input.idea === "string" ? task.input.idea : typeof task.input.instruction === "string" ? task.input.instruction : "");
        const automaticSkills = deriveShortFilmSkillIds({
            carrierType: typeof project?.carrier_type === "string" ? project.carrier_type : typeof task.input.carrierType === "string" ? task.input.carrierType : undefined,
            purpose: typeof task.input.purpose === "string" ? task.input.purpose : typeof projectParameters.purpose === "string" ? projectParameters.purpose : inferred.purpose,
            viewpoint: typeof task.input.viewpoint === "string" ? task.input.viewpoint : typeof projectParameters.viewpoint === "string" ? projectParameters.viewpoint : inferred.viewpoint,
            companions: typeof task.input.companions === "string" ? task.input.companions : typeof projectParameters.companions === "string" ? projectParameters.companions : inferred.companions,
        });
        const profile = await this.deps.resolveProfile(execution.agent, [...new Set(automaticSkills)]);
        await this.deps.appendEvent(scope, task.projectId, task.runId, "agent_started", { agentKey: execution.agent, name: profile.profile.name }, this.id());
        await this.deps.appendEvent(scope, task.projectId, task.runId, "progress", { phase: publicPhase(task.runType), label: publicPhaseLabel(task.runType) }, this.id());
        await this.deps.appendEvent(scope, task.projectId, task.runId, "assistant_delta", { agentKey: execution.agent, delta: `${profile.profile.name}已开始处理当前任务。` }, this.id());
        const projectContext = project ? { carrierType: normalizeScriptCarrier(project.carrier_type), projectParameters: project.project_parameters && typeof project.project_parameters === "object" ? project.project_parameters : {} } : undefined;
        const carrierInstructions =
            "创作检查：起承转合、至少一次因果转折、自然修辞（比喻/排比/对比）、总时长不超过目标。" +
            (projectContext?.carrierType === "vlog" ? "Vlog 形式：优先第一人称、口播、自拍或跟拍、自然同期声和真实环境细节。" : projectContext?.carrierType === "tvc" ? "TVC 形式：突出品牌目标、产品卖点、情绪记忆点、行动号召和片尾品牌信息。" : "");
        const chatHistory = task.chatSessionId && this.deps.listChatMessages ? await this.deps.listChatMessages(scope, task.projectId, task.chatSessionId) : [];
        const enrichedTask = {
            ...task,
            input: {
                ...task.input,
                context: context.map(publicArtifactContext),
                ...(projectContext ? { projectContext, carrierInstructions, qualityChecklist: ["起承转合", "至少一次因果转折", "修辞自然", "总时长不超过目标"] } : {}),
                ...(task.runType === "conversation" || task.runType === "project_planning"
                    ? {
                          workflowContext: { nextRunType: nextShortFilmRunType(context), locked: true },
                          interactionPolicy: {
                              maxQuestionsPerTurn: 1,
                              deferProductionParameters: true,
                              conversational: true,
                              earlyDiscovery: task.runType === "conversation",
                              forbidden: ["一次性列出 1–9 项问题", "把创意探索写成表格", "输出执行与保存要求", "输出私有思维链", "暴露原始项目上下文"],
                              responseShape: "先用一小段话复述理解，再给一个建议或一个问题；不要输出编号长清单。",
                          },
                      }
                    : {}),
                ...(chatHistory.length ? { chatHistory: chatHistory.map(publicChatMessage) } : {}),
            },
        };
        const structured = await this.deps.callModel({
            profile,
            task: enrichedTask,
            responseSchema: responseSchemaFor(task.runType),
            onDelta: async (delta) => {
                await this.deps.appendEvent(scope, task.projectId, task.runId, "artifact_delta", { artifactType: execution.artifact, artifactKey: execution.key, delta }, this.id());
            },
        });
        assertStructuredResult(task.runType, structured);
        await this.deps.appendEvent(scope, task.projectId, task.runId, "progress", { phase: "saving", label: publicSaveLabel(task.runType) }, this.id());
        if (task.runType === "text_storyboard" && project) assertStoryboardDuration(structured, project.project_parameters);
        await materializeStructuredRows(this.deps, scope, task, structured);
        if (task.runType === "conversation" && task.chatSessionId && this.deps.saveChatMessage) {
            await this.deps.saveChatMessage(scope, {
                id: this.id(),
                sessionId: task.chatSessionId,
                projectId: task.projectId,
                role: "assistant",
                agentKey: execution.agent,
                publicContent: cleanPublicText(publicText(structured) || ""),
                sourceRunId: task.runId,
            });
        }
        const artifactId = this.id();
        const artifact = await this.deps.saveArtifact(scope, {
            id: artifactId,
            projectId: task.projectId,
            artifactType: execution.artifact,
            artifactKey: execution.key,
            status: execution.confirmation ? "awaiting_review" : "draft",
            content: structured,
            contentText: cleanPublicText(formatVisibleArtifact(task.runType, structured) || ""),
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
        ...(typeof repository.getProject === "function" ? { getProject: (...args: Parameters<ScriptAgentRepository["getProject"]>) => repository.getProject(...args) } : {}),
        listChatMessages: (...args) => repository.listChatMessages(...args),
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
        signal: input.task.signal,
        stream: true,
        streamFallback: true,
        preferNativeTools: false,
        validateArguments: (argumentsText) => validateScriptAgentArguments(input.task.runType, argumentsText),
        onStreamDelta: input.onDelta ? accumulatedDeltaEmitter(input.onDelta) : undefined,
    });
    const text = call.arguments.trim();
    const jsonText = extractJsonObjectText(text);
    if (jsonText) return JSON.parse(jsonText) as Record<string, unknown>;
    return { content: text };
}
export function cleanPublicText(value: string) {
    const textValue = stripInternalInstructions(value.trim());
    const jsonText = extractJsonObjectText(textValue);
    if (!jsonText) return textValue;
    try {
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        return (
            ["content", "text", "story", "screenplay", "outline", "report"]
                .map((key) => parsed[key])
                .find((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
                ?.trim() || ""
        );
    } catch {
        return textValue;
    }
}

function stripInternalInstructions(value: string) {
    return value
        .replace(/\n?执行与保存要求[：:][\s\S]*$/i, "")
        .replace(/\n?备注[：:][\s\S]*?(?:请确认|$)/i, "")
        .trim();
}

export function validateScriptAgentArguments(runType: ScriptRunType, argumentsText: string) {
    const jsonText = extractJsonObjectText(argumentsText);
    if (!jsonText) return false;
    try {
        assertStructuredResult(runType, JSON.parse(jsonText) as Record<string, unknown>);
        return true;
    } catch {
        return false;
    }
}

function assertStructuredResult(runType: ScriptRunType, value: Record<string, unknown>) {
    const requiredArrays: Partial<Record<ScriptRunType, string[]>> = {
        novel_outlines: ["chapters"],
        novel_chapters: ["chapters"],
        adaptation_bundle: ["episodes"],
        episode_scripts: ["episodes"],
        script_review: ["episodes"],
        text_storyboard: ["episodes"],
        asset_prompts: ["assets"],
    };
    const arrays = requiredArrays[runType] || [];
    if (arrays.some((key) => !Array.isArray(value[key]) || !(value[key] as unknown[]).length)) throw new Error("剧本模型返回结果缺少当前阶段所需的结构化内容");
    if ((runType === "conversation" || runType === "project_planning" || runType === "director_plan") && !publicText(value)?.trim()) throw new Error("剧本模型返回结果缺少当前阶段正文");
    if (runType === "short_story" && (!text(value.title) || !text(value.content))) throw new Error("剧本模型返回结果缺少完整小说体故事");
    if ((runType === "novel_outlines" || runType === "novel_chapters") && !(value.chapters as unknown[]).every(validChapter)) throw new Error("剧本模型返回的章节结构不完整");
    if ((runType === "adaptation_bundle" || runType === "episode_scripts" || runType === "script_review") && !(value.episodes as unknown[]).every((entry) => validEpisode(entry, runType !== "adaptation_bundle")))
        throw new Error("剧本模型返回的分集结构不完整");
    if (runType === "text_storyboard" && !(value.episodes as unknown[]).every(validStoryboardEpisode)) throw new Error("剧本模型返回的文字分镜结构不完整");
    if (
        runType === "asset_prompts" &&
        !(value.assets as unknown[]).every((entry) => {
            const asset = record(entry);
            return ["character", "location", "prop"].includes(String(asset.type)) && Boolean(text(asset.name)) && Boolean(text(asset.prompt));
        })
    )
        throw new Error("剧本模型返回的资产提示词结构不完整");
}
function validChapter(value: unknown) {
    const chapter = record(value);
    return positiveInteger(chapter.chapterIndex) && Boolean(text(chapter.title)) && (text(chapter.content) !== undefined || (chapter.outline && typeof chapter.outline === "object" && !Array.isArray(chapter.outline)));
}
function validEpisode(value: unknown, withScript: boolean) {
    const episode = record(value);
    if (!positiveInteger(episode.episodeNumber) || !text(episode.title)) return false;
    if (!withScript) return Boolean(episode.outline && typeof episode.outline === "object" && !Array.isArray(episode.outline));
    const blocks = record(episode.script).blocks;
    return Array.isArray(blocks) && blocks.length > 0 && blocks.every((entry) => Boolean(text(record(entry).type)) && Boolean(text(record(entry).text)));
}
function validStoryboardEpisode(value: unknown) {
    const episode = record(value);
    return (
        positiveInteger(episode.episodeNumber) &&
        Array.isArray(episode.shots) &&
        episode.shots.length > 0 &&
        episode.shots.every((entry) => {
            const shot = record(entry);
            return positiveInteger(shot.shotNumber) && Number(shot.durationSeconds) > 0 && ["sceneId", "visualDescription", "shotSize", "cameraAngle", "composition", "cameraMovement", "action", "emotion"].every((key) => Boolean(text(shot[key])));
        })
    );
}
function positiveInteger(value: unknown) {
    return Number.isSafeInteger(value) && Number(value) > 0;
}
function text(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
    return cleanPublicText(publicText(value) || "");
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

function assertStoryboardDuration(value: Record<string, unknown>, parameters: unknown) {
    const config = record(parameters);
    const target = Number(config.targetDurationSeconds);
    if (!Number.isFinite(target) || target <= 0) return;
    const total = (Array.isArray(value.episodes) ? value.episodes : []).reduce((sum, episode) => {
        const shots = record(episode).shots;
        return sum + (Array.isArray(shots) ? shots.reduce((shotSum, shot) => shotSum + Math.max(0, Number(record(shot).durationSeconds) || 0), 0) : 0);
    }, 0);
    if (total > target) throw new Error(`文字分镜总时长 ${total} 秒超过项目目标时长 ${target} 秒`);
}

function publicPhase(runType: ScriptRunType) {
    if (runType === "conversation") return "understanding";
    if (["project_planning", "novel_outlines", "adaptation_bundle", "director_plan"].includes(runType)) return "planning";
    if (["short_story", "novel_chapters", "episode_scripts"].includes(runType)) return "writing";
    if (runType === "script_review") return "reviewing";
    if (["text_storyboard", "asset_prompts"].includes(runType)) return "storyboarding";
    return "saving";
}
function publicSaveLabel(runType: ScriptRunType) {
    if (runType === "conversation") return "正在整理回复并保存到当前对话";
    if (runType === "script_review") return "正在整理审核结果与修订版本";
    if (runType === "text_storyboard") return "正在整理镜头表并检查时长";
    return "正在整理成果并保存到剧本工作区";
}
function publicPhaseLabel(runType: ScriptRunType) {
    const labels: Partial<Record<ScriptRunType, string>> = {
        conversation: "正在理解你的创作意图",
        project_planning: "正在整理创作定位与故事结构",
        short_story: "正在写完整小说体故事",
        novel_outlines: "正在整理总纲、卷纲与章纲",
        novel_chapters: "正在生成选定章节正文",
        adaptation_bundle: "正在制定改编策略与分集大纲",
        episode_scripts: "正在批量编写分集剧本",
        script_review: "监督 Agent 正在审核并修正剧本",
        director_plan: "正在制定导演视听规划",
        text_storyboard: "正在拆分镜头级文字分镜",
        asset_prompts: "正在整理人物、场景与道具提示词",
    };
    return labels[runType] || "正在处理当前剧本";
}

function publicChatMessage(row: Record<string, unknown>) {
    return { role: row.role === "assistant" ? "assistant" : "user", content: typeof row.public_content === "string" ? row.public_content : "" };
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
