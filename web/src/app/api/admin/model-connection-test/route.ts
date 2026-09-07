import { randomUUID } from "node:crypto";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";`r`nimport { readJsonBody } from "@/lib/auth/request";
import { getAuthSettings, type LogicalModelCapability } from "@/lib/auth/store";
import { channelConnectionReady, protocolAuthHeaders } from "@/lib/channel-protocol-registry";
import { buildModelCatalogUrls, parseModelCatalog } from "@/lib/server/admin-model-catalog";
import { fetchSafeOutbound } from "@/lib/server/safe-outbound-fetch";
import { isSafeOutboundUrl } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_TIMEOUT_MS = 15_000;

type TestTarget = { logicalModelId?: unknown; capability?: unknown };
type ChannelResult = {
    channelId: string;
    channelName: string;
    upstreamModel: string;
    status: "available" | "unavailable";
    responseMs: number;
    requestId: string;
    error?: string;
};

type ModelResult = {
    logicalModelId: string;
    modelName: string;
    capability: LogicalModelCapability;
    status: "available" | "partial" | "unavailable" | "untested";
    testedAt: string;
    signature: string;
    channels: ChannelResult[];
};

export async function POST(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return Response.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "upstream.manage")) return Response.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });

    const body = await readJsonBody<{ targets?: TestTarget[] }>(request, 64 * 1024);
    const targets = Array.isArray(body.targets) ? body.targets : [];
    if (!targets.length) return Response.json({ code: 400, data: null, msg: "至少选择一个模型" }, { status: 400 });

    const settings = await getAuthSettings();
    const seen = new Set<string>();
    const normalized = targets
        .map((target) => ({ logicalModelId: typeof target.logicalModelId === "string" ? target.logicalModelId.trim() : "", capability: target.capability }))
        .filter((target): target is { logicalModelId: string; capability: LogicalModelCapability } => Boolean(target.logicalModelId) && isCapability(target.capability))
        .filter((target) => {
            const key = `${target.capability}:${target.logicalModelId.toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    if (!normalized.length) return Response.json({ code: 400, data: null, msg: "模型参数无效" }, { status: 400 });

    const testedAt = new Date().toISOString();
    const results = await Promise.all(normalized.map(({ logicalModelId, capability }) => testLogicalModel(settings, logicalModelId, capability, testedAt)));
    return Response.json({ code: 0, data: { testedAt, results }, msg: "OK" });
}

async function testLogicalModel(settings: Awaited<ReturnType<typeof getAuthSettings>>, logicalModelId: string, capability: LogicalModelCapability, testedAt: string): Promise<ModelResult> {
    const model = settings.logicalModels.find((item) => item.enabled && item.id.toLowerCase() === logicalModelId.toLowerCase());
    const signature = model ? modelSignature(model, settings.systemChannels) : `${capability}:${logicalModelId}:missing`;
    if (!model) {
        return {
            logicalModelId,
            modelName: logicalModelId,
            capability,
            status: "unavailable",
            testedAt,
            signature,
            channels: [{ channelId: "", channelName: "", upstreamModel: "", status: "unavailable", responseMs: 0, requestId: randomUUID(), error: "逻辑模型不存在或已停用" }],
        };
    }

    const bindings = model.bindings.filter((binding) => binding.enabled).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const channels = await Promise.all(
        bindings.map(async (binding): Promise<ChannelResult> => {
            const channel = settings.systemChannels.find((item) => item.id === binding.channelId);
            const requestId = randomUUID();
            const startedAt = Date.now();
            if (!channel || !channel.enabled || !channelConnectionReady(channel) || !channel.models.some((item) => normalize(item) === normalize(binding.upstreamModel))) {
                return {
                    channelId: binding.channelId,
                    channelName: channel?.name || binding.channelId,
                    upstreamModel: binding.upstreamModel,
                    status: "unavailable",
                    responseMs: Date.now() - startedAt,
                    requestId,
                    error: "渠道未启用、凭据未配置或模型未绑定",
                };
            }
            try {
                const urls = buildModelCatalogUrls(channel.baseUrl, channel.apiFormat, channel.advancedConfig?.modelCatalogPaths);
                let lastError = "无法访问模型目录";
                for (const url of urls) {
                    if (!(await isSafeOutboundUrl(url, { allowCredentials: false }))) {
                        lastError = "模型目录地址不允许访问";
                        continue;
                    }
                    const response = await fetchSafeOutbound(url, {
                        method: "GET",
                        headers: protocolAuthHeaders(channel.apiKey, channel.advancedConfig, channel.apiFormat),
                        cache: "no-store",
                        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
                    });
                    const raw = await response.text();
                    if (!response.ok) {
                        lastError = `上游返回 HTTP ${response.status}${raw ? `：${raw.slice(0, 180)}` : ""}`;
                        continue;
                    }
                    const parsed = (() => {
                        try {
                            return JSON.parse(raw) as unknown;
                        } catch {
                            return null;
                        }
                    })();
                    const models = parsed ? parseModelCatalog(parsed, "provider", channel.advancedConfig?.protocol) : [];
                    const listed = models.some((item) => normalize(item.id) === normalize(binding.upstreamModel));
                    if (listed || (models.length === 0 && channel.models.some((item) => normalize(item) === normalize(binding.upstreamModel)))) {
                        return { channelId: channel.id, channelName: channel.name, upstreamModel: binding.upstreamModel, status: "available", responseMs: Date.now() - startedAt, requestId };
                    }
                    lastError = "上游模型目录中未找到该模型";
                }
                return { channelId: channel.id, channelName: channel.name, upstreamModel: binding.upstreamModel, status: "unavailable", responseMs: Date.now() - startedAt, requestId, error: lastError };
            } catch (error) {
                return {
                    channelId: channel.id,
                    channelName: channel.name,
                    upstreamModel: binding.upstreamModel,
                    status: "unavailable",
                    responseMs: Date.now() - startedAt,
                    requestId,
                    error: error instanceof Error && error.name === "TimeoutError" ? "上游模型目录请求超时" : error instanceof Error ? error.message : "连接测试失败",
                };
            }
        }),
    );
    const available = channels.filter((item) => item.status === "available").length;
    const status = !channels.length || available === 0 ? "unavailable" : available === channels.length ? "available" : "partial";
    return { logicalModelId: model.id, modelName: model.name, capability, status, testedAt, signature, channels };
}

function isCapability(value: unknown): value is LogicalModelCapability {
    return value === "text" || value === "image" || value === "video" || value === "audio";
}

function normalize(value: string) {
    return value
        .trim()
        .replace(/^models\//i, "")
        .toLowerCase();
}

function modelSignature(
    model: { id: string; capability: string; enabled: boolean; bindings: Array<{ id: string; channelId: string; upstreamModel: string; enabled: boolean; priority: number }> },
    channels: Array<{ id: string; enabled: boolean; baseUrl: string; apiFormat: string; models: string[]; apiKey?: string; hasApiKey?: boolean; advancedConfig?: unknown }>,
) {
    const bindings = model.bindings.map((binding) => ({ ...binding })).sort((a, b) => a.id.localeCompare(b.id));
    const channelIds = new Set(bindings.map((binding) => binding.channelId));
    const channelShape = channels
        .filter((channel) => channelIds.has(channel.id))
        .map((channel) => ({ id: channel.id, enabled: channel.enabled, baseUrl: channel.baseUrl, apiFormat: channel.apiFormat, models: channel.models, advancedConfig: channel.advancedConfig }))
        .sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify({ id: model.id, capability: model.capability, enabled: model.enabled, bindings, channelShape });
}

