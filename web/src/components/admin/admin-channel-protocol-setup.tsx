"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Checkbox, Input, Select, Tag } from "antd";
import { FileSearch, WandSparkles } from "lucide-react";

import { LabeledControl } from "@/components/admin/admin-settings-controls";
import { applyChannelProtocol, channelProtocolDefinition, channelProtocolOptions } from "@/lib/channel-protocol-registry";
import type { ChannelProtocolDraft } from "@/lib/channel-protocol-draft";
import type { LogicalModelCapability, SystemChannelAdvancedConfig, SystemChannelAuthMode, SystemChannelProtocol, SystemModelChannel } from "@/lib/auth/store";
import { normalizeModelId } from "@/lib/model-capability";
import { createAdminChannelProtocolDraft, getAdminChannelProtocolHistory, type AdminChannelProtocolHistoryRecord } from "@/services/api/admin-channel-protocol";
import { channelDetectedCapabilities } from "@/lib/model-routing-config";

const capabilityOptions: Array<{ label: string; value: LogicalModelCapability }> = [
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

export function AdminChannelProtocolSetup({
    channel,
    targetModel,
    referenceTypes,
    protocolLocked = false,
    onChange,
    onAnalyzeAndVerify,
}: {
    onAnalyzeAndVerify?: (patch: Partial<SystemModelChannel>) => Promise<boolean | void>;
    channel: SystemModelChannel;
    targetModel?: string;
    referenceTypes?: Array<"image" | "video" | "audio">;
    protocolLocked?: boolean;
    onChange: (patch: Partial<SystemModelChannel>) => boolean | void;
}) {
    const { message } = App.useApp();
    const protocol = channel.advancedConfig?.protocol || "auto";
    const definition = channelProtocolDefinition(protocol);
    const detectedCapabilities = channelDetectedCapabilities(channel);
    const [documentationUrl, setDocumentationUrl] = useState(channel.advancedConfig?.documentationUrl || "");
    const [documentationText, setDocumentationText] = useState("");
    const [examples, setExamples] = useState("");
    const [useTextModel, setUseTextModel] = useState(true);
    const [loading, setLoading] = useState(false);
    const [drafts, setDrafts] = useState<ChannelProtocolDraft[]>([]);
    const [selectedDraftIndex, setSelectedDraftIndex] = useState(0);
    const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
    const [sourcePages, setSourcePages] = useState(0);
    const [history, setHistory] = useState<AdminChannelProtocolHistoryRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState("");
    const scopeRef = useRef("");
    const actionRef = useRef(false);
    const draft = drafts[selectedDraftIndex] || null;
    useEffect(() => {
        const scope = `${channel.id}:${targetModel || ""}`;
        scopeRef.current = scope;
        if (!targetModel) return;
        let disposed = false;
        setHistoryLoading(true);
        setHistoryError("");
        setHistory([]);
        setDrafts([]);
        setDraftWarnings([]);
        setDocumentationUrl("");
        setDocumentationText("");
        setExamples("");
        void getAdminChannelProtocolHistory(channel.id, targetModel)
            .then((records) => {
                if (disposed) return;
                setHistory(records);
                const latest = records[0];
                if (latest) {
                    setDocumentationUrl(latest.input.documentationUrl || "");
                    setDocumentationText(latest.input.documentationText || "");
                    setExamples(latest.input.examples || "");
                    setUseTextModel(latest.input.useTextModel ?? true);
                    setHistoryError(latest.error || "");
                }
                const successful = records.find((record) => record.result?.drafts.length);
                if (successful?.result) {
                    setDrafts(successful.result.drafts);
                    setSelectedDraftIndex(0);
                    setDraftWarnings(successful.result.warnings);
                    setSourcePages(successful.result.sourcePages);
                }
            })
            .catch((error) => {
                if (!disposed) setHistoryError(error instanceof Error ? error.message : "读取历史失败");
            })
            .finally(() => {
                if (!disposed) setHistoryLoading(false);
            });
        return () => {
            disposed = true;
            if (scopeRef.current === scope) scopeRef.current = "";
        };
    }, [channel.id, targetModel]);
    const restoreHistory = (id: string) => {
        if (actionRef.current || historyLoading) return;
        const record = history.find((item) => item.id === id);
        if (!record) return;
        setDocumentationUrl(record.input.documentationUrl || "");
        setDocumentationText(record.input.documentationText || "");
        setExamples(record.input.examples || "");
        setUseTextModel(record.input.useTextModel ?? true);
        setHistoryError(record.error || "");
        if (record.result) {
            setDrafts(record.result.drafts);
            setSelectedDraftIndex(0);
            setDraftWarnings(record.result.warnings);
            setSourcePages(record.result.sourcePages);
        }
    };

    const selectProtocol = (value: SystemChannelProtocol) => {
        setDrafts([]);
        setDraftWarnings([]);
        onChange(applyChannelProtocol(channel, value));
    };
    const analyze = async (verify = false) => {
        if (actionRef.current || historyLoading) return;
        actionRef.current = true;
        setLoading(true);
        const analysisScope = scopeRef.current;
        try {
            const result = await createAdminChannelProtocolDraft({ documentationUrl, documentationText, examples, useTextModel, ...(referenceTypes ? { referenceTypes } : {}), ...(targetModel ? { channelId: channel.id, targetModel } : {}) });
            if (scopeRef.current !== analysisScope) return;
            setHistoryError("");
            setDrafts(result.drafts);
            setSelectedDraftIndex(0);
            setDraftWarnings(result.warnings);
            setSourcePages(result.sourcePages);
            if (verify && targetModel && onAnalyzeAndVerify) {
                const latestDraft = selectProtocolVerificationDraft(result.drafts, targetModel);
                await onAnalyzeAndVerify(buildProtocolDraftPatch(channel, latestDraft, documentationUrl));
            } else {
                message.success(result.drafts.some((item) => item.assisted) ? "已分析上游协议，请逐项复核后应用" : "已从文档与示例提取协议");
            }
        } catch (error) {
            if (scopeRef.current !== analysisScope) return;
            setHistoryError(error instanceof Error ? error.message : "协议分析失败");
            message.error(error instanceof Error ? error.message : "协议分析失败");
        } finally {
            if (targetModel && scopeRef.current === analysisScope) {
                try {
                    const records = await getAdminChannelProtocolHistory(channel.id, targetModel);
                    if (scopeRef.current === analysisScope) setHistory(records);
                } catch {
                    /* Keep the prior analysis visible if refreshing history fails. */
                }
            }
            actionRef.current = false;
            setLoading(false);
        }
    };
    const applyDraft = () => {
        if (!draft || actionRef.current || historyLoading) return;
        const applied = onChange(buildProtocolDraftPatch(channel, draft, documentationUrl));
        if (applied === false) return;
        message.success(drafts.length > 1 ? "当前协议已应用；其他上游地址请分别建立或编辑渠道" : "整套协议已应用；同步模型目录后会自动继承对应能力配置");
    };
    const updateAuth = (patch: Partial<SystemChannelAdvancedConfig>) => onChange({ advancedConfig: { ...channel.advancedConfig!, ...patch } });

    return (
        <section className="mt-3 border-y border-stone-200 bg-stone-50/70 px-3 py-3 dark:border-stone-800 dark:bg-stone-900/35">
            {!protocolLocked ? (
                <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)] lg:items-end">
                    <LabeledControl label="接口协议">
                        <Select
                            className="w-full"
                            value={protocol}
                            optionLabelProp="label"
                            options={channelProtocolOptions().map((item) => ({
                                value: item.value,
                                label: item.label,
                                title: item.description,
                            }))}
                            optionRender={(option) => (
                                <div className="py-1">
                                    <div className="font-medium text-stone-900 dark:text-stone-100">{option.data.label}</div>
                                    <div className="mt-0.5 whitespace-normal text-xs leading-5 text-stone-500 dark:text-stone-400">{option.data.title}</div>
                                </div>
                            )}
                            onChange={selectProtocol}
                        />
                    </LabeledControl>
                    <div className="min-w-0 pb-0.5 text-xs leading-5 text-stone-500 dark:text-stone-400">
                        <div>
                            {definition.label} 协议；
                            {detectedCapabilities.size
                                ? `当前接口已识别 ${Array.from(detectedCapabilities)
                                      .map((item) => capabilityOptions.find((option) => option.value === item)?.label)
                                      .join("、")}模型。`
                                : "请先拉取或填写模型。"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                            {definition.capabilities
                                .filter((item) => detectedCapabilities.has(item))
                                .map((item) => (
                                    <Tag key={item} className="m-0">
                                        {capabilityOptions.find((option) => option.value === item)?.label}
                                    </Tag>
                                ))}
                            {!detectedCapabilities.size ? <Tag className="m-0">待拉取模型</Tag> : null}
                            {definition.strict ? <Tag className="m-0">严格路径</Tag> : null}
                            {definition.builtInModels?.length ? <Tag className="m-0">内置 {definition.builtInModels.length} 个模型</Tag> : null}
                        </div>
                    </div>
                </div>
            ) : null}
            {protocol === "custom" ? (
                <div className={protocolLocked ? "" : "mt-3 border-t border-stone-200 pt-3 dark:border-stone-800"}>
                    {!protocolLocked ? (
                        <div className="mb-3 grid gap-3 sm:grid-cols-2">
                            <LabeledControl label="鉴权方式">
                                <Select
                                    className="w-full"
                                    value={channel.advancedConfig?.authMode || "bearer"}
                                    options={authModeOptions}
                                    onChange={(value: SystemChannelAuthMode) => updateAuth({ authMode: value, ...(value !== "custom-header" ? { authHeader: "", authPrefix: "" } : {}) })}
                                />
                            </LabeledControl>
                            {channel.advancedConfig?.authMode === "custom-header" ? (
                                <>
                                    <LabeledControl label="鉴权 Header">
                                        <Input value={channel.advancedConfig.authHeader} placeholder="例如 X-API-Key" onChange={(event) => updateAuth({ authHeader: event.target.value })} />
                                    </LabeledControl>
                                    <LabeledControl label="值前缀（可选）">
                                        <Input value={channel.advancedConfig.authPrefix} placeholder="例如 Token" onChange={(event) => updateAuth({ authPrefix: event.target.value })} />
                                    </LabeledControl>
                                </>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="flex items-start gap-2">
                        <FileSearch className="mt-0.5 size-4 shrink-0 text-stone-500 dark:text-stone-400" />
                        <div>
                            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">自定义协议助手</div>
                            <div className="mt-0.5 text-xs leading-5 text-stone-500 dark:text-stone-400">提供官方文档链接或完整 cURL、请求 JSON、成功响应 JSON。系统只生成声明式草稿，不执行文档代码，也不会把 API Key 发给文本模型。</div>
                        </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <LabeledControl label="官方文档链接（可选）">
                                <Input disabled={historyLoading || loading} value={documentationUrl} placeholder="https://provider.example.com/docs/api" onChange={(event) => setDocumentationUrl(event.target.value)} />
                            </LabeledControl>
                        </div>
                        <div className="sm:col-span-2">
                            <LabeledControl label="补充文档（可选）">
                                <Input.TextArea disabled={historyLoading || loading} rows={4} value={documentationText} placeholder="可粘贴文档正文、鉴权说明、分页规则或参数表" onChange={(event) => setDocumentationText(event.target.value)} />
                            </LabeledControl>
                        </div>
                        <div className="sm:col-span-2">
                            <LabeledControl label="请求与响应示例">
                                <Input.TextArea
                                    disabled={historyLoading || loading}
                                    rows={6}
                                    value={examples}
                                    placeholder={"可补充模型目录、创建、查询、取消和成功响应示例，例如：\nGET /v1/models\nPOST /v1/jobs\nGET /v1/jobs/:task_id"}
                                    onChange={(event) => setExamples(event.target.value)}
                                />
                            </LabeledControl>
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <Checkbox disabled={historyLoading || loading} checked={useTextModel} onChange={(event) => setUseTextModel(event.target.checked)}>
                            使用后台默认文本模型辅助识别
                        </Checkbox>
                        <Button type="primary" icon={<WandSparkles className="size-4" />} loading={loading || historyLoading} disabled={historyLoading || loading} onClick={() => void analyze()}>
                            仅分析接口
                        </Button>
                        {targetModel && onAnalyzeAndVerify ? (
                            <Button type="primary" icon={<WandSparkles className="size-4" />} loading={loading} disabled={historyLoading || loading} onClick={() => void analyze(true)}>
                                AI 分析并真实验证（产生费用）
                            </Button>
                        ) : null}
                    </div>
                    {targetModel && onAnalyzeAndVerify ? <div className="mt-2 text-xs text-stone-500">会保存当前模型协议并发起真实生成，可能产生费用；本轮最多一次成功，未知任务不重复提交。修改参考素材和生成规格请在“生成结果与诊断”设置。</div> : null}
                    {historyError ? <Alert className="mt-3" type="warning" showIcon message={historyError} description="保留最近一次成功分析结果；本次失败不会覆盖已应用配置。" /> : null}
                    {history.length ? (
                        <div className="mt-3">
                            <LabeledControl label="分析历史（选择恢复，不会自动应用）">
                                <Select
                                    className="w-full"
                                    disabled={loading || historyLoading}
                                    placeholder="查看或恢复历史分析"
                                    onChange={restoreHistory}
                                    options={history.map((record) => ({ value: record.id, label: `${new Date(record.createdAt).toLocaleString()} · ${record.result ? "分析成功" : "分析失败"}` }))}
                                />
                            </LabeledControl>
                        </div>
                    ) : null}
                    {draft ? (
                        <div className="mt-3 border-l-2 border-stone-400 pl-3 text-xs leading-5 text-stone-600 dark:border-stone-600 dark:text-stone-300">
                            {draftWarnings.length ? <Alert className="mb-3" type="warning" showIcon message={draftWarnings[0]} description={draftWarnings.slice(1).join("；") || undefined} /> : null}
                            {drafts.length > 1 ? (
                                <div className="mb-3 max-w-xl">
                                    <LabeledControl label="选择要应用的上游协议">
                                        <Select className="w-full" value={selectedDraftIndex} options={drafts.map((item, index) => ({ value: index, label: draftOptionLabel(item, index) }))} onChange={setSelectedDraftIndex} />
                                    </LabeledControl>
                                </div>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="mr-1 font-semibold text-stone-900 dark:text-stone-100">协议分析结果</span>
                                {sourcePages ? <Tag className="m-0">文档页 {sourcePages}</Tag> : null}
                                <Tag className="m-0">目录 {draft.modelCatalogPaths.length}</Tag>
                                <Tag className="m-0">能力 {draft.operations.length}</Tag>
                                <Tag className="m-0">模型 {new Set(draft.operations.flatMap((item) => item.models.map(normalizeModelId))).size}</Tag>
                            </div>
                            {draft.modelCatalogPaths.length ? <div className="mt-2 break-all">模型目录：{draft.modelCatalogPaths.join("、")}</div> : null}
                            <div className="mt-2 divide-y divide-stone-200 border-y border-stone-200 dark:divide-stone-800 dark:border-stone-800">
                                {draft.operations.map((operation) => (
                                    <div key={`${operation.capability}:${operation.config.createPath}`} className="py-2">
                                        <div className="font-medium text-stone-900 dark:text-stone-100">
                                            {capabilityOptions.find((item) => item.value === operation.capability)?.label} · {operation.models.length ? `${operation.models.length} 个已识别模型` : "同步目录后自动匹配模型"}
                                        </div>
                                        <div className="mt-0.5 break-all">
                                            创建 {operation.config.createPath}
                                            {operation.config.editPath ? ` · 编辑 ${operation.config.editPath}` : ""}
                                            {operation.config.imageToVideoPath ? ` · 图生视频 ${operation.config.imageToVideoPath}` : ""}
                                            {operation.config.queryPath ? ` · 查询 ${operation.config.queryPath}` : ""}
                                            {operation.config.cancelPath ? ` · 取消 ${operation.config.cancelMethod || "POST"} ${operation.config.cancelPath}` : ""}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button className="mt-2" type="primary" size="small" disabled={loading || historyLoading} onClick={applyDraft}>
                                {drafts.length > 1 ? "应用当前协议" : "应用全部配置"}
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}

const authModeOptions: Array<{ label: string; value: SystemChannelAuthMode }> = [
    { label: "无需鉴权", value: "none" },
    { label: "Bearer Token", value: "bearer" },
    { label: "X-API-Key", value: "x-api-key" },
    { label: "自定义 Header", value: "custom-header" },
];

function draftOptionLabel(draft: ChannelProtocolDraft, index: number) {
    let host = "待填写 Base URL";
    try {
        host = new URL(draft.baseUrl).host || host;
    } catch {
        host = draft.baseUrl || host;
    }
    const capabilities = draft.operations.map((operation) => capabilityOptions.find((item) => item.value === operation.capability)?.label).filter(Boolean);
    return `${index + 1}. ${host} · ${Array.from(new Set(capabilities)).join("、")}`;
}

/** Select only a uniquely attributable fresh result; never auto-apply a stale/ambiguous draft. */
export function selectProtocolVerificationDraft(drafts: ChannelProtocolDraft[], targetModel: string): ChannelProtocolDraft {
    const model = normalizeModelId(targetModel);
    const matching = drafts.filter((draft) => draft.operations.some((operation) => operation.models.some((name) => normalizeModelId(name) === model)));
    if (matching.length === 1) return matching[0];
    if (matching.length === 0 && drafts.length === 1 && drafts[0].operations.length > 0 && drafts[0].operations.every((operation) => operation.models.length === 0)) return drafts[0];
    throw new Error("分析结果未唯一匹配当前模型，请选择正确的协议草稿后再应用并测试；尚未发起生成。");
}
export function buildProtocolDraftPatch(channel: SystemModelChannel, draft: ChannelProtocolDraft, documentationUrl: string): Partial<SystemModelChannel> {
    const advanced = channel.advancedConfig || applyChannelProtocol(channel, "custom").advancedConfig!;
    const modelCapabilities = { ...(advanced.modelCapabilities || {}) };
    const modelConfigs = { ...(advanced.modelConfigs || {}) };
    const operationConfigs = { ...(advanced.operationConfigs || {}) };
    const discoveredModels: string[] = [];
    draft.operations.forEach((operation) => {
        operationConfigs[operation.capability] = operation.config;
        operation.models.forEach((model) => {
            const key = normalizeModelId(model);
            if (!key) return;
            discoveredModels.push(model);
            modelCapabilities[key] = operation.capability;
            modelConfigs[key] = operation.config;
        });
    });
    const nextAdvanced: SystemChannelAdvancedConfig = {
        ...advanced,
        protocol: "custom",
        authMode: draft.authMode,
        authHeader: draft.authHeader,
        authPrefix: draft.authPrefix,
        documentationUrl: draft.documentationUrl || documentationUrl,
        modelCatalogPaths: Array.from(new Set([...(advanced.modelCatalogPaths || []), ...draft.modelCatalogPaths])),
        modelCapabilities,
        modelConfigs,
        operationConfigs,
    };
    return {
        baseUrl: draft.baseUrl || channel.baseUrl,
        apiFormat: draft.apiFormat,
        models: Array.from(new Set([...channel.models, ...discoveredModels])),
        advancedConfig: nextAdvanced,
    };
}
