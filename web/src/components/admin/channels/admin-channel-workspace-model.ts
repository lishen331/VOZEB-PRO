import type { LogicalModelCapability, SystemDefaultModels, SystemModelChannel } from "@/lib/auth/store";
import type { PracticeWorkflowModelBindings } from "@/lib/auth/store-types";
import { channelDetectedCapabilities, normalizeDefaultModelsConfig } from "@/lib/model-routing-config";
import { channelProtocolDefinition } from "@/lib/channel-protocol-registry";

export type ChannelWorkspaceSettings = {
    systemChannels: SystemModelChannel[];
    logicalModels: import("@/lib/auth/store").LogicalModel[];
    defaultModels: SystemDefaultModels;
    practiceDefaultModels: SystemDefaultModels;
    practiceWorkflowModels?: PracticeWorkflowModelBindings;
};

export type ChannelWorkspaceStatus = "enabled" | "draft" | "disabled";

const capabilityLabels: Record<LogicalModelCapability, string> = { text: "文本", image: "图片", video: "视频", audio: "音频" };

export function channelWorkspaceStatus(channel: SystemModelChannel): ChannelWorkspaceStatus {
    if (channel.enabled) return "enabled";
    return channel.baseUrl.trim() ? "disabled" : "draft";
}

export function channelWorkspaceStatusLabel(status: ChannelWorkspaceStatus) {
    return { enabled: "已启用", draft: "草稿", disabled: "已停用" }[status];
}

export function channelWorkspaceStatusColor(status: ChannelWorkspaceStatus) {
    return { enabled: "success", draft: "default", disabled: "default" }[status];
}

export function channelCapabilityLabels(channel: SystemModelChannel) {
    return Array.from(channelDetectedCapabilities(channel)).map((capability) => capabilityLabels[capability]);
}

export function channelProtocolLabel(channel: SystemModelChannel) {
    return channelProtocolDefinition(channel.advancedConfig?.protocol || "auto").label;
}

export function removeChannelFromWorkspace(settings: ChannelWorkspaceSettings, channelId: string): ChannelWorkspaceSettings {
    const systemChannels = settings.systemChannels.filter((channel) => channel.id !== channelId);
    const logicalModels = settings.logicalModels.map((model) => ({ ...model, bindings: model.bindings.filter((binding) => binding.channelId !== channelId) })).filter((model) => model.bindings.length);
    const liveIds = new Set(logicalModels.map((model) => model.id));
    return {
        systemChannels,
        logicalModels,
        defaultModels: Object.fromEntries(Object.entries(settings.defaultModels).map(([key, value]) => [key, liveIds.has(value) ? value : ""])) as SystemDefaultModels,
        practiceDefaultModels: Object.fromEntries(Object.entries(settings.practiceDefaultModels).map(([key, value]) => [key, liveIds.has(value) ? value : ""])) as SystemDefaultModels,
        ...(settings.practiceWorkflowModels
            ? {
                  practiceWorkflowModels: Object.fromEntries(
                      Object.entries(settings.practiceWorkflowModels).flatMap(([key, values]) => {
                          const next = (Array.isArray(values) ? values : [values]).filter((value) => liveIds.has(value));
                          return next.length ? [[key, next]] : [];
                      }),
                  ) as PracticeWorkflowModelBindings,
              }
            : {}),
    };
}

export function updateChannelInWorkspace(settings: ChannelWorkspaceSettings, channelId: string, patch: Partial<SystemModelChannel>): ChannelWorkspaceSettings {
    const systemChannels = settings.systemChannels.map((channel) => (channel.id === channelId ? { ...channel, ...patch } : channel));
    return {
        ...settings,
        systemChannels,
        defaultModels: normalizeDefaultModelsConfig(settings.defaultModels, settings.logicalModels, systemChannels),
        practiceDefaultModels: normalizeDefaultModelsConfig(settings.practiceDefaultModels, settings.logicalModels, systemChannels, "open-source-practice", { allowFallback: false }),
        practiceWorkflowModels: settings.practiceWorkflowModels,
    };
}

export function defaultModelField(capability: LogicalModelCapability): keyof SystemDefaultModels {
    return capability === "text" ? "textModel" : capability === "image" ? "imageModel" : capability === "video" ? "videoModel" : "audioModel";
}

export function channelBindingCount(channelId: string, settings: ChannelWorkspaceSettings) {
    return settings.logicalModels.reduce((count, model) => count + model.bindings.filter((binding) => binding.channelId === channelId).length, 0);
}

export function channelSearchText(channel: SystemModelChannel) {
    return `${channel.name} ${channel.baseUrl} ${channelProtocolLabel(channel)} ${channel.models.join(" ")}`.toLowerCase();
}
