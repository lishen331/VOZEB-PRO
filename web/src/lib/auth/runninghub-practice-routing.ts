import type { AuthSettings, LogicalModel, LogicalModelCapability, SystemChannelModelConfig, SystemModelChannel } from "./store-types";
import { normalizeRunningHubWorkflowConfig } from "@/lib/server/runninghub-workflow-domain";

export function deriveRunningHubPracticeRouting(settings: Pick<AuthSettings, "systemChannels" | "logicalModels" | "practiceWorkflowModels">) {
    const systemChannels = settings.systemChannels.map((channel) => ({
        ...channel,
        models: [...channel.models],
        advancedConfig: channel.advancedConfig
            ? {
                  ...channel.advancedConfig,
                  modelCapabilities: { ...(channel.advancedConfig.modelCapabilities || {}) },
                  modelConfigs: { ...(channel.advancedConfig.modelConfigs || {}) },
              }
            : undefined,
    }));
    let logicalModels = [...settings.logicalModels];
    const practiceWorkflowModels = { ...settings.practiceWorkflowModels };

    for (const channel of systemChannels) {
        if (!channel.enabled || channel.advancedConfig?.protocol !== "runninghub" || !["open-source-practice", "shared"].includes(channel.purpose || "shared")) continue;
        const workflows = Object.values(channel.advancedConfig.workflowConfigs || {})
            .map(normalizeRunningHubWorkflowConfig)
            .filter((workflow) => workflow.enabled && workflow.channelId === channel.id);
        const capabilities = new Set(workflows.map((workflow) => workflow.capability));
        for (const capability of capabilities) {
            const routed = workflows.filter((workflow) => workflow.capability === capability);
            if (!routed.length) continue;
            const representative = routed[0];
            const modelId = `runninghub-workflow-${capability}-${channel.id}`;
            const bindingId = `${modelId}:${channel.id}`;
            const inputFields = routed.flatMap((workflow) => workflow.inputSchema);
            const capabilityProfile = {
                supportsReferenceImage: inputFields.some((field) => field.type === "image" || field.type === "images"),
                supportsReferenceVideo: inputFields.some((field) => field.type === "video"),
                supportsReferenceAudio: inputFields.some((field) => field.type === "audio"),
            };
            const modelConfig: SystemChannelModelConfig = {
                capability,
                source: "official",
                protocol: "runninghub",
                apiFormat: channel.apiFormat,
                createPath: representative.createPath,
                queryPath: representative.queryPath,
                requestTemplate: representative.requestTemplate,
                taskIdField: representative.taskIdField,
                resultField: representative.resultField,
                statusField: representative.statusField,
                supportsReferenceImage: capabilityProfile.supportsReferenceImage,
                supportsReferenceVideo: capabilityProfile.supportsReferenceVideo,
                supportsReferenceAudio: capabilityProfile.supportsReferenceAudio,
            };
            if (!channel.models.includes(modelId)) channel.models.push(modelId);
            channel.advancedConfig.modelCapabilities![modelId] = capability;
            channel.advancedConfig.modelConfigs![modelId] = modelConfig;

            const current = logicalModels.find((model) => model.id === modelId);
            const binding = { id: bindingId, channelId: channel.id, upstreamModel: modelId, enabled: true, priority: 1, capabilityProfile };
            const logicalModel: LogicalModel = current
                ? { ...current, capability, enabled: true, bindings: [binding, ...current.bindings.filter((item) => item.id !== bindingId)] }
                : { id: modelId, name: routed.length === 1 ? representative.workflowName : `${channel.name}${capabilityLabel(capability)}工作流`, capability, enabled: true, bindings: [binding] };
            logicalModels = [logicalModel, ...logicalModels.filter((model) => model.id !== modelId)];

            for (const businessCode of new Set(routed.map((workflow) => workflow.businessCode))) {
                const existing = practiceWorkflowModels[businessCode] || [];
                practiceWorkflowModels[businessCode] = [modelId, ...existing.filter((id) => id !== modelId)];
            }
        }
    }

    return { systemChannels, logicalModels, practiceWorkflowModels };
}

function capabilityLabel(capability: LogicalModelCapability) {
    return capability === "image" ? "图片" : capability === "video" ? "视频" : capability === "audio" ? "音频" : "文本";
}
