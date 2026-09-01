import type { ApiCallFormat, AuthSettings, LogicalModel, SystemDefaultModels, SystemModelChannel } from "@/lib/auth/store";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";
import { isLogicalModelResolvable, resolveVisionModelConfig } from "@/lib/model-routing-config";
import { isEncryptedSecretValue } from "@/lib/server/secret-crypto";
import { normalizeModelId } from "@/lib/model-capability";
import { validateRunningHubWorkflowConfig } from "./runninghub-workflow-domain";

type ChannelCredentialInput = {
    channelId?: unknown;
    baseUrl?: unknown;
    apiKey?: unknown;
    apiFormat?: unknown;
};

export function serializeAdminSettings(settings: AuthSettings): AuthSettings {
    return {
        ...settings,
        systemChannels: settings.systemChannels.map((channel) => {
            const serialized = channelWithoutSecretControls(channel);
            return {
                ...serialized,
                apiKey: "",
                webhookSecret: "",
                hasApiKey: isUsableAdminChannelApiKey(channel.apiKey),
                hasWebhookSecret: isUsableAdminChannelWebhookSecret(channel.webhookSecret),
            };
        }),
    };
}

export function serializeAdminSettingsForUser(settings: AuthSettings, user: { role?: unknown; status?: unknown; adminPermissions?: unknown }): AuthSettings {
    const serialized = serializeAdminSettings(settings);
    if (!hasAdminPermission(user, "system.manage")) {
        serialized.mail = { ...DEFAULT_SETTINGS.mail };
        serialized.dataLifecycle = { ...DEFAULT_SETTINGS.dataLifecycle };
    }
    if (!hasAdminPermission(user, "upstream.manage")) {
        serialized.generationCostControl = { ...DEFAULT_SETTINGS.generationCostControl };
        serialized.agentSkills = [];
        serialized.systemChannels = serialized.systemChannels.map(channelSummaryWithoutConfiguration);
        serialized.practiceDefaultModels = { ...DEFAULT_SETTINGS.practiceDefaultModels };
        serialized.practiceWorkflowModels = {};
    }
    return serialized;
}

export function mergeSystemChannelSecrets(channels: SystemModelChannel[], savedChannels: SystemModelChannel[]) {
    const savedById = new Map(savedChannels.map((channel) => [channel.id, channel]));
    return channels.map((channel) => {
        const saved = savedById.get(channel.id);
        const submittedWebhookSecret = plainSecret(channel.webhookSecret);
        const merged = channelWithoutSecretControls(channel);
        return {
            ...merged,
            apiKey: channel.clearApiKey ? "" : usableApiKey(channel.apiKey) || usableApiKey(saved?.apiKey),
            webhookSecret: channel.clearWebhookSecret ? "" : submittedWebhookSecret || usableWebhookSecret(saved?.webhookSecret),
        };
    });
}

export function systemChannelWebhookSecretValidationError(channel: SystemModelChannel) {
    const secret = plainSecret(channel.webhookSecret);
    if (!secret) return "";
    if (secret.length < 32) return `渠道“${channel.name || channel.id}”的生成回调密钥至少需要 32 个字符`;
    if (secret.length > 4_000) return `渠道“${channel.name || channel.id}”的生成回调密钥不能超过 4000 个字符`;
    return "";
}

export function runningHubChannelValidationErrors(channel: SystemModelChannel) {
    if (channel.advancedConfig?.protocol !== "runninghub") return [];
    const errors: string[] = [];
    const label = channel.name || channel.id || "RunningHub 渠道";
    if (!channel.baseUrl.trim()) errors.push(`${label} 必须填写 Base URL`);
    else {
        try {
            const url = new URL(channel.baseUrl);
            if (!/^https?:$/.test(url.protocol)) errors.push(`${label} 的 Base URL 必须使用 HTTP 或 HTTPS`);
        } catch {
            errors.push(`${label} 的 Base URL 无效`);
        }
    }
    if (channel.purpose !== "production" && channel.purpose !== "open-source-practice" && channel.purpose !== "shared") errors.push(`${label} 渠道用途必须选择正式生产、无限练习或共享`);
    if (!isUsableAdminChannelApiKey(channel.apiKey)) errors.push(`${label} 必须填写 API Key`);
    const configs = channel.advancedConfig.modelConfigs || {};
    for (const model of channel.models) {
        const config = configs[normalizeModelId(model)];
        if (!config) {
            errors.push(`${model} 缺少 RunningHub 模型任务配置`);
            continue;
        }
        for (const [field, title] of [
            [config.createPath, "创建路径"],
            [config.queryPath, "查询路径"],
            [config.requestTemplate, "请求模板"],
            [config.taskIdField, "任务 ID 字段"],
            [config.resultField, "结果字段"],
            [config.statusField, "状态字段"],
        ] as const) {
            if (!field?.trim()) errors.push(`${model} 缺少 RunningHub ${title}`);
        }
        if (config.protocol && config.protocol !== "runninghub") errors.push(`${model} 的模型协议必须为 RunningHub`);
    }
    const workflowConfigs = channel.advancedConfig.workflowConfigs || {};
    const workflowValues = Object.values(workflowConfigs);
    for (const [workflowKey, workflowConfig] of Object.entries(workflowConfigs)) {
        for (const error of validateRunningHubWorkflowConfig(workflowConfig, workflowValues)) errors.push(`${workflowKey}：${error}`);
    }
    return errors;
}

