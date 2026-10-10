import type { AuthSettings, LogicalModelCapability, SystemModelChannel } from "@/lib/auth/store";
import { channelModelCapability, resolveLogicalModelCapabilityProfile } from "@/lib/model-routing-config";
import { channelSupportsModel, rawModelName } from "./generation-channel";
import { filterHealthyRuntimeCandidates, hasHealthyRuntimeCandidate } from "./channel-runtime-health";
import { channelHasCapacity } from "./channel-concurrency";
import { channelConnectionReady } from "@/lib/channel-protocol-registry";
import { resolvePracticeModelAccess, type PracticeExecutionProfile } from "@/lib/practice-domain";

export type ResolvedLogicalModel = {
    logicalModelId: string;
    upstreamModel: string;
    channelId: string;
    channel: SystemModelChannel;
    capabilityProfile?: ReturnType<typeof resolveLogicalModelCapabilityProfile>;
    overflow?: true;
};

export function resolveLogicalModel(
    settings: Pick<AuthSettings, "logicalModels" | "systemChannels">,
    capability: LogicalModelCapability,
    requestedModelId: string,
    preferredChannelId = "",
    executionProfile: PracticeExecutionProfile = "production",
): ResolvedLogicalModel | null {
    return resolveLogicalModelCandidates(settings, capability, requestedModelId, preferredChannelId, executionProfile)[0] || null;
}

export function resolveLogicalModelCandidates(
    settings: Pick<AuthSettings, "logicalModels" | "systemChannels">,
    capability: LogicalModelCapability,
    requestedModelId: string,
    preferredChannelId = "",
    executionProfile: PracticeExecutionProfile = "production",
): ResolvedLogicalModel[] {
    const requested = rawModelName(requestedModelId);
    if (!requested) return [];
    const logical = settings.logicalModels.find((model) => model.enabled && model.capability === capability && model.id.toLowerCase() === requested.toLowerCase());
    if (logical) {
        const bindings = logical.bindings.filter((binding) => binding.enabled).sort((a, b) => a.priority - b.priority || (b.weight || 100) - (a.weight || 100) || a.id.localeCompare(b.id));
        const preferred = preferredChannelId ? bindings.find((binding) => binding.channelId === preferredChannelId) : undefined;
        const resolved: ResolvedLogicalModel[] = [];
        for (const binding of preferred ? [preferred, ...bindings.filter((item) => item !== preferred)] : bindings) {
            const channel = settings.systemChannels.find(
                (item) => item.id === binding.channelId && item.enabled && resolvePracticeModelAccess(executionProfile, item.purpose || "shared") && channelConnectionReady(item) && channelSupportsModel(item.models, binding.upstreamModel),
            );
            if (channel) resolved.push({ logicalModelId: logical.id, upstreamModel: binding.upstreamModel, channelId: channel.id, channel, capabilityProfile: resolveLogicalModelCapabilityProfile(binding, capability, channel, binding.upstreamModel) });
        }
        // Text planning tracks health per channel + upstream model in
        // text-planning-runtime. A channel-level cooldown must not hide a healthy
        // backup text model that shares the same gateway.
        const healthy = capability === "text" ? resolved : filterHealthyRuntimeCandidates(resolved, capability);
        const own = filterAvailableConcurrencyCandidates(healthy, capability);
        if (capability !== "image") return own;
        const overflow = imageOverflowCandidates(settings, logical.id, executionProfile).filter((item) => !own.some((mine) => mine.channelId === item.channelId && mine.upstreamModel === item.upstreamModel));
        return [...own, ...overflow];
    }
    if (settings.logicalModels.length) return [];
    const ordered = preferredChannelId ? [...settings.systemChannels.filter((channel) => channel.id === preferredChannelId), ...settings.systemChannels.filter((channel) => channel.id !== preferredChannelId)] : settings.systemChannels;
    const resolved = ordered
        .filter((item) => item.enabled && resolvePracticeModelAccess(executionProfile, item.purpose || "shared") && channelConnectionReady(item) && channelSupportsModel(item.models, requested) && channelModelCapability(item, requested) === capability)
        .map((channel) => ({ logicalModelId: requested, upstreamModel: requested, channelId: channel.id, channel, capabilityProfile: resolveLogicalModelCapabilityProfile({}, capability, channel, requested) }));
    const healthy = capability === "text" ? resolved : filterHealthyRuntimeCandidates(resolved, capability);
    return filterAvailableConcurrencyCandidates(healthy, capability);
}

