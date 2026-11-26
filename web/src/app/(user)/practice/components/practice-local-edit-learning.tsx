"use client";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { canvasReadableImageUrl } from "@/lib/browser-media-url";
import { localEditPromptExample, type LocalEditPracticeRecord } from "@/lib/practice-image-tools";

export function LocalEditHistory({
    records,
    activeId,
    error,
    loading,
    onOpen,
    onReload,
}: {
    records: LocalEditPracticeRecord[];
    activeId?: string;
    error: boolean;
    loading: boolean;
    onOpen: (record: LocalEditPracticeRecord) => void;
    onReload: () => void;
}) {
    return (
        <section aria-label="历史记录" className="min-w-0 space-y-2 self-start rounded-2xl border border-[var(--gm-border)] bg-[var(--gm-surface)] p-4 sm:p-5 lg:col-span-2 xl:col-span-1 xl:self-stretch">
            <h2 className="mb-4 font-semibold">历史记录</h2>
            {loading && !records.length ? <p className="text-xs text-[var(--gm-text-3)]">正在加载练习历史…</p> : null}
            {error ? (
                <p className="text-xs text-[var(--gm-text-3)]">
                    历史读取失败。
                    <button type="button" className="underline" onClick={onReload}>
                        重新加载
                    </button>
                </p>
            ) : !loading && !records.length ? (
                <p className="text-xs text-[var(--gm-text-3)]">完成局部编辑后，可在这里回看最近的结果。</p>
            ) : null}
            {records.map((record) => (
                <button
                    key={record.id}
                    type="button"
                    aria-pressed={activeId === record.id}
                    className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-[var(--gm-border)] p-2 text-left hover:bg-[var(--gm-wash)] aria-pressed:border-[var(--gm-accent)] aria-pressed:bg-[var(--gm-wash)]"
                    onClick={() => onOpen(record)}
                >
                    <img src={record.image.url} alt="" loading="lazy" className="size-12 shrink-0 rounded bg-[var(--gm-wash)] object-contain" />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm" title={record.prompt}>
                            {record.prompt}
                        </span>
                        <time className="block text-xs text-[var(--gm-text-3)]" dateTime={new Date(record.createdAt).toISOString()}>
                            {new Date(record.createdAt).toLocaleString()}
                        </time>
                    </span>
                </button>
            ))}
        </section>
    );
}

export function LocalEditPromptLesson({ record, disabled, onApply, onRestore, onCopy }: { record: LocalEditPracticeRecord; disabled: boolean; onApply: (value: string) => void; onRestore: () => void; onCopy: (value: string) => void }) {
    const example = localEditPromptExample(record.prompt);
    return (
        <section aria-label="提示词拆解" className="space-y-3 rounded-xl border border-[var(--gm-border)] p-3 sm:p-4">
            <h3 className="text-sm font-semibold">提示词拆解</h3>
            <div className="text-sm">
                <h4 className="font-medium">本次原始输入</h4>
                <p className="mt-1 whitespace-pre-wrap break-words text-[var(--gm-text-2)]">{record.prompt}</p>
            </div>
            <p className="text-xs text-[var(--gm-text-3)]">下面是教学建议，不是本次已经发送的提示词。</p>
            <dl className="grid gap-2 text-sm">
                <div>
                    <dt className="font-medium">改什么</dt>
                    <dd className="text-[var(--gm-text-2)]">明确涂抹范围内要修改的对象，例如「原来的黄色弧线」。</dd>
                </div>
                <div>
                    <dt className="font-medium">改成什么</dt>
                    <dd className="break-words text-[var(--gm-text-2)]">在「{record.prompt}」的基础上，补上目标颜色、材质或状态。</dd>
                </div>
                <div>
                    <dt className="font-medium">什么不变</dt>
                    <dd className="text-[var(--gm-text-2)]">明确要保留的形状、细节和背景；不要把涂抹轮廓画进成品。</dd>
                </div>
            </dl>
            <div className="rounded-lg bg-[var(--gm-wash)] p-2 text-sm">
                <h4 className="font-medium">可参考的写法</h4>
                <p className="mt-1 whitespace-pre-wrap break-words">{example}</p>
            </div>
            <details className="text-sm">
                <summary className="cursor-pointer">查看本次选区</summary>
                <p className="my-1 text-xs text-[var(--gm-text-3)]">深色区域是本次涂抹的位置，白色是未选区。</p>
                <img src={record.maskUrl} alt="本次编辑选区" loading="lazy" className="max-h-56 max-w-full rounded bg-slate-800 object-contain" />
            </details>
            <div className="flex flex-wrap gap-2">
                <GammaButton size="sm" variant="outline" onClick={() => onCopy(example)}>
                    复制参考写法
                </GammaButton>
                <GammaButton size="sm" variant="outline" disabled={disabled} onClick={() => onApply(example)}>
                    填回修改说明
                </GammaButton>
                <GammaButton size="sm" variant="outline" disabled={disabled} onClick={onRestore}>
                    用这次设置继续
                </GammaButton>
            </div>
        </section>
    );
}

export async function readLocalEditSelection(url: string) {
    const response = await fetch(canvasReadableImageUrl(url), { cache: "no-store" });
    if (!response.ok) throw new Error("历史选区已失效，请重新上传并涂抹");
    const bitmap = await createImageBitmap(await response.blob());
    try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法读取历史选区");
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        const selection = context.createImageData(bitmap.width, bitmap.height);
        for (let index = 0; index < data.length; index += 4) {
            if (data[index + 3] !== 0) continue;
            selection.data.set([30, 136, 229, 148], index);
        }
        return selection;
    } finally {
        bitmap.close();
    }
}
