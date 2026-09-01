"use client";

import { App, Button, Drawer, Input, InputNumber, Select, Space, Tabs } from "antd";
import { useEffect, useState } from "react";

import type { RunningHubWorkflowBusinessCode, RunningHubWorkflowConfig } from "@/lib/auth/store-types";
import type { PublicRunningHubWorkflow } from "@/lib/server/runninghub-workflow-service";

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

export function RunningHubWorkflowEditor({ open, channelId, workflow, onClose, onSaved }: Props) {
    const { message } = App.useApp();
    const [draft, setDraft] = useState<Draft>(() => makeDraft(channelId, workflow));
    const [jsonText, setJsonText] = useState(jsonDefaults);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
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
        const nextErrors: Record<string, string> = {};
        if (!String(draft.workflowName || "").trim()) nextErrors.workflowName = "请填写工作流名称";
        if (!String(draft.workflowId || "").trim()) nextErrors.workflowId = "请填写 Workflow ID";
        if (!String(draft.createPath || "").trim()) nextErrors.createPath = "请填写创建路径";
        if (!String(draft.queryPath || "").trim()) nextErrors.queryPath = "请填写查询路径";
        if (!String(draft.taskIdField || "").trim()) nextErrors.taskIdField = "请填写任务 ID 字段";
        if (!String(draft.statusField || "").trim()) nextErrors.statusField = "请填写状态字段";
        if (!String(draft.resultField || "").trim()) nextErrors.resultField = "请填写结果字段";
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) return;
        const inputSchema = parseJson("inputSchema", "array");
        const nodeMappings = parseJson("nodeMappings", "array");
        const outputMappings = parseJson("outputMappings", "array");
        const runOptions = parseJson("runOptions", "object");
        if ([inputSchema, nodeMappings, outputMappings, runOptions].some((value) => value === undefined)) return;
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
                inputSchema,
                nodeMappings,
                outputMappings,
                runOptions,
                timeoutSeconds: draft.timeoutSeconds,
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

    const jsonField = (key: keyof typeof jsonText, label: string, expected: "array" | "object") => (
        <div>
            <div className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-300">{label}</div>
            <Input.TextArea
                value={jsonText[key]}
                autoSize={{ minRows: 8, maxRows: 18 }}
                spellCheck={false}
                status={errors[key] ? "error" : undefined}
                onChange={(event) => {
                    setJsonText((current) => ({ ...current, [key]: event.target.value }));
                    setErrors((current) => ({ ...current, [key]: "" }));
                }}
                onBlur={() => parseJson(key, expected)}
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
                                <Field label="超时（秒）">
                                    <InputNumber className="w-full" min={1} value={draft.timeoutSeconds} onChange={(value) => update({ timeoutSeconds: value == null ? undefined : Number(value) })} />
                                </Field>
                            </div>
                        ),
                    },
                    {
                        key: "upstream",
                        label: "平台对接",
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
                    { key: "input", label: "参数契约", children: jsonField("inputSchema", "inputSchema JSON（字段路径错误会在这里提示）", "array") },
                    { key: "nodes", label: "节点映射", children: jsonField("nodeMappings", "nodeMappings JSON", "array") },
                    { key: "outputs", label: "出参映射", children: jsonField("outputMappings", "outputMappings JSON", "array") },
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