// Skip channels already at their upstream concurrency quota so callers fail over
// to the next candidate instead of queueing. All candidates saturated keeps the
// first one, mirroring filterHealthyRuntimeCandidates, so the caller still gets a
// candidate to attempt rather than an empty list it would report as "no model".
function filterAvailableConcurrencyCandidates(candidates: ResolvedLogicalModel[], capability: LogicalModelCapability) {
    if (candidates.length < 2) return candidates;
    const available = candidates.filter((candidate) => channelHasCapacity(capability, candidate.channelId, candidate.upstreamModel, candidate.capabilityProfile?.concurrencyLimit));
    return available.length ? available : candidates;
}

// Routes of other enabled image models, shuffled, appended after the requested model's own
// routes. Capacity is decided at reservation time, so a full own channel overflows here
// immediately instead of waiting. logicalModelId stays the requested model for billing.
function imageOverflowCandidates(settings: Pick<AuthSettings, "logicalModels" | "systemChannels">, requestedLogicalId: string, executionProfile: PracticeExecutionProfile) {
    const overflow: ResolvedLogicalModel[] = [];
    for (const other of settings.logicalModels) {
        if (!other.enabled || other.capability !== "image" || other.id === requestedLogicalId) continue;
        for (const binding of other.bindings) {
            if (!binding.enabled) continue;
            const channel = settings.systemChannels.find(
                (item) => item.id === binding.channelId && item.enabled && resolvePracticeModelAccess(executionProfile, item.purpose || "shared") && channelConnectionReady(item) && channelSupportsModel(item.models, binding.upstreamModel),
            );
            if (!channel) continue;
            const candidate: ResolvedLogicalModel = { logicalModelId: requestedLogicalId, upstreamModel: binding.upstreamModel, channelId: channel.id, channel, capabilityProfile: resolveLogicalModelCapabilityProfile(binding, "image", channel, binding.upstreamModel), overflow: true };
            if (hasHealthyRuntimeCandidate([candidate], "image") && !overflow.some((item) => item.channelId === candidate.channelId && item.upstreamModel === candidate.upstreamModel)) overflow.push(candidate);
        }
    }
    for (let i = overflow.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [overflow[i], overflow[j]] = [overflow[j], overflow[i]];
    }
    return overflow;
}

export function resolveVisionModelCandidates(settings: Pick<AuthSettings, "logicalModels" | "systemChannels">, requestedModelId: string, preferredChannelId = "", executionProfile: PracticeExecutionProfile = "production"): ResolvedLogicalModel[] {
    return resolveLogicalModelCandidates(settings, "text", requestedModelId, preferredChannelId, executionProfile).filter((candidate) => candidate.capabilityProfile?.supportsImageInput === true);
}

export function resolveLogicalBillingModel(logicalModels: AuthSettings["logicalModels"], capability: LogicalModelCapability, channelId: string, upstreamModel: string, preferredLogicalModelId = "") {
    const matches = logicalModels.filter(
        (logical) => logical.enabled && logical.capability === capability && logical.bindings.some((binding) => binding.enabled && binding.channelId === channelId && channelSupportsModel([binding.upstreamModel], upstreamModel)),
    );
    return matches.find((logical) => logical.id.toLowerCase() === preferredLogicalModelId.trim().toLowerCase())?.id || matches[0]?.id || upstreamModel;
}
