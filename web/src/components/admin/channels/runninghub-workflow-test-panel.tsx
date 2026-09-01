"use client";

import { Alert, Button, Drawer, Input, Space, Tag } from "antd";
import { useState } from "react";

import type { PublicRunningHubWorkflow } from "@/lib/server/runninghub-workflow-service";

export function RunningHubWorkflowTestPanel({ open, workflow, onClose }: { open: boolean; workflow: PublicRunningHubWorkflow; onClose: () => void }) {
    const [inputText, setInputText] = useState('{\n  "prompt": "测试工作流"\n}');
    const [referencesText, setReferencesText] = useState("[]");
    const [runId, setRunId] = useState("");
    const [result, setResult] = useState<{
        status?: string;
        taskId?: string;
        resultUrl?: string;
        resultUrls?: string[];
        resultText?: string;
        outputs?: Array<{ key: string; label: string; assetType: string; values: unknown[] }>;
        error?: string;
        durationMs?: number;
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const submit = async () => {
        setLoading(true);
        setError("");
        try {
            const input = JSON.parse(inputText) as unknown;
            const references = JSON.parse(referencesText) as unknown;
            if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("输入必须是 JSON 对象");
            const response = await fetch(`/api/admin/runninghub/workflows/${encodeURIComponent(workflow.workflowKey)}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input, references }) });
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
                <label className="block">
                    <div className="mb-1 text-sm font-medium">业务输入 JSON</div>
                    <Input.TextArea rows={8} value={inputText} onChange={(event) => setInputText(event.target.value)} />
                </label>
                <label className="block">
                    <div className="mb-1 text-sm font-medium">参考媒体 JSON（可选）</div>
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
                        {result.error ? <div className="mt-2 text-red-600">{result.error}</div> : null}
                    </div>
                ) : null}
            </div>
        </Drawer>
    );
}
