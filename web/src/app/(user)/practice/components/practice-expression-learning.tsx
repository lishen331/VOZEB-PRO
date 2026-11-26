"use client";

import { useState } from "react";
import { Drawer } from "antd";
import { History } from "lucide-react";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { expressionLesson, type ExpressionPracticeRecord } from "@/lib/practice-expression-learning";

export const expressionStatus = { pending: "排队中", running: "生成中", success: "已完成", error: "未生成图片", cancelled: "已取消" };

export function ExpressionPromptLesson({ record, dirty, onCopy }: { record: ExpressionPracticeRecord; dirty: boolean; onCopy: (prompt: string) => void }) {
    const lesson = expressionLesson(record.selection);
    const archivedParts = record.prompt.replace(/。$/, "").split("，");
    const rows = record.prompt === lesson.prompt ? lesson.rows : archivedParts.length === lesson.rows.length ? lesson.rows.map((row, index) => ({ ...row, value: archivedParts[index] })) : [];
    return (
        <section className="mt-4 space-y-3 rounded-xl border border-[var(--gm-border)] p-4" aria-label="本次提示词拆解">
            <h3 className="font-semibold">本次提示词拆解</h3>
            {dirty ? <p className="text-xs text-[var(--gm-text-2)]">左侧设置尚未生成；这里仍是上一次练习的结果和提示词。</p> : null}
            <dl className="grid gap-3 text-sm">
                {rows.map(({ label, value }) => (
                    <div key={label}>
                        <dt className="font-medium">{label}</dt>
                        <dd className="text-[var(--gm-text-2)]">{value}</dd>
                    </div>
                ))}
            </dl>
            <details>
                <summary className="cursor-pointer text-sm">查看完整提示词</summary>
                <p className="mt-2 break-words text-sm">{record.prompt}</p>
            </details>
            <GammaButton size="sm" variant="outline" onClick={() => onCopy(record.prompt)}>
                复制提示词
            </GammaButton>
        </section>
    );
}

export function ExpressionHistory({
    records,
    activeId,
    loading,
    error,
    blocked,
    onRestore,
    onReload,
}: {
    records: ExpressionPracticeRecord[];
    activeId?: string;
    loading: boolean;
    error: boolean;
    blocked: boolean;
    onRestore: (record: ExpressionPracticeRecord) => Promise<boolean>;
    onReload: () => void;
}) {
    const [open, setOpen] = useState(false);
    const list = (mobile: boolean) => (
        <>
            {error ? (
                <p role="alert" className="mb-2 text-sm">
                    历史读取失败，可以重试。
                </p>
            ) : null}
            {!records.length ? <p className="text-sm text-[var(--gm-text-2)]">{loading ? "正在加载…" : "暂无练习历史"}</p> : null}
            <ul className="space-y-2">
                {records.map((record) => (
                    <li key={record.id}>
                        <button
                            type="button"
                            disabled={blocked}
                            aria-current={activeId === record.id ? "true" : undefined}
                            className="flex w-full items-center gap-3 rounded-lg border border-[var(--gm-border)] p-2 text-left text-sm hover:bg-[var(--gm-wash)] aria-current:border-[var(--gm-accent)] disabled:opacity-60"
                            onClick={async () => {
                                if ((await onRestore(record)) && mobile) setOpen(false);
                            }}
                        >
                            <img src={record.image?.url || record.sourceUrl} alt="" className="size-12 shrink-0 rounded-md object-cover" />
                            <span className="min-w-0">
                                <span className="block font-medium">
                                    {expressionLesson(record.selection).expression} · {expressionStatus[record.status]}
                                </span>
                                <time className="block text-xs text-[var(--gm-text-2)]" dateTime={new Date(record.createdAt).toISOString()}>
                                    {new Date(record.createdAt).toLocaleString("zh-CN")}
                                </time>
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </>
    );
    const reload = (
        <GammaButton size="sm" variant="outline" disabled={loading} onClick={onReload}>
            刷新历史
        </GammaButton>
    );
    return (
        <div className="min-w-0">
            <aside aria-label="练习历史" className="hidden rounded-2xl border border-[var(--gm-border)] bg-[var(--gm-surface)] p-4 xl:block">
                <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">练习历史</h2>
                    {reload}
                </header>
                {list(false)}
            </aside>
            <div className="xl:hidden">
                <GammaButton variant="outline" onClick={() => setOpen(true)} icon={<History className="size-4" />}>
                    历史记录
                </GammaButton>
            </div>
            <Drawer title="练习历史" open={open} onClose={() => setOpen(false)} extra={reload} size="default" styles={{ wrapper: { maxWidth: "100vw" } }}>
                {list(true)}
            </Drawer>
        </div>
    );
}
