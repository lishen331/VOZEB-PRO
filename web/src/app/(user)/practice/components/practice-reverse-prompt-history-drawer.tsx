"use client";

import { useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { Drawer } from "@/components/gamma-ui/gamma-ant-modal";
import { imagePreviewUrl } from "@/lib/media-image-url";
import type { ReversePromptHistoryRecord } from "@/lib/practice-reverse-prompt-history";
import type { UploadedImage } from "@/services/image-storage";
import { parseServerMediaUrl } from "@/services/server-media-storage";

export const REVERSE_PROMPT_MODES = [
    { id: "general", label: "完整描述", instruction: "请分析主体、构图、环境、光线、色彩和整体风格" },
    { id: "style", label: "风格分析", instruction: "重点分析视觉风格、媒介质感、配色、光影和氛围" },
    { id: "detail", label: "细节拆解", instruction: "详细描述主体特征、服饰/材质、背景、镜头构图和细节" },
] as const;

export function restoreReversePromptHistoryView(record: ReversePromptHistoryRecord) {
    const reference = parseServerMediaUrl(record.sourceUrl || "");
    const source: UploadedImage | null = reference ? { url: reference.url, storageKey: reference.storageKey, width: 0, height: 0, bytes: 0, mimeType: "image/png" } : null;
    return {
        source,
        mode: REVERSE_PROMPT_MODES.find(({ id }) => id === record.analysisMode)?.id ?? "general",
        extraRequirement: record.extraRequirement,
        result: { taskId: record.id, text: record.analysisText },
    };
}

type HistoryPage = { records: ReversePromptHistoryRecord[]; nextCursor?: string };
type Props = {
    activeId?: string;
    blocked: boolean;
    dirty: boolean;
    restoring: boolean;
    onRestore: (id: string) => Promise<boolean>;
};
const HISTORY_URL = "/api/practice/reverse-prompt/history";
const formatDate = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" });

function HistoryThumbnail({ sourceUrl }: Pick<ReversePromptHistoryRecord, "sourceUrl">) {
    const [failed, setFailed] = useState(false);
    return sourceUrl && !failed ? (
        <img src={imagePreviewUrl(sourceUrl, 160)} alt="原图缩略图" loading="lazy" onError={() => setFailed(true)} className="size-14 shrink-0 rounded-lg object-cover" />
    ) : (
        <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-[var(--gm-wash)] text-center text-xs text-[var(--gm-text-3)]">
            原图
            <br />
            不可用
        </span>
    );
}

function trialLabel(record: ReversePromptHistoryRecord): string {
    if (record.trialStatus === "pending") return record.trial ? "结果待确认 · 有历史成图" : "试生成结果待确认";
    if (record.trialStatus === "failed") return record.trial ? "最近一次失败 · 有历史成图" : "试生成未成功";
    if (record.trial) return "有试生成图";
    return record.trialStatus === "success" ? "成图不可用" : "未试生成";
}

export function PracticeReversePromptHistoryDrawer({ activeId, blocked, dirty, restoring, onRestore }: Props) {
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState<HistoryPage>({ records: [] });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [pendingId, setPendingId] = useState<string>();
    const entry = useRef<HTMLButtonElement>(null);
    const read = useRef<AbortController | null>(null);
    useEffect(() => () => read.current?.abort(), []);

    const load = async (cursor?: string) => {
        if (read.current) return;
        const controller = new AbortController();
        read.current = controller;
        setLoading(true);
        setError("");
        try {
            const response = await fetch(cursor ? `${HISTORY_URL}?cursor=${encodeURIComponent(cursor)}` : HISTORY_URL, { cache: "no-store", signal: controller.signal });
            if (!response.ok) throw new Error("读取失败");
            const data = (await response.json()) as HistoryPage;
            if (!controller.signal.aborted) setPage((current) => ({ records: cursor ? [...current.records, ...data.records] : data.records, nextCursor: data.nextCursor }));
        } catch {
            if (!controller.signal.aborted) setError("历史记录暂时无法读取，请重试。");
        } finally {
            if (!controller.signal.aborted) {
                read.current = null;
                setLoading(false);
            }
        }
    };

    const close = () => {
        read.current?.abort();
        read.current = null;
        setLoading(false);
        setError("");
        setPendingId(undefined);
        setOpen(false);
    };

    const restore = async (id: string) => {
        if (blocked) return;
        if (await onRestore(id)) close();
    };

    return (
        <>
            <button
                ref={entry}
                type="button"
                className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-[var(--gm-border)] px-3 text-sm font-medium hover:bg-[var(--gm-wash)] focus-visible:outline-2 focus-visible:outline-[var(--gm-accent)]"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => {
                    setPage({ records: [] });
                    setOpen(true);
                    void load();
                }}
            >
                <History aria-hidden="true" className="size-4" />
                历史记录
            </button>
            <Drawer
                title="反推提示词历史记录"
                open={open}
                onClose={() => {
                    if (!restoring) close();
                }}
                afterOpenChange={(isOpen) => {
                    if (!isOpen) entry.current?.focus();
                }}
                size={410}
                destroyOnHidden
                extra={
                    <GammaButton size="sm" variant="ghost" disabled={loading || restoring} onClick={() => void load()}>
                        刷新记录
                    </GammaButton>
                }
            >
                <div className="space-y-4">
                    <p className="text-sm leading-6 text-[var(--gm-text-3)]">完成分析后自动保存。恢复历史只更新工作台，不会重新分析、生成或扣费。</p>
                    {blocked && !restoring ? (
                        <p role="status" className="text-sm text-[var(--gm-text-2)]">
                            当前操作尚未完成，完成后可恢复历史。
                        </p>
                    ) : null}
                    {error ? (
                        <p role="alert" className="text-sm text-[var(--gm-danger)]">
                            {error}
                        </p>
                    ) : null}
                    {loading ? (
                        <p role="status" className="text-sm text-[var(--gm-text-3)]">
                            正在加载历史记录…
                        </p>
                    ) : null}
                    {!page.records.length && !error && !loading ? <p className="rounded-xl border border-dashed border-[var(--gm-border)] p-4 text-sm text-[var(--gm-text-3)]">暂无历史记录。完成一次反推分析后，记录会显示在这里。</p> : null}
                    <ul className="space-y-3">
                        {page.records.map((record) => (
                            <li key={record.id} className="space-y-2 rounded-xl border border-[var(--gm-border)] p-3">
                                <div className="flex items-center gap-3">
                                    <HistoryThumbnail key={record.sourceUrl} sourceUrl={record.sourceUrl} />
                                    <div className="min-w-0 space-y-1 text-sm">
                                        <p className="font-medium">
                                            {REVERSE_PROMPT_MODES.find(({ id }) => id === record.analysisMode)?.label || "反推分析"}
                                            {activeId === record.id ? " · 当前练习" : ""}
                                        </p>
                                        <p className="text-xs text-[var(--gm-text-3)]">
                                            {formatDate.format(record.createdAt)} · {trialLabel(record)}
                                        </p>
                                    </div>
                                </div>
                                {pendingId === record.id ? (
                                    <div className="space-y-2 rounded-lg bg-[var(--gm-wash)] p-2">
                                        <p role="status" className="text-sm">
                                            恢复会覆盖工作台中未保存的修改。
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <GammaButton size="sm" variant="outline" disabled={restoring} onClick={() => setPendingId(undefined)}>
                                                取消
                                            </GammaButton>
                                            <GammaButton size="sm" disabled={blocked} onClick={() => void restore(record.id)}>
                                                确认恢复
                                            </GammaButton>
                                        </div>
                                    </div>
                                ) : (
                                    <GammaButton size="sm" variant="outline" disabled={blocked} onClick={() => (dirty ? setPendingId(record.id) : void restore(record.id))}>
                                        恢复到工作台
                                    </GammaButton>
                                )}
                            </li>
                        ))}
                    </ul>
                    {page.nextCursor ? (
                        <GammaButton size="sm" variant="outline" disabled={loading || restoring} onClick={() => void load(page.nextCursor)}>
                            加载更多
                        </GammaButton>
                    ) : null}
                </div>
            </Drawer>
        </>
    );
}