export function practiceDefaultModelValidationErrors(defaults: Partial<SystemDefaultModels> | undefined, logicalModels: LogicalModel[], channels: SystemModelChannel[]) {
    const errors: string[] = [];
    const keys: Array<[keyof SystemDefaultModels, string]> = [
        ["textModel", "文本"],
        ["imageModel", "图片"],
        ["videoModel", "视频"],
        ["audioModel", "音频"],
    ];
    for (const [key, label] of keys) {
        const modelId = typeof defaults?.[key] === "string" ? defaults[key]!.trim() : "";
        if (modelId && !isLogicalModelResolvable(logicalModels, channels, key.slice(0, -5) as "text" | "image" | "video" | "audio", modelId, "open-source-practice")) {
            errors.push(`练习默认${label}模型不可解析：${modelId}`);
        }
    }
    const visionModel = typeof defaults?.visionModel === "string" ? defaults.visionModel.trim() : "";
    if (visionModel && !resolveVisionModelConfig(logicalModels, channels, visionModel, "open-source-practice")) {
        errors.push(`练习默认视觉理解模型不可解析：${visionModel}`);
    }
    return errors;
}

export function resolveAdminChannelCredentials(settings: AuthSettings, input: ChannelCredentialInput) {
    const channelId = text(input.channelId);
    const savedChannel = settings.systemChannels.find((channel) => channel.id === channelId);
    const apiFormat: ApiCallFormat = input.apiFormat === "gemini" || input.apiFormat === "openai" ? input.apiFormat : savedChannel?.apiFormat === "gemini" ? "gemini" : "openai";
    return {
        channelId,
        savedChannel,
        baseUrl: text(input.baseUrl) || savedChannel?.baseUrl.trim() || "",
        apiKey: usableApiKey(input.apiKey) || usableApiKey(savedChannel?.apiKey),
        apiFormat,
    };
}

export function isUsableAdminChannelApiKey(value: unknown) {
    const apiKey = text(value);
    return Boolean(apiKey) && !isEncryptedSecretValue(apiKey);
}

export function isUsableAdminChannelWebhookSecret(value: unknown) {
    const secret = text(value);
    return secret.length >= 32 && !isEncryptedSecretValue(secret);
}

export function sanitizeProviderMessage(value: unknown, secrets: string[] = []) {
    let message = typeof value === "string" ? value : value instanceof Error ? value.message : "";
    for (const secret of secrets.filter(Boolean)) message = message.replaceAll(secret, "[REDACTED]");
    return message
        .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
        .replace(/\bsk-[a-z0-9_-]{8,}/gi, "[REDACTED]")
        .replace(/([?&](?:api[_-]?key|key|token)=)[^&#\s]+/gi, "$1[REDACTED]")
        .slice(0, 500);
}

export function isProviderTimeoutError(error: unknown) {
    return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function usableApiKey(value: unknown) {
    const apiKey = text(value);
    return isUsableAdminChannelApiKey(apiKey) ? apiKey : "";
}

function usableWebhookSecret(value: unknown) {
    return isUsableAdminChannelWebhookSecret(value) ? text(value) : "";
}

function plainSecret(value: unknown) {
    const secret = text(value);
    return secret && !isEncryptedSecretValue(secret) ? secret : "";
}

function channelWithoutSecretControls(channel: SystemModelChannel) {
    const result = { ...channel };
    delete result.hasApiKey;
    delete result.clearApiKey;
    delete result.hasWebhookSecret;
    delete result.clearWebhookSecret;
    return result;
}

function channelSummaryWithoutConfiguration(channel: SystemModelChannel): SystemModelChannel {
    return {
        id: channel.id,
        name: channel.name,
        baseUrl: "",
        apiKey: "",
        apiFormat: channel.apiFormat,
        models: [...channel.models],
        enabled: channel.enabled,
    };
}
