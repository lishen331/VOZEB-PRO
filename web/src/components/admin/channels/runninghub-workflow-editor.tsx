"use client";

import { Alert, App, Button, Checkbox, Collapse, Drawer, Input, InputNumber, Select, Space, Tabs } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RunningHubWorkflowBusinessCode, RunningHubWorkflowConfig } from "@/lib/auth/store-types";
import type { PublicRunningHubWorkflow } from "@/lib/server/runninghub-workflow-service";
import type { RunningHubWorkflowDiscovery } from "@/lib/server/runninghub-workflow-discovery";

const businessOptions: Array<{ value: RunningHubWorkflowBusinessCode; label: string; capability: RunningHubWorkflowConfig["capability"] }> = [
    { value: "script", label: "脚本", capability: "text" },
    { value: "storyboard-image", label: "分镜图片", capability: "image" },
    { value: "storyboard-video", label: "分镜视频", capability: "video" },
    { value: "dubbing", label: "配音", capability: "audio" },
    { value: "music", label: "音乐", capability: "audio" },
    { value: "canvas", label: "Canvas", capability: "image" },
    { value: "drama", label: "短剧练习项目", capability: "text" },
];

type Props = {
    open: boolean;
    channelId: string;
    workflow?: PublicRunningHubWorkflow;
    autoDiscover?: boolean;
    onClose: () => void;
    onSaved: () => Promise<void>;
};

type Draft = Partial<RunningHubWorkflowConfig> & { channelId: string };

const jsonDefaults = {
    inputSchema: "[]",
    nodeMappings: "[]",
    outputMappings: "[]",
    runOptions: "{}",
};

