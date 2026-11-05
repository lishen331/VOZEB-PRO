"use client";

import { Popconfirm } from "@/components/gamma-ui/gamma-ant-overlay";
import { Button, Checkbox, Tag } from "@/components/gamma-ui/gamma-ant";
import { AudioLines, Eye, Film, FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { browserReadableMediaUrl } from "@/lib/browser-media-url";
import { AdminAccountId } from "@/components/admin/admin-user-identity";
import { imagePreviewUrl } from "@/lib/media-image-url";
import type { StoredGenerationLog } from "@/lib/server/generation-log-store";
import type { GenerationLogTrace, GenerationLogTraceStep } from "@/lib/server/generation-log-trace";

export function GenerationLogAssetPreview({ log }: { log: StoredGenerationLog }) {
    const asset = log.assets[0];
    const assetUrl = asset ? generationLogAssetAccessUrl(asset) : "";
    if (!assetUrl) {
        return (
            <div className="flex size-12 items-center justify-center rounded-lg border border-[var(--gm-border)] bg-[var(--gm-wash-strong)] text-[var(--gm-text-3)]">
                {log.kind === "video" ? <Film className="size-4" /> : log.kind === "audio" ? <AudioLines className="size-4" /> : log.kind === "text" ? <FileText className="size-4" /> : <ImageIcon className="size-4" />}
            </div>
        );
    }
    if (asset.type === "video") {
        return <video className="size-12 rounded-lg border border-[var(--gm-border)] bg-[var(--gm-wash-strong)] object-cover" src={assetUrl} muted playsInline preload="metadata" />;
    }
    if (asset.type === "audio") {
        return (
            <div className="flex size-12 items-center justify-center rounded-lg border border-[var(--gm-border)] bg-[var(--gm-wash-strong)] text-[var(--gm-text-2)]">
                <AudioLines className="size-5" />
            </div>
        );
    }
    return <img className="size-12 rounded-lg border border-[var(--gm-border)] bg-[var(--gm-wash-strong)] object-cover" src={imagePreviewUrl(assetUrl, 256)} alt="" loading="lazy" referrerPolicy="no-referrer" />;
}

export function GenerationLogMobileCard({ log, selected, onSelectedChange, onView, onDelete }: { log: StoredGenerationLog; selected: boolean; onSelectedChange: (checked: boolean) => void; onView: () => void; onDelete: () => void }) {
    return (
        <div className="rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] p-3">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3">
                <Checkbox checked={selected} onChange={(event) => onSelectedChange(event.target.checked)} />
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Tag className="m-0" color={log.kind === "video" ? "purple" : log.kind === "text" ? "green" : "blue"}>
                            {generationKindLabel(log.kind)}
                        </Tag>
                        <span className={generationStatusClass(log.status)}>{generationStatusLabel(log.status)}</span>
                        <span className="text-xs text-[var(--gm-text-3)]">{generationSourceLabel(log.source)}</span>
                        {log.executionProfile ? <span className="text-xs text-[var(--gm-text-3)]">{generationExecutionProfileLabel(log.executionProfile)}</span> : null}
                        {log.channelName ? <span className="text-xs text-[var(--gm-text-3)]">{log.channelName}</span> : null}
                    </div>
                    <div className="mt-2 truncate text-sm font-semibold text-[var(--gm-text)]">{log.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--gm-text-3)]">{log.prompt || log.summary}</div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--gm-text-3)]">
                        <span>{formatAdminLogTime(log.createdAt)}</span>
                        <span>{log.displayName || log.username}</span>
                        <AdminAccountId accountId={log.accountId} />
                        <span>{formatAdminLogDuration(log.durationMs)}</span>
                    </div>
                </div>
                <GenerationLogAssetPreview log={log} />
            </div>
            <div className="mt-3 flex justify-end gap-2">
                <Button size="small" icon={<Eye className="size-3.5" />} onClick={onView}>
                    详情
                </Button>
                <Popconfirm title="删除这条生成日志？" okText="删除" cancelText="取消" onConfirm={onDelete}>
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />}>
                        删除
                    </Button>
                </Popconfirm>
            </div>
        </div>
    );
}

