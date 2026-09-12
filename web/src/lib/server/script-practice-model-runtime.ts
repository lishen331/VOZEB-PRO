import { extractJsonObjectText } from "./structured-model-output";
import { getFreshAuthSettings } from "@/lib/auth/store";
import { resolveLogicalModel } from "@/lib/server/logical-model-router";
import type { ScriptAgentOperation } from "@/lib/script-practice-types";
import { SCRIPT_AGENT_TOOL_NAMES } from "./script-practice-agent-tools";

export type ScriptModelRequest = {
    modelId: string;
    operation: ScriptAgentOperation;
    projectContext: Record<string, unknown>;
    stageInput: unknown;
    publicInstructions: string;
    responseSchema: Record<string, unknown>;
};
export type ScriptModelResponse = { publicText?: string; structured?: Record<string, unknown>; usage?: { inputTokens?: number; outputTokens?: number } };
export type ScriptRuntimeContext = { endpointUrl: string; executionProfile: string; apiKey?: string; fetcher?: (input: string, init?: RequestInit) => Promise<Response>; signal?: AbortSignal };
export type ConfiguredScriptModel = { modelId: string; endpointUrl: string; apiKey?: string; executionProfile: "open-source-practice"; enabledSkills: string[]; enabledTools: string[] };

export async function resolveConfiguredScriptModel(): Promise<ConfiguredScriptModel> {
    const settings = await getFreshAuthSettings();
    const scriptSettings = settings.practiceScriptSettings;
    const modelIds = [scriptSettings.defaultModelId.trim(), scriptSettings.fallbackModelId?.trim() || "", settings.practiceDefaultModels.textModel.trim()].filter((value, index, values) => value && values.indexOf(value) === index);
    const candidate = modelIds.map((modelId) => resolveLogicalModel(settings, "text", modelId, scriptSettings.endpointId?.trim() || "", "open-source-practice")).find(Boolean);
    if (!candidate || candidate.channel.purpose === "production") throw new ScriptModelRuntimeError("剧本模型尚未配置", 503);
    return {
        modelId: candidate.upstreamModel,
        endpointUrl: candidate.channel.baseUrl,
        ...(candidate.channel.apiKey ? { apiKey: candidate.channel.apiKey } : {}),
        executionProfile: "open-source-practice",
        enabledSkills: Array.isArray(scriptSettings.enabledSkills) ? [...scriptSettings.enabledSkills] : [],
        enabledTools: Array.isArray(scriptSettings.enabledTools) ? [...scriptSettings.enabledTools] : [...SCRIPT_AGENT_TOOL_NAMES],
    };
}