export function RunningHubWorkflowEditor({ open, channelId, workflow, autoDiscover = false, onClose, onSaved }: Props) {
    const { message } = App.useApp();
    const [draft, setDraft] = useState<Draft>(() => makeDraft(channelId, workflow));
    const [jsonText, setJsonText] = useState(jsonDefaults);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [discovering, setDiscovering] = useState(false);
    const [discovery, setDiscovery] = useState<RunningHubWorkflowDiscovery | null>(null);
    const [activeTab, setActiveTab] = useState("basic");
    const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
    const autoDiscoverStarted = useRef(false);
    const business = businessOptions.find((item) => item.value === draft.businessCode);

    useEffect(() => {
        if (!open) return;
        setDraft(makeDraft(channelId, workflow));
        setJsonText({
            inputSchema: JSON.stringify(workflow?.inputSchema || [], null, 2),
            nodeMappings: JSON.stringify(workflow?.nodeMappings || [], null, 2),
            outputMappings: JSON.stringify(workflow?.outputMappings || [], null, 2),
            runOptions: JSON.stringify(workflow?.runOptions || {}, null, 2),
        });
        setErrors({});
        setDiscovery(null);
        setActiveTab("basic");
        setSelectedCandidates([]);
        autoDiscoverStarted.current = false;
    }, [channelId, open, workflow]);

    const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
    const parseJson = (key: keyof typeof jsonText, expected: "array" | "object") => {
        try {
            const value: unknown = JSON.parse(jsonText[key]);
            if (expected === "array" && !Array.isArray(value)) throw new Error("必须是数组");
            if (expected === "object" && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error("必须是对象");
            return value;
        } catch (error) {
            setErrors((current) => ({ ...current, [key]: error instanceof Error ? error.message : "JSON 格式错误" }));
            return undefined;
        }
    };

    const submit = async () => {
        const nextErrors: Record<string, string> = ;
        if (!String(draft.workflowName || "").trim()) nextErrors.workflowName = "请填写工作流名称";
        if (!String(draft.workflowId || "").trim()) nextErrors.workflowId = "请填写 Workflow ID";
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) return;
        const inputSchema = parseJson("inputSchema", "array");
        const nodeMappings = parseJson("nodeMappings", "array");
        const outputMappings = parseJson("outputMappings", "array");
        const runOptions = parseJson("runOptions", "object");
        if ([inputSchema, nodeMappings, outputMappings, runOptions].some((value) => value === undefined)) return;

        // 根据用户勾选的候选项过滤配置
        // 如果没有 discovery 或没有勾选任何项，使用 JSON 编辑器的完整配置（向后兼容）
        let confirmedInputSchema = inputSchema;
        let confirmedNodeMappings = nodeMappings;
        let confirmedOutputMappings = outputMappings;

        if (discovery && selectedCandidates.length > 0) {
            // 过滤 inputSchema：保留勾选的字段
            confirmedInputSchema = (inputSchema as Array<Record<string, unknown>>).filter((input) => {
                const key = String(input.key || "");
                // 在 nodeMappings 中找到对应的节点字段
                const relatedMapping = (nodeMappings as Array<Record<string, unknown>>).find(
                    (mapping) => String(mapping.paramKey || "") === key
                );
                if (!relatedMapping) return false;
                const nodeField = `${String(relatedMapping.nodeId || "")}.${String(relatedMapping.fieldName || "")}`;
                return selectedCandidates.includes(nodeField);
            });

            // 过滤 nodeMappings：只保留勾选的节点字段
            confirmedNodeMappings = (nodeMappings as Array<Record<string, unknown>>).filter((mapping) => {
                const nodeField = `${String(mapping.nodeId || "")}.${String(mapping.fieldName || "")}`;
                return selectedCandidates.includes(nodeField);
            });

            // 过滤 outputMappings：只保留勾选的输出字段
            confirmedOutputMappings = (outputMappings as Array<Record<string, unknown>>).filter((mapping) => {
                const nodeField = `${String(mapping.nodeId || "")}.${String(mapping.fieldName || "")}`;
                return selectedCandidates.includes(nodeField);
            });
        }
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                channelId,
                workflowName: String(draft.workflowName || "").trim(),
                businessCode: draft.businessCode,
                capability: draft.capability,
                workflowId: String(draft.workflowId || "").trim(),
                createPath: String(draft.createPath || "").trim(),
                queryPath: String(draft.queryPath || "").trim(),
                taskIdField: String(draft.taskIdField || "").trim(),
                statusField: String(draft.statusField || "").trim(),
                resultField: String(draft.resultField || "").trim(),
                inputSchema: confirmedInputSchema,
                nodeMappings: confirmedNodeMappings,
                outputMappings: confirmedOutputMappings,
                runOptions,
                timeoutSeconds: draft.timeoutSeconds,
                workflowJsonFingerprint: discovery?.workflowJsonFingerprint || workflow?.workflowJsonFingerprint,
            };
            if (!workflow || !workflow.requestTemplateConfigured) payload.requestTemplate = String(draft.requestTemplate || "");
            const response = await fetch(workflow ? `/api/admin/runninghub/workflows/${encodeURIComponent(workflow.workflowKey)}` : "/api/admin/runninghub/workflows", {
                method: workflow ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const result = (await response.json()) as { data?: unknown; msg?: string };
            if (!response.ok) throw new Error(result.msg || "保存工作流失败");
            message.success(workflow ? "工作流已保存" : "工作流已创建");
            await onSaved();
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存工作流失败");
        } finally {
            setSaving(false);
        }
    };

    const discover = useCallback(
        async (override?: { workflowIdOrUrl?: string; capability?: RunningHubWorkflowConfig["capability"] }) => {
            const workflowIdOrUrl = String(override?.workflowIdOrUrl || draft.workflowId || "").trim();
            const capability = override?.capability || draft.capability;
            if (!workflowIdOrUrl) {
                setErrors((current) => ({ ...current, workflowId: "请填写 Workflow ID 或完整链接" }));
                return;
            }
            setDiscovering(true);
            setErrors((current) => ({ ...current, workflowId: "" }));
            try {
                const response = await fetch("/api/admin/runninghub/workflows/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId, workflowIdOrUrl, capability }) });
                const result = (await response.json()) as { data?: RunningHubWorkflowDiscovery; msg?: string };
                if (!response.ok || !result.data) throw new Error(result.msg || "读取工作流失败");
                setDiscovery(result.data);
                setActiveTab("discovery");
                setSelectedCandidates(
                    result.data.candidates
                        .filter((candidate) => candidate.role === "output" || result.data?.suggestedNodeMappings.some((mapping) => mapping.nodeId === candidate.nodeId && mapping.fieldName === candidate.fieldName))
                        .map((candidate) => `${candidate.nodeId}.${candidate.fieldName}`),
                );
                setDraft((current) => ({ ...current, workflowId: result.data?.workflowId, inputSchema: result.data?.suggestedInputs, nodeMappings: result.data?.suggestedNodeMappings, outputMappings: result.data?.suggestedOutputs }));
                setJsonText({
                    inputSchema: JSON.stringify(result.data.suggestedInputs, null, 2),
                    nodeMappings: JSON.stringify(result.data.suggestedNodeMappings, null, 2),
                    outputMappings: JSON.stringify(result.data.suggestedOutputs, null, 2),
                    runOptions: jsonText.runOptions,
                });
            } catch (error) {
                message.error(error instanceof Error ? error.message : "读取工作流失败");
            } finally {
                setDiscovering(false);
            }
        },
        [channelId, draft.capability, draft.workflowId, jsonText.runOptions, message],
    );

    useEffect(() => {
        if (open && autoDiscover && workflow?.workflowId && !autoDiscoverStarted.current) {
            autoDiscoverStarted.current = true;
            void discover({ workflowIdOrUrl: workflow.workflowId, capability: workflow.capability });
        }
    }, [autoDiscover, discover, open, workflow?.capability, workflow?.workflowId]);

    const jsonField = (key: keyof typeof jsonText, label: string, expected: "array" | "object") => (
        <div>
            <div className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-300">{label}</div>
            <Input.TextArea
                value={jsonText[key]}
                autoSize={{ minRows: 8, maxRows: 18 }}
                spellCheck={false}
                readOnly
                placeholder="根据上方识别结果自动生成，通过勾选候选项控制"
                status={errors[key] ? "error" : undefined}
                className="bg-stone-50 dark:bg-stone-900"
            />
            {errors[key] ? <div className="mt-1 text-xs text-red-600">{`${key}: ${errors[key]}`}</div> : null}
        </div>
    );

    return (
        <Drawer
            title={workflow ? `编辑工作流 · v${workflow.version}` : "新建 RunningHub 工作流"}
            open={open}
            destroyOnHidden
            width="min(900px, 100vw)"
            onClose={onClose}
            extra={
                <Space>
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" loading={saving} onClick={() => void submit()}>
                        保存
                    </Button>
                </Space>
            }
        >
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: "basic",
                        label: "基础配置",
                        children: (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="工作流名称" error={errors.workflowName}>
                                    <Input value={String(draft.workflowName || "")} onChange={(event) => update({ workflowName: event.target.value })} />
                                </Field>
                                <Field label="业务 code">
                                    <Select
                                        className="w-full"
                                        value={draft.businessCode}
                                        options={businessOptions.map(({ value, label }) => ({ value, label }))}
                                        onChange={(value) => update({ businessCode: value, capability: businessOptions.find((item) => item.value === value)?.capability })}
                                    />
                                </Field>
                                <Field label="能力">
                                    <Select
                                        className="w-full"
                                        value={draft.capability || business?.capability}
                                        options={[
                                            { value: "text", label: "文本" },
                                            { value: "image", label: "图片" },
                                            { value: "video", label: "视频" },
                                            { value: "audio", label: "音频" },
                                        ]}
                                        onChange={(value) => update({ capability: value })}
                                    />
                                </Field>
                                <Field label="Workflow ID" error={errors.workflowId}>
                                    <Input value={String(draft.workflowId || "")} onChange={(event) => update({ workflowId: event.target.value })} />
                                </Field>
                                <div className="flex items-end">
                                    <Button className="w-full" loading={discovering} onClick={() => void discover()}>
                                        读取工作流
                                    </Button>
                                </div>
                                <Field label="超时（秒）">
                                    <InputNumber className="w-full" min={1} value={draft.timeoutSeconds} onChange={(value) => update({ timeoutSeconds: value == null ? undefined : Number(value) })} />
                                </Field>
                            </div>
                        ),
                    },
                    {
                        key: "discovery",
                        label: "识别结果",
                        children: discovery ? (
                            <div className="space-y-3">
                                {discovery.warnings.length ? (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        message="需要确认的工作流风险"
                                        description={
                                            <ul className="list-disc pl-5">
                                                {discovery.warnings.map((warning) => (
                                                    <li key={warning}>{warning}</li>
                                                ))}
                                            </ul>
                                        }
                                    />
                                ) : null}
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {discovery.candidates.map((candidate) => (
                                        <label key={`${candidate.nodeId}.${candidate.fieldName}`} className="flex items-start gap-2 rounded-md border border-stone-200 p-2 text-sm dark:border-stone-800">
                                            <Checkbox
                                                checked={selectedCandidates.includes(`${candidate.nodeId}.${candidate.fieldName}`)}
                                                disabled={candidate.role === "unknown"}
                                                onChange={(event) =>
                                                    setSelectedCandidates((current) => (event.target.checked ? [...current, `${candidate.nodeId}.${candidate.fieldName}`] : current.filter((item) => item !== `${candidate.nodeId}.${candidate.fieldName}`)))
                                                }
                                            />
                                            <span>
                                                <span className="font-medium">{candidate.label}</span>
                                                <span className="ml-2 text-xs text-stone-500">
                                                    {candidate.nodeId}.{candidate.fieldName} · {candidate.confidence}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <div className="text-xs text-stone-500">
                                    已生成 {discovery.suggestedInputs.length} 个输入、{discovery.suggestedOutputs.length} 个输出建议，请确认后保存。
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-stone-500">先点击“读取工作流”获取输入、输出候选和默认文件风险。</div>
                        ),
                    },
                    {
                        key: "upstream",
                        label: "高级配置",
                        children: (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="创建路径" error={errors.createPath}>
                                    <Input value={String(draft.createPath || "")} placeholder="/openapi/v2/task/create" onChange={(event) => update({ createPath: event.target.value })} />
                                </Field>
                                <Field label="查询路径" error={errors.queryPath}>
                                    <Input value={String(draft.queryPath || "")} placeholder="/openapi/v2/task/query" onChange={(event) => update({ queryPath: event.target.value })} />
                                </Field>
                                <Field label="任务 ID 字段" error={errors.taskIdField}>
                                    <Input value={String(draft.taskIdField || "")} placeholder="data.taskId" onChange={(event) => update({ taskIdField: event.target.value })} />
                                </Field>
                                <Field label="状态字段" error={errors.statusField}>
                                    <Input value={String(draft.statusField || "")} placeholder="data.status" onChange={(event) => update({ statusField: event.target.value })} />
                                </Field>
                                <Field label="结果字段" error={errors.resultField}>
                                    <Input value={String(draft.resultField || "")} placeholder="data.result" onChange={(event) => update({ resultField: event.target.value })} />
                                </Field>
                                <div className="text-xs leading-5 text-stone-500 dark:text-stone-400">API Key 只在渠道详情保存，工作流编辑不会重复收集凭据。</div>
                                {!workflow?.requestTemplateConfigured ? (
                                    <div className="sm:col-span-2">
                                        <Field label="请求模板">
                                            <Input.TextArea rows={5} value={String(draft.requestTemplate || "")} placeholder='{"workflowId":"{{workflowId}}","prompt":"{{prompt}}"}' onChange={(event) => update({ requestTemplate: event.target.value })} />
                                        </Field>
                                    </div>
                                ) : (
                                    <div className="sm:col-span-2 text-xs text-stone-500">当前版本已配置高级请求模板，出于安全原因不会回显；如需调整，请复制新版本后重新粘贴。</div>
                                )}
                            </div>
                        ),
                    },
                    {
                        key: "advanced-json",
                        label: "节点与出参高级信息",
                        children: (
                            <Collapse
                                items={[
                                    { key: "input", label: "输入契约", children: jsonField("inputSchema", "inputSchema JSON", "array") },
                                    { key: "nodes", label: "节点映射", children: jsonField("nodeMappings", "nodeMappings JSON", "array") },
                                    { key: "outputs", label: "输出映射", children: jsonField("outputMappings", "outputMappings JSON", "array") },
                                ]}
                            />
                        ),
                    },
                    {
                        key: "test",
                        label: "测试运行",
                        children: <div className="rounded-md border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700">保存工作流后可在列表中打开测试运行面板。测试不会自动启用版本，也不会产生学校项目或积分流水。</div>,
                    },
                ]}
            />
        </Drawer>
    );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <label className="block min-w-0">
            <div className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-300">{label}</div>
            {children}
            {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
        </label>
    );
}

function makeDraft(channelId: string, workflow?: PublicRunningHubWorkflow): Draft {
    const businessCode = workflow?.businessCode || "script";
    return {
        channelId,
        workflowName: workflow?.workflowName || "",
        businessCode,
        capability: workflow?.capability || businessOptions.find((item) => item.value === businessCode)?.capability,
        providerType: "runninghub",
        workflowId: workflow?.workflowId || "",
        version: workflow?.version || 1,
        enabled: false,
        createPath: workflow?.createPath || "",
        queryPath: workflow?.queryPath || "",
        taskIdField: workflow?.taskIdField || "",
        statusField: workflow?.statusField || "",
        resultField: workflow?.resultField || "",
        requestTemplate: workflow?.requestTemplate || "",
        timeoutSeconds: workflow?.timeoutSeconds,
    };
}
