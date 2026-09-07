"use client";

import { Alert, Button, Drawer, Input, InputNumber, Select, Space, Switch, Tag } from "antd";
import { useRef, useState } from "react";

import type { PublicRunningHubWorkflow } from "@/lib/server/runninghub-workflow-service";

export function RunningHubWorkflowTestPanel({ open, workflow, onClose }: { open: boolean; workflow: PublicRunningHubWorkflow; onClose: () => void }) {
    const [input, setInput] = useState<Record<string, unknown>>(() => Object.fromEntries((workflow.inputSchema || []).map((field) => [field.key, field.defaultValue ?? (field.key === "prompt" || field.key === "text" ? "测试工作流" : undefined)])));
    const [referencesText, setReferencesText] = useState("[]");
    const [files, setFiles] = useState<Record<string, File | undefined>>({});
    const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
    const [runId, setRunId] = useState("");
    const [result, setResult] = useState<{
        status?: string;
        taskId?: string;
        resultUrl?: string;
        resultUrls?: string[];
        resultText?: string;
        outputs?: Array<{ key: string; label: string; assetType: string; values: unknown[] }>;
        querySummary?: { status?: string; resultCount: number; nodeIds: string[]; upstreamError?: string };
        error?: string;
        durationMs?: number;
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const submit = async () => {
        setLoading(true);
        setError("");
        try {
            const references = JSON.parse(referencesText) as unknown;
            const form = new FormData();
            form.set("input", JSON.stringify(input));
            form.set("references", JSON.stringify(references));
            const fileEntries = Object.entries(files).filter(([, file]) => Boolean(file));
            form.set("fileKeys", JSON.stringify(fileEntries.map(([key]) => key)));
            fileEntries.forEach(([, file]) => {
                if (file) form.append("file", file, file.name);
            });
            const response = await fetch(`/api/admin/runninghub/workflows/${encodeURIComponent(workflow.workflowKey)}/test`, { method: "POST", body: form });
            const body = (await response.json()) as { data?: { runId: string; status: string; taskId?: string }; msg?: string };
            if (!response.ok || !body.data) throw new Error(body.msg || "测试提交失败");
            setRunId(body.data.runId);
            setResult(body.data);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "测试提交失败");
        } finally {
            setLoading(false);
        }
    };
    const inspect = async () => {
        if (!runId) return;
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/runninghub/workflows/${encodeURIComponent(workflow.workflowKey)}/test/${encodeURIComponent(runId)}`, { cache: "no-store" });
            const body = (await response.json()) as { data?: typeof result; msg?: string };
            if (!response.ok || !body.data) throw new Error(body.msg || "查询测试失败");
            setResult(body.data);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "查询测试失败");
        } finally {
            setLoading(false);
        }
    };
    return (
        <Drawer title={`测试运行 · ${workflow.workflowName} v${workflow.version}`} open={open} width="min(640px, 100vw)" destroyOnHidden onClose={onClose} extra={<Button onClick={onClose}>关闭</Button>}>
            <div className="space-y-4">
                <Alert type="info" showIcon message="独立管理员测试" description="测试不会创建学校项目、正式作品或积分流水；上游仍处理时请点击查询，不会自动轮询。" />
                <div className="grid gap-3 sm:grid-cols-2">
                    {(workflow.inputSchema || []).map((field) => (
                        <label key={field.key} className="block">
                            <div className="mb-1 text-sm font-medium">
                                {field.label}
                                {field.required ? " *" : ""}
                            </div>
                            {field.type === "number" ? (
                                <InputNumber
                                    className="w-full"
                                    value={typeof input[field.key] === "number" ? (input[field.key] as number) : undefined}
                                    onChange={(value) => setInput((current) => ({ ...current, [field.key]: value == null ? undefined : Number(value) }))}
                                />
                            ) : field.type === "boolean" ? (
                                <Switch checked={input[field.key] === true} onChange={(checked) => setInput((current) => ({ ...current, [field.key]: checked }))} />
                            ) : field.type === "enum" ? (
                                <Select
                                    className="w-full"
                                    value={typeof input[field.key] === "string" ? (input[field.key] as string) : undefined}
                                    options={(field.options || []).map((option) => ({ value: option, label: option }))}
                                    onChange={(value) => setInput((current) => ({ ...current, [field.key]: value }))}
                                />
                            ) : field.type === "textarea" ? (
                                <Input.TextArea rows={3} value={typeof input[field.key] === "string" ? (input[field.key] as string) : ""} onChange={(event) => setInput((current) => ({ ...current, [field.key]: event.target.value }))} />
                            ) : field.type === "image" || field.type === "video" || field.type === "audio" ? (
                                <div className="space-y-2">
                                    <Input
                                        value={typeof input[field.key] === "string" ? (input[field.key] as string) : ""}
                                        placeholder="可输入已上传素材 URL"
                                        onChange={(event) => setInput((current) => ({ ...current, [field.key]: event.target.value }))}
                                    />
                                    <div className="flex items-center gap-2">
                                        <input
                                            ref={(element) => {
                                                fileInputs.current[field.key] = element;
                                            }}
                                            className="sr-only"
                                            type="file"
                                            accept={field.type === "image" ? "image/*" : field.type === "video" ? "video/*" : "audio/*"}
                                            onChange={(event) => {
                                                setFiles((current) => ({ ...current, [field.key]: event.target.files?.[0] }));
                                                setInput((current) => ({ ...current, [field.key]: undefined }));
                                            }}
                                        />
                                        <Button size="small" onClick={() => fileInputs.current[field.key]?.click()}>
                                            选择{field.type === "image" ? "图片" : field.type === "video" ? "视频" : "音频"}
                                        </Button>
                                        {files[field.key] ? <span className="truncate text-xs text-stone-500">{files[field.key]?.name}</span> : null}
                                    </div>
                                </div>
                            ) : (
                                <Input value={typeof input[field.key] === "string" ? (input[field.key] as string) : ""} onChange={(event) => setInput((current) => ({ ...current, [field.key]: event.target.value }))} />
                            )}
                        </label>
                    ))}
                </div>
                <label className="block">
                    <div className="mb-1 text-sm font-medium">参考媒体 JSON（可选，文件可直接上传）</div>
                    <Input.TextArea rows={4} value={referencesText} onChange={(event) => setReferencesText(event.target.value)} placeholder='[{"type":"image","url":"https://..."}]' />
                </label>
                {error ? <Alert type="error" showIcon message={error} /> : null}
                <Space wrap>
                    <Button type="primary" loading={loading} onClick={() => void submit()}>
                        提交测试
                    </Button>
                    <Button disabled={!runId} loading={loading} onClick={() => void inspect()}>
                        查询状态
                    </Button>
                    {result?.status ? <Tag color={result.status === "success" ? "success" : result.status === "error" ? "error" : "processing"}>{result.status}</Tag> : null}
                </Space>
                {result ? (
                    <div className="rounded-md border border-stone-200 p-3 text-sm dark:border-stone-800">
                        <div>runId：{runId}</div>
                        {result.taskId ? <div className="mt-1">taskId：{result.taskId}</div> : null}
                        {result.durationMs ? <div className="mt-1">耗时：{result.durationMs} ms</div> : null}
                        {result.resultUrl && (!result.resultUrls || result.resultUrls.length <= 1) ? (
                            <a className="mt-2 block break-all text-blue-600 underline" href={result.resultUrl} target="_blank" rel="noreferrer">
                                查看结果
                            </a>
                        ) : null}
                        {result.resultUrls && result.resultUrls.length > 1 ? (
                            <div className="mt-2 space-y-1">
                                {result.resultUrls.map((url, index) => (
                                    <a key={`${url}-${index}`} className="block break-all text-blue-600 underline" href={url} target="_blank" rel="noreferrer">
                                        查看结果 {index + 1}
                                    </a>
                                ))}
                            </div>
                        ) : null}
                        {result.resultText ? <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 text-sm dark:bg-stone-900">{result.resultText}</pre> : null}
                        {result.outputs?.length ? (
                            <div className="mt-2 space-y-2">
                                {result.outputs.map((output) => (
                                    <div key={output.key}>
                                        <div className="font-medium">
                                            {output.label} · {output.assetType}
                                        </div>
                                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 text-xs dark:bg-stone-900">{JSON.stringify(output.values, null, 2)}</pre>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        {result.querySummary ? (
                            <div className="mt-2 rounded border border-stone-200 p-2 text-xs dark:border-stone-700">
                                <div className="font-medium">查询响应摘要</div>
                                <div className="mt-1">状态：{result.querySummary.status || "未返回"}</div>
                                <div>结果数量：{result.querySummary.resultCount}</div>
                                <div>节点 ID：{result.querySummary.nodeIds.length ? result.querySummary.nodeIds.join(", ") : "未返回"}</div>
                                {result.querySummary.upstreamError ? <div className="mt-1 text-red-600">上游原因：{result.querySummary.upstreamError}</div> : null}
                            </div>
                        ) : null}
                        {result.error ? <div className="mt-2 text-red-600">{result.error}</div> : null}
                    </div>
                ) : null}
            </div>
        </Drawer>
    );
}