export function GenerationLogDetail({ log }: { log: StoredGenerationLog }) {
    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <InfoBox label="用户" value={`${log.displayName || log.username} / ${log.username || "-"}${log.accountId ? ` / ID：${log.accountId}` : ""}`} />
                <InfoBox label="入口" value={generationSourceLabel(log.source)} />
                <InfoBox label="类型" value={generationKindLabel(log.kind)} />
                <InfoBox label="状态" value={generationStatusLabel(log.status)} />
                <InfoBox label="时间" value={formatAdminLogTime(log.createdAt)} />
                <InfoBox label="耗时" value={formatAdminLogDuration(log.durationMs)} />
                <InfoBox label="模型" value={formatGenerationLogModel(log.model)} />
                <InfoBox label="数量" value={`成功 ${log.successCount} / 失败 ${log.failCount} / 共 ${log.count}`} />
                <InfoBox label="执行环境" value={generationExecutionProfileLabel(log.executionProfile)} />
                <InfoBox label="渠道" value={log.channelName || "-"} />
            </div>
            <GenerationLogTraceSection log={log} />
            <GenerationLogResultSection log={log} />
            <div>
                <div className="mb-1 text-sm font-semibold text-[var(--gm-text)]">提示词</div>
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--gm-border)] bg-[var(--gm-wash)] p-3 text-sm leading-6 text-[var(--gm-text-2)]">{log.prompt || "-"}</div>
            </div>
            {log.error ? (
                <div>
                    <div className="mb-1 text-sm font-semibold text-[var(--gm-danger)]">错误信息</div>
                    <div className="whitespace-pre-wrap rounded-lg border border-[color-mix(in_srgb,var(--gm-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--gm-danger)_10%,transparent)] p-3 text-sm leading-6 text-[var(--gm-danger)]">
                        {log.error}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function GenerationLogTraceSection({ log }: { log: StoredGenerationLog }) {
    const [trace, setTrace] = useState<GenerationLogTrace | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!log.taskId) return;
        const controller = new AbortController();
        setLoading(true);
        setFailed(false);
        setTrace(null);
        void fetch(`/api/admin/generation-logs/${encodeURIComponent(log.id)}/trace`, { signal: controller.signal })
            .then(async (response) => {
                if (response.status === 404) return;
                if (!response.ok) throw new Error(String(response.status));
                const payload = (await response.json()) as { trace?: GenerationLogTrace };
                if (!controller.signal.aborted) setTrace(payload.trace ?? null);
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
                setFailed(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [log.id, log.taskId]);

    if (!log.taskId) return null;
    return (
        <div className="rounded-lg border border-[var(--gm-border)] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[var(--gm-text)]">调用链路</div>
                {trace?.diagnosticsExpired ? <span className="text-xs text-[var(--gm-text-3)]">诊断已过期</span> : null}
            </div>
            {loading ? <div className="text-sm text-[var(--gm-text-3)]">正在读取调用链路…</div> : null}
            {failed ? <div className="text-sm text-[var(--gm-danger)]">调用链路读取失败</div> : null}
            {!loading && !failed && !trace?.steps.length ? <div className="text-sm text-[var(--gm-text-3)]">{trace?.diagnosticsExpired ? "诊断已过期，链路已清除。" : "这条记录没有采集到调用链路。"}</div> : null}
            {trace && trace.steps.length ? (
                <ol className="space-y-2">
                    {trace.steps.map((step, index) => (
                        <li key={`${step.at}-${step.phase}-${index}`} className="rounded-md border border-[var(--gm-border)] bg-[var(--gm-wash)] px-3 py-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--gm-text-3)]">
                                <span className="font-medium text-[var(--gm-text)]">{generationTracePhaseLabel(step.phase)}</span>
                                <span className="tabular-nums">{formatTraceTime(step.at)}</span>
                                {typeof step.status === "number" ? <span className={step.status >= 400 ? "font-medium text-[var(--gm-danger)]" : ""}>状态 {step.status}</span> : null}
                                {typeof step.durationMs === "number" ? <span className="tabular-nums">{formatAdminLogDuration(step.durationMs)}</span> : null}
                            </div>
                            <GenerationLogTraceStepDetail step={step} />
                        </li>
                    ))}
                </ol>
            ) : null}
        </div>
    );
}

function GenerationLogTraceStepDetail({ step }: { step: GenerationLogTraceStep }) {
    const parts = [
        step.model ? `模型 ${step.model}` : "",
        step.channelName || step.channelId ? `渠道 ${step.channelName || step.channelId}` : "",
        step.state ? `状态 ${step.state}` : "",
        typeof step.attemptNo === "number" ? `第 ${step.attemptNo} 次` : "",
    ].filter(Boolean);
    if (!parts.length && !step.errorMessage && !step.url) return null;
    return (
        <div className="mt-1 space-y-1 text-xs leading-5 text-[var(--gm-text-2)]">
            {parts.length ? <div>{parts.join(" · ")}</div> : null}
            {step.url ? <div className="break-all text-[var(--gm-text-3)]">{step.url}</div> : null}
            {step.errorMessage ? <div className="whitespace-pre-wrap break-all text-[var(--gm-danger)]">{step.errorMessage}</div> : null}
        </div>
    );
}

function generationTracePhaseLabel(phase: string) {
    const labels: Record<string, string> = {
        task_created: "建任务",
        state: "状态",
        poll: "轮询",
        provider_start: "开始调用",
        provider_end: "调用结束",
        provider_exception: "调用异常",
        provider_error: "上游错误",
        upstream_error: "上游错误",
        upstream_request: "上游请求",
        upstream_response: "上游响应",
        upstream_body_first_byte: "首字节",
        upstream_body_complete: "响应完成",
        transport_policy: "传输策略",
        transport_request: "传输请求",
        transport_response: "传输响应",
        result_persist_start: "保存结果",
        result_persist_complete: "结果已保存",
        result_persist_failed: "保存失败",
        result_media_start: "读取媒体",
        result_media_complete: "媒体已读取",
        recovery_end: "恢复结束",
    };
    return labels[phase] || phase;
}

function formatTraceTime(value: number) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "-";
    return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function GenerationLogResultSection({ log }: { log: StoredGenerationLog }) {
    const assets = (log.assets || []).filter((asset) => Boolean(generationLogAssetAccessUrl(asset)));
    if (!assets.length) {
        return (
            <div className="rounded-lg border border-dashed border-[var(--gm-border-strong)] bg-[var(--gm-wash)] p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--gm-text)]">
                    {log.kind === "video" ? <Film className="size-4" /> : log.kind === "audio" ? <AudioLines className="size-4" /> : log.kind === "text" ? <FileText className="size-4" /> : <ImageIcon className="size-4" />}
                    生成结果
                </div>
                <div className="text-sm leading-6 text-[var(--gm-text-2)]">{log.status === "success" ? "这条日志没有可访问的媒体文件。" : "这条日志没有成功结果，暂无可预览的媒体。"}</div>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-[var(--gm-border)] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[var(--gm-text)]">生成结果</div>
                <Tag className="m-0" color={log.kind === "video" ? "purple" : log.kind === "text" ? "green" : "blue"}>
                    {assets.length} 个结果
                </Tag>
            </div>
            <div className="space-y-3">
                {assets.map((asset, index) => {
                    const assetUrl = generationLogAssetAccessUrl(asset);
                    return (
                        <div key={`${asset.url}-${index}`} className="grid min-w-0 items-start gap-3 rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] p-3 sm:grid-cols-[156px_minmax(0,1fr)]">
                            <div className="min-w-0">
                                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-[var(--gm-text-3)]">
                                    <span>{asset.type === "video" ? `视频 ${index + 1}` : asset.type === "audio" ? `音频 ${index + 1}` : `图片 ${index + 1}`}</span>
                                    {asset.width || asset.height ? <span className="shrink-0 tabular-nums">{[asset.width, asset.height].filter(Boolean).join("x")}</span> : null}
                                </div>
                                <div className="flex h-32 items-center justify-center overflow-hidden rounded-md bg-[var(--gm-wash-strong)] p-2 sm:h-36">
                                    {asset.type === "video" ? (
                                        <video /* 视频播放底保持纯黑（媒体 letterbox），不随主题切换，故不换 token */ className="h-full w-full rounded bg-black object-contain" src={assetUrl} controls playsInline preload="metadata" />
                                    ) : asset.type === "audio" ? (
                                        <audio className="w-full" src={assetUrl} controls preload="metadata" />
                                    ) : (
                                        <img className="h-full w-full object-contain" src={imagePreviewUrl(assetUrl, 960)} alt="" referrerPolicy="no-referrer" loading="lazy" />
                                    )}
                                </div>
                            </div>
                            <div className="min-w-0 self-center text-sm text-[var(--gm-text-2)]">
                                <div>{asset.type === "video" ? "视频" : asset.type === "audio" ? "音频" : "图片"}</div>
                                <div className="mt-1 text-xs">{asset.bytes ? formatAssetBytes(asset.bytes) : "大小未记录"}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function generationLogAssetAccessUrl(asset: StoredGenerationLog["assets"][number]) {
    const directUrl = asset.url && !asset.url.startsWith("/api/generation-log-assets/") && asset.url !== asset.serverUrl ? asset.url : "";
    const serverUrl = asset.serverUrl || (asset.url?.startsWith("/api/generation-log-assets/") ? asset.url : "");
    return browserReadableMediaUrl(asset.remoteUrl || directUrl || serverUrl || asset.serverUrl || (asset.url?.startsWith("/api/generation-log-assets/") ? asset.url : ""));
}

function formatAssetBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatGenerationLogModel(model: string) {
    const value = (model || "").trim();
    if (!value) return "-";
    const separatorIndex = value.indexOf("::");
    return separatorIndex >= 0 ? value.slice(separatorIndex + 2).trim() || value : value;
}

export function formatAdminLogTime(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "-";
    return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatAdminLogDuration(value: number) {
    if (!value) return "-";
    if (value < 1000) return `${Math.round(value)}ms`;
    return `${(value / 1000).toFixed(2)}s`;
}

export function generationKindLabel(value: string) {
    if (value === "text") return "文本";
    if (value === "audio") return "音频";
    return value === "video" ? "视频" : "图片";
}

export function generationSourceLabel(value: string) {
    if (value === "agent") return "Agent 工作台";
    if (value === "canvas") return "画布";
    if (value === "drama") return "短剧";
    if (value === "video-workbench") return "视频生成";
    if (value === "image-workbench") return "图片生成";
    if (value === "practice") return "无限练习";
    return "未知入口";
}

export function generationExecutionProfileLabel(value: string | undefined) {
    if (value === "open-source-practice") return "练习";
    if (value === "production") return "生产";
    return "-";
}

export function generationStatusLabel(value: string) {
    if (value === "success") return "成功";
    if (value === "failed") return "失败";
    if (value === "pending") return "生成中";
    return value || "-";
}

export function generationStatusClass(value: string) {
    if (value === "success") return "inline-flex h-6 items-center rounded-md bg-[color-mix(in_srgb,var(--gm-success)_10%,transparent)] px-2 text-xs font-medium text-[var(--gm-success)] ring-1 ring-[color-mix(in_srgb,var(--gm-success)_40%,transparent)]";
    if (value === "failed") return "inline-flex h-6 items-center rounded-md bg-[color-mix(in_srgb,var(--gm-danger)_10%,transparent)] px-2 text-xs font-medium text-[var(--gm-danger)] ring-1 ring-[color-mix(in_srgb,var(--gm-danger)_40%,transparent)]";
    return "inline-flex h-6 items-center rounded-md bg-[var(--gm-accent-soft)] px-2 text-xs font-medium text-[var(--gm-accent)] ring-1 ring-[color-mix(in_srgb,var(--gm-accent)_40%,transparent)]";
}

function InfoBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-lg border border-[var(--gm-border)] bg-[var(--gm-wash)] px-3 py-2">
            <div className="text-xs text-[var(--gm-text-3)]">{label}</div>
            <div className="mt-1 truncate text-sm font-medium text-[var(--gm-text)]" title={value}>
                {value}
            </div>
        </div>
    );
}