export async function runScriptModel(request: ScriptModelRequest, context: ScriptRuntimeContext): Promise<ScriptModelResponse> {
    if (context.executionProfile !== "open-source-practice") throw new ScriptModelRuntimeError("剧本模型只能使用 open-source-practice 执行档案", 403);
    const fetcher = context.fetcher || fetch;
    const endpoint = context.endpointUrl.replace(/\/$/, "");
    const body = {
        model: request.modelId,
        messages: [
            { role: "system", content: `${request.publicInstructions}\n只返回 JSON，不要返回思维链、分析过程或额外解释。输出 Schema：${JSON.stringify(request.responseSchema)}` },
            { role: "user", content: JSON.stringify({ operation: request.operation, stageInput: request.stageInput, projectContext: publicContext(request.projectContext) }) },
        ],
        response_format: { type: "json_object" },
    };
    let response: Response;
    try {
        response = await fetcher(`${endpoint}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {}) },
            body: JSON.stringify(body),
            signal: context.signal,
        });
    } catch {
        throw new ScriptModelRuntimeError("剧本模型服务暂时无法连接", 502);
    }
    if (!response.ok) throw new ScriptModelRuntimeError("剧本模型服务返回失败", response.status >= 400 && response.status < 500 ? response.status : 502);
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const content = readContent(payload);
    const structured = parseStructured(content, request.operation);
    if (!structured) throw new ScriptModelRuntimeError("剧本模型返回结果无法通过结构校验", 502);
    const clean = stripHiddenFields(structured);
    if (!matchesResponseSchema(clean, request.responseSchema)) throw new ScriptModelRuntimeError("剧本模型返回结果无法通过结构化结果校验", 502);
    const usage = readUsage(payload);
    return { structured: clean, ...(content.publicText && !extractJsonObjectText(content.publicText) ? { publicText: content.publicText } : {}), ...(usage ? { usage } : {}) };
}

export class ScriptModelRuntimeError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "ScriptModelRuntimeError";
    }
}
function publicContext(context: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(context).filter(([key]) => !/^(?:userId|ownerUserId|hidden|reasoning|system|secret|token|credential)/i.test(key)));
}
type ModelContent = { value?: unknown; publicText?: string };

function readContent(payload: Record<string, unknown> | null): ModelContent {
    if (!payload) return {};
    const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
    const message = choice && typeof choice === "object" && !Array.isArray(choice) ? (choice as Record<string, unknown>).message : undefined;
    if (message && typeof message === "object" && !Array.isArray(message)) {
        const row = message as Record<string, unknown>;
        const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
        const args = calls.find((call) => call && typeof call === "object" && !Array.isArray(call) && typeof (call as Record<string, unknown>).function === "object");
        const functionArgs = args && typeof (args as Record<string, unknown>).function === "object" ? ((args as Record<string, unknown>).function as Record<string, unknown>).arguments : undefined;
        if (functionArgs !== undefined) return { value: functionArgs };
        return { value: row.content, publicText: plainText(row.content) };
    }
    if (typeof payload.output_text === "string") return { value: payload.output_text, publicText: payload.output_text.trim() };
    const output = Array.isArray(payload.output) ? payload.output : [];
    const call = output.find((item) => item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).arguments === "string") as Record<string, unknown> | undefined;
    if (call?.arguments !== undefined) return { value: call.arguments };
    const outputText = output.map((item) => item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).text === "string" ? (item as Record<string, unknown>).text : "").join("").trim();
    if (outputText) return { value: outputText, publicText: outputText };
    for (const key of ["data", "result", "response"]) {
        if (payload[key] !== undefined) return { value: payload[key] };
    }
    return { value: payload };
}

function plainText(value: unknown) {
    if (typeof value === "string") return value.trim();
    if (!Array.isArray(value)) return "";
    return value.map((item) => item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).text === "string" ? (item as Record<string, unknown>).text : "").join("").trim();
}

function parseStructured(content: ModelContent, operation: ScriptAgentOperation) {
    const value = content.value;
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    const text = typeof value === "string" ? value.trim() : plainText(value);
    if (!text) return null;
    const jsonText = extractJsonObjectText(text);
    if (jsonText) {
        try {
            const parsed = JSON.parse(jsonText);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
        } catch {
            return null;
        }
    }
    const field = { generate_synopsis: "synopsis", generate_outline: "outline", generate_entities: "entities", generate_scenes: "scenes", generate_screenplay: "screenplay", rewrite_selection: "proposedAfter", expand_selection: "proposedAfter", polish_selection: "proposedAfter", enhance_conflict: "proposedAfter", check_continuity: "proposedAfter", validate_format: "proposedAfter" }[operation];
    return field ? { [field]: text } : null;
}

function stripHiddenFields(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !/^(?:reasoning|analysis|thought|thinking|chainOfThought|hidden)/i.test(key))
            .map(([key, item]) => [
                key,
                item && typeof item === "object" && !Array.isArray(item)
                    ? stripHiddenFields(item as Record<string, unknown>)
                    : Array.isArray(item)
                      ? item.map((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? stripHiddenFields(entry as Record<string, unknown>) : entry))
                      : item,
            ]),
    );
}
function readUsage(payload: Record<string, unknown> | null) {
    const value = payload?.usage;
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const row = value as Record<string, unknown>;
    const inputTokens = Number(row.prompt_tokens ?? row.input_tokens);
    const outputTokens = Number(row.completion_tokens ?? row.output_tokens);
    return Number.isFinite(inputTokens) || Number.isFinite(outputTokens) ? { ...(Number.isFinite(inputTokens) ? { inputTokens } : {}), ...(Number.isFinite(outputTokens) ? { outputTokens } : {}) } : undefined;
}

function matchesResponseSchema(value: Record<string, unknown>, schema: Record<string, unknown>): boolean {
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
    if (required.length && !required.every((key) => Object.prototype.hasOwnProperty.call(value, key))) return false;
    const alternatives = Array.isArray(schema.anyOf) ? schema.anyOf.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
    return !alternatives.length || alternatives.some((alternative) => matchesResponseSchema(value, alternative));
}
