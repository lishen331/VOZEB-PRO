import { getAuthSettings } from "@/lib/auth/store";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { rankTextPlanningCandidates, type TextPlanningCandidate } from "@/lib/server/text-planning-runtime";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolveTextProtocol } from "@/lib/server/text-protocol-resolver";
import { buildProviderRequest, readProviderString } from "@/lib/server/provider-task-config";
import { systemAiBillingHeaders, systemAiIdempotencyKey, readSystemAiBilling, hasSystemAiCharge } from "@/lib/server/system-ai-billing";
import { refundGenerationCharge } from "@/lib/server/generation-charge-service";
import { maintenanceWorkerContextHeaders } from "@/lib/server/maintenance-auth";
import { resolveModelRequestTimeoutMs } from "@/lib/server/model-request-policy";
import { buildOneClickStoryPrompts, parseOneClickStory, OneClickStoryError } from "./story-generation-contract";

export type OneClickStoryInput = { userId: string; projectId: string; episodeId?: string; requestId: string; origin: string; cookie: string; storyOutline: string; storyStyle: string; scriptType: string; episodeCount: number };
/** L deliberately does not request JSON-object mode: its output is an ARRAY, not an object. */
export function buildOneClickStoryRequest(candidate: TextPlanningCandidate, input: Pick<OneClickStoryInput, "storyOutline" | "storyStyle" | "scriptType" | "episodeCount">) {
    const prompt = buildOneClickStoryPrompts(input.storyOutline, input.storyStyle, input.scriptType, input.episodeCount);
    const protocol = resolveTextProtocol({ model: candidate.upstreamModel, apiFormat: candidate.channel.apiFormat, advancedConfig: candidate.channel.advancedConfig, throughSystemProxy: true });
    const messages = [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
    ];
    let body: Record<string, unknown>;
    if (protocol.kind === "responses") body = { model: candidate.upstreamModel, input: messages, temperature: prompt.temperature, max_output_tokens: prompt.maxTokens };
    else if (protocol.kind === "gemini")
        body = { systemInstruction: { parts: [{ text: prompt.system }] }, contents: [{ role: "user", parts: [{ text: prompt.user }] }], generationConfig: { temperature: prompt.temperature, maxOutputTokens: prompt.maxTokens } };
    else if (protocol.kind === "claude") body = { model: candidate.upstreamModel, system: prompt.system, messages: [messages[1]], temperature: prompt.temperature, max_tokens: prompt.maxTokens };
    else if (protocol.kind === "custom") {
        const values = {
            model: candidate.upstreamModel,
            messages,
            prompt: prompt.user,
            system: prompt.system,
            input: prompt.user,
            text: prompt.user,
            temperature: prompt.temperature,
            max_tokens: prompt.maxTokens,
            maxTokens: prompt.maxTokens,
            stream: false,
        };
        body = buildProviderRequest(protocol.requestTemplate!, values, values);
    } else body = { model: candidate.upstreamModel, messages, temperature: prompt.temperature, max_tokens: prompt.maxTokens, stream: false };
    return { protocol, body };
}
function responseText(payload: Record<string, unknown>, resultField?: string): string {
    if (resultField) return readProviderString(payload, resultField, []) || "";
    const choices = payload.choices as Array<{ message?: { content?: string } }> | undefined;
    if (typeof choices?.[0]?.message?.content === "string") return choices[0].message.content;
    if (typeof payload.output_text === "string") return payload.output_text;
    const output = payload.output as Array<{ content?: Array<{ text?: string }> }> | undefined;
    if (output)
        return output
            .flatMap((item) => item.content || [])
            .map((item) => item.text || "")
            .join("");
    const candidates = payload.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    if (candidates) return (candidates[0]?.content?.parts || []).map((item) => item.text || "").join("");
    const content = payload.content as Array<{ text?: string }> | undefined;
    return Array.isArray(content) ? content.map((item) => item.text || "").join("") : "";
}
export async function generateOneClickStory(input: OneClickStoryInput) {
    const settings = await getAuthSettings();
    const model = settings.defaultModels.textModel;
    const candidates = rankTextPlanningCandidates(resolveLogicalModelCandidates(settings, "text", model));
    if (!model || !candidates.length) throw new OneClickStoryError("后台尚未配置可用的默认文本模型", 503);
    let lastError: unknown;
    for (const candidate of candidates) {
        let response: Response | undefined;
        try {
            const request = buildOneClickStoryRequest(candidate, input);
            const key = systemAiIdempotencyKey("one-click-film-story-generation", input.userId, input.projectId, input.episodeId || "new", input.requestId, candidate.channelId, candidate.upstreamModel);
            const headers = new Headers({ "content-type": "application/json", ...systemAiBillingHeaders(model, key, candidate.upstreamModel) });
            if (input.cookie) headers.set("cookie", input.cookie);
            for (const [name, value] of Object.entries(maintenanceWorkerContextHeaders(input.cookie) || {})) headers.set(name, value);
            response = await fetchInternalApi(`${resolveInternalOrigin(input.origin)}/api/ai/system/${encodeURIComponent(candidate.channelId)}${request.protocol.path.startsWith("/") ? "" : "/"}${request.protocol.path}`, {
                method: "POST",
                headers,
                body: JSON.stringify(request.body),
                cache: "no-store",
                signal: AbortSignal.timeout(resolveModelRequestTimeoutMs(candidate, "text")),
            });
            if (!response.ok) throw new OneClickStoryError(`剧本模型调用失败（${response.status}）`);
            const episodes = parseOneClickStory(responseText(await response.json(), request.protocol.resultField));
            return { episodes, templateKey: "one-click-film-story-expansion-l" };
        } catch (error) {
            lastError = error;
            if (response) {
                const billing = readSystemAiBilling(response.headers);
                if (hasSystemAiCharge(billing)) await refundGenerationCharge({ userId: input.userId, receiptId: billing.billingReceiptId, model, usageKind: "text", units: 1, idempotencyKey: `one-click-film-story-refund:${billing.billingReceiptId}` });
            }
        }
    }
    throw lastError instanceof Error ? lastError : new OneClickStoryError("剧本生成失败");
}
