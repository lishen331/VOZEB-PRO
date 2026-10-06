import { createHash } from "node:crypto";
import type { AuthSettings, LogicalModel, LogicalModelBinding, SystemModelChannel } from "@/lib/auth/store";
import { resolveChannelModelAdvancedConfig } from "@/lib/channel-protocol-registry";
import { resolveLogicalModelCapabilityProfile } from "@/lib/model-routing-config";

export const BINDING_VERIFICATION_CONTRACT = "binding-media-v1";
type Settings = Pick<AuthSettings, "logicalModels" | "systemChannels">;

export type BindingVerificationWarning = {
    modelId: string;
    modelName: string;
    bindingId: string;
    channelId: string;
    channelName: string;
    fingerprint: string;
    message: string;
};

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
/** A proof is for an exact execution configuration, never a UI switch value. */
export function bindingVerificationFingerprint(model: LogicalModel, binding: LogicalModelBinding, channel: SystemModelChannel): string {
    const advanced = { ...resolveChannelModelAdvancedConfig(channel.advancedConfig, binding.upstreamModel) };
    // Other models/catalogue listings and channel defaults are not this binding's execution contract.
    delete advanced.modelConfigs;
    delete advanced.modelCapabilities;
    delete advanced.modelCatalogPaths;
    delete advanced.operationConfigs;
    const value = {
        contract: BINDING_VERIFICATION_CONTRACT,
        logicalModelId: model.id,
        capability: model.capability,
        bindingId: binding.id,
        channelId: channel.id,
        upstreamModel: binding.upstreamModel,
        baseUrl: channel.baseUrl,
        apiFormat: channel.apiFormat,
        credentialDigest: createHash("sha256").update(channel.apiKey).digest("hex"),
        advanced,
        capabilityProfile: resolveLogicalModelCapabilityProfile(binding, model.capability, channel, binding.upstreamModel),
    };
    return createHash("sha256")
        .update(JSON.stringify(canonical(value)))
        .digest("hex");
}

/**
 * Checks whether an enabled binding has a successful proof for its current execution configuration.
 *
 * Verification is advisory at save time: an untested or stale binding may still be enabled so that
 * operators can test it from the workbench. The returned warnings are deliberately structured for
 * the admin API/UI and contain only identifiers plus a one-way fingerprint, never credentials or media.
 */
export async function assertBindingVerificationChanges(before: Settings, after: Settings, hasPassed: (fingerprint: string) => Promise<boolean>): Promise<BindingVerificationWarning[]> {
    const warnings: BindingVerificationWarning[] = [];
    for (const model of after.logicalModels) {
        if (model.capability === "audio") continue;
        for (const binding of model.bindings) {
            if (!binding.enabled) continue;
            const channel = after.systemChannels.find((c) => c.id === binding.channelId);
            if (!channel || channel.advancedConfig?.protocol === "runninghub") continue;
            const fingerprint = bindingVerificationFingerprint(model, binding, channel);
            const priorModel = before.logicalModels.find((m) => m.id === model.id);
            const priorBinding = priorModel?.bindings.find((b) => b.id === binding.id && b.channelId === binding.channelId && b.upstreamModel === binding.upstreamModel);
            const priorChannel = before.systemChannels.find((c) => c.id === binding.channelId);
            if (priorModel && priorBinding?.enabled && priorChannel && bindingVerificationFingerprint(priorModel, priorBinding, priorChannel) === fingerprint) continue;
            if (await hasPassed(fingerprint)) continue;
            warnings.push({
                modelId: model.id,
                modelName: model.name,
                bindingId: binding.id,
                channelId: channel.id,
                channelName: channel.name,
                fingerprint,
                message: `模型「${model.name}」的渠道绑定「${channel.name}」尚无当前配置的成功生成记录，启用后可能无法使用；可保存后直接测试，失败时仍可修改并重测。`,
            });
        }
    }
    return warnings;
}
