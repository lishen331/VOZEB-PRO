import { createHash } from "node:crypto";
import type { AuthSettings, LogicalModel, LogicalModelBinding, SystemModelChannel } from "@/lib/auth/store";
import { resolveChannelModelAdvancedConfig } from "@/lib/channel-protocol-registry";
import { resolveLogicalModelCapabilityProfile } from "@/lib/model-routing-config";

export const BINDING_VERIFICATION_CONTRACT = "binding-media-v1";
type Settings = Pick<AuthSettings, "logicalModels" | "systemChannels">;
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

export async function assertBindingVerificationChanges(before: Settings, after: Settings, hasPassed: (fingerprint: string) => Promise<boolean>): Promise<void> {
    for (const model of after.logicalModels) {
        for (const binding of model.bindings) {
            if (!binding.enabled) continue;
            const channel = after.systemChannels.find((c) => c.id === binding.channelId);
            if (!channel || channel.advancedConfig?.protocol === "runninghub") continue;
            const fingerprint = bindingVerificationFingerprint(model, binding, channel);
            const priorModel = before.logicalModels.find((m) => m.id === model.id);
            const priorBinding = priorModel?.bindings.find((b) => b.id === binding.id && b.channelId === binding.channelId && b.upstreamModel === binding.upstreamModel);
            const priorChannel = before.systemChannels.find((c) => c.id === binding.channelId);
            if (priorModel && priorBinding?.enabled && priorChannel && bindingVerificationFingerprint(priorModel, priorBinding, priorChannel) === fingerprint) continue;
            if (!(await hasPassed(fingerprint))) throw new Error(`模型 ${model.name} 的渠道绑定 ${channel.name} 尚未通过当前配置的生成验证；请先关闭并保存配置，再测试启用。`);
        }
    }
}
