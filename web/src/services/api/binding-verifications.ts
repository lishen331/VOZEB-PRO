import { normalizeModelId } from "@/lib/model-capability";
import type { LogicalModel, LogicalModelBinding, SystemModelChannel } from "@/lib/auth/store";
import { resolveChannelModelAdvancedConfig, resolveChannelModelConfig } from "@/lib/channel-protocol-registry";
import { resolveLogicalModelCapabilityProfile } from "@/lib/model-routing-config";

export type BindingVerificationTest = {
    id: string;
    platformTaskId?: string;
    upstreamTaskId?: string;
    status: "running" | "passed" | "failed" | "needs_review";
    phase: string;
    error?: string;
    result?: { url?: string; text?: string; mimeType?: string };
    diagnostics?: unknown;
    fixtureUrls?: string[];
};
export async function readBindingVerification(url: string, options: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<BindingVerificationTest> {
    const response = await fetcher(url, options);
    const payload = (await response.json()) as { test?: BindingVerificationTest; error?: string };
    if (!response.ok) throw new Error(payload.error || "读取验证失败");
    if (!payload.test?.id) throw new Error("未收到测试编号，结果未知，请勿重复提交");
    if (!["running", "passed", "failed", "needs_review"].includes(payload.test.status)) throw new Error("未知测试状态，请核对诊断记录，勿重复提交");
    return payload.test;
}
export const getBindingVerification = (id: string, signal?: AbortSignal) => readBindingVerification(`/api/admin/binding-verifications/${encodeURIComponent(id)}`, { signal });
export const createBindingVerification = (logicalModelId: string, bindingId: string) =>
    readBindingVerification("/api/admin/binding-verifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logicalModelId, bindingId }) });
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, v]) => v !== undefined)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, canonical(v)]),
        );
    return value;
}
export function hasUnsavedBindingSecrets(channel: SystemModelChannel) {
    return Boolean(channel.apiKey?.trim() || channel.webhookSecret?.trim() || channel.clearApiKey || channel.clearWebhookSecret);
}
export function bindingVerificationProjection(model: LogicalModel, binding: LogicalModelBinding, channel: SystemModelChannel) {
    const advanced = { ...resolveChannelModelAdvancedConfig(channel.advancedConfig, binding.upstreamModel) };
    delete advanced.modelConfigs;
    delete advanced.modelCapabilities;
    delete advanced.modelCatalogPaths;
    delete advanced.operationConfigs;
    return JSON.stringify(
        canonical({
            modelId: model.id,
            capability: model.capability,
            bindingId: binding.id,
            channelId: channel.id,
            upstreamModel: binding.upstreamModel,
            baseUrl: channel.baseUrl,
            apiFormat: resolveChannelModelConfig(channel.advancedConfig, binding.upstreamModel)?.apiFormat || channel.apiFormat,
            advanced,
            profile: resolveLogicalModelCapabilityProfile(binding, model.capability, channel, binding.upstreamModel),
        }),
    );
}
export async function assertBindingVerificationSaved(model: LogicalModel, binding: LogicalModelBinding, channel: SystemModelChannel) {
    if (hasUnsavedBindingSecrets(channel)) throw new Error("检测到未保存的密钥或清除密钥操作，请先保存渠道配置");
    const response = await fetch("/api/admin/settings", { cache: "no-store" });
    const payload = (await response.json()) as { settings?: { logicalModels: LogicalModel[]; systemChannels: SystemModelChannel[] }; error?: string };
    if (!response.ok || !payload.settings) throw new Error(payload.error || "无法确认已保存配置，请重试");
    const savedModel = payload.settings.logicalModels.find((item) => item.id === model.id);
    const savedBinding = savedModel?.bindings.find((item) => item.id === binding.id);
    const savedChannel = payload.settings.systemChannels.find((item) => item.id === channel.id);
    if (!savedModel || !savedBinding || !savedChannel || bindingVerificationProjection(model, binding, channel) !== bindingVerificationProjection(savedModel, savedBinding, savedChannel))
        throw new Error("检测到未保存的绑定或渠道草稿，请先保存渠道配置，再重新打开测试");
}
/** Only opaque test IDs are persisted. Configuration is hashed, never stored in browser storage. */
export async function bindingVerificationSessionKey(modelId: string, bindingId: string, revision: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(revision));
    return `vozeb:binding-verification:${encodeURIComponent(modelId)}:${encodeURIComponent(bindingId)}:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Export the server-redacted diagnostic payload only, never local channel configuration. */
export function bindingVerificationDiagnosticsJson(test: BindingVerificationTest) {
    return JSON.stringify({ id: test.id, platformTaskId: test.platformTaskId, upstreamTaskId: test.upstreamTaskId, status: test.status, phase: test.phase, error: test.error, diagnostics: test.diagnostics }, null, 2);
}

/** UI previews use same-origin URLs; provider-fetch URLs may use a different deployment origin. */
export function bindingVerificationFixturePreviewUrl(index: number) {
    if (!Number.isInteger(index) || index < 0 || index > 2) throw new Error("无效的验证参考图编号");
    return `/api/admin/binding-verifications/fixtures/${index}`;
}

/** Persist only this binding's test inputs; never enable it or save unrelated UI drafts. */
export async function saveBindingVerificationDraft(model: LogicalModel, binding: LogicalModelBinding, channel: SystemModelChannel) {
    if (hasUnsavedBindingSecrets(channel)) throw new Error("请先单独保存渠道密钥，再测试绑定");
    const response = await fetch("/api/admin/settings", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.settings || typeof payload.settingsRevision !== "number") throw new Error(payload.error || "无法读取配置版本");
    const channels: SystemModelChannel[] = payload.settings.systemChannels;
    const models: LogicalModel[] = payload.settings.logicalModels;
    const savedChannel = channels.find((item) => item.id === channel.id);
    const savedModel = models.find((item) => item.id === model.id);
    const savedBinding = savedModel?.bindings.find((item) => item.id === binding.id);
    if (!savedChannel || !savedModel || !savedBinding || savedBinding.channelId !== channel.id || savedBinding.upstreamModel !== binding.upstreamModel || savedModel.capability !== model.capability)
        throw new Error("绑定身份或能力类型已变化，请重新打开设置");
    const key = normalizeModelId(binding.upstreamModel);
    const config = channel.advancedConfig?.modelConfigs?.[key];
    const nextChannel = config ? { ...savedChannel, advancedConfig: { ...savedChannel.advancedConfig!, modelConfigs: { ...savedChannel.advancedConfig?.modelConfigs, [key]: config } } } : savedChannel;
    const nextBinding = { ...savedBinding, capabilityProfile: binding.capabilityProfile };
    if (bindingVerificationProjection(model, binding, channel) !== bindingVerificationProjection(savedModel, nextBinding, nextChannel)) throw new Error("渠道地址、鉴权或通用配置有未保存修改，请先单独保存渠道；此按钮仅保存当前模型协议和绑定能力");
    if (bindingVerificationProjection(model, binding, channel) === bindingVerificationProjection(savedModel, savedBinding, savedChannel)) return;
    const result = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            settingsRevision: payload.settingsRevision,
            systemChannels: channels.map((item) => (item.id === channel.id ? nextChannel : item)),
            logicalModels: models.map((item) => (item.id === model.id ? { ...item, bindings: item.bindings.map((entry) => (entry.id === binding.id ? nextBinding : entry)) } : item)),
        }),
    });
    const saved = await result.json();
    if (!result.ok) throw new Error(saved.error || "保存失败，未发起测试");
}
