"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Save, Trash2 } from "lucide-react";

import { GammaButton, GammaIconButton } from "@/components/gamma-ui/gamma-button";
import { GammaEmptyState, GammaToastStack } from "@/components/gamma-ui/gamma-overlays";
import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";
import { useGammaDemo } from "@/app/bluegamma/use-gamma-demo";

interface ScriptDraft {
    id: string;
    title: string;
    content: string;
    notes: string;
    savedAt: string;
}

/**
 * 剧本练习：对照线上 practice-script-panel.tsx —— 不是生成任务（没有排队/生成中/失败态），
 * 是「写完直接保存草稿」，mode 为 manual，跟其余 6 个工作流模块的状态机是两种不同的模式。
 */
export function ScriptsView() {
    const demo = useGammaDemo();
    const { toast } = demo;
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [notes, setNotes] = useState("");
    const [drafts, setDrafts] = useState<ScriptDraft[]>([]);
    const [saving, setSaving] = useState(false);

    const canSave = title.trim().length > 0 && content.trim().length > 0;

    const handleSave = () => {
        if (!canSave || saving) return;
        setSaving(true);
        window.setTimeout(() => {
            const draft: ScriptDraft = { id: `script-${Date.now()}`, title: title.trim(), content: content.trim(), notes: notes.trim(), savedAt: "刚刚" };
            setDrafts((list) => [draft, ...list]);
            setSaving(false);
            toast("success", "剧本草稿已保存");
        }, 500);
    };

    const handleOpen = (draft: ScriptDraft) => {
        setTitle(draft.title);
        setContent(draft.content);
        setNotes(draft.notes);
        toast("info", "已载入该草稿，可以继续编辑");
    };

    const handleDelete = (draft: ScriptDraft) => {
        setDrafts((list) => list.filter((item) => item.id !== draft.id));
        toast("success", "草稿已删除");
    };

    return (
        <GammaThemeProvider>
            <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)]">
                <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
                    <Link href="/bluegamma/practice" className="inline-flex items-center gap-1.5 text-sm text-[var(--gm-text-3)] transition-colors hover:text-[var(--gm-text)]">
                        <ArrowLeft className="size-4" />
                        返回练习
                    </Link>

                    <header className="mt-4 flex items-center gap-3 border-b border-[var(--gm-border)] pb-4">
                        <div className="grid size-11 shrink-0 place-items-center rounded-[var(--gm-radius-lg)] bg-[rgba(45,212,191,0.14)]">
                            <BookOpen className="size-5 text-[#14b8a6]" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-[var(--gm-text)]">剧本练习</h1>
                            <p className="mt-0.5 text-sm text-[var(--gm-text-3)]">从创意到剧本文本的单人练习，手写保存，不走生成排队</p>
                        </div>
                    </header>

                    <div className="mt-6 flex flex-col gap-4">
                        <label className="block text-sm font-medium text-[var(--gm-text)]">
                            剧本标题
                            <input
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder="例如：雨夜重逢"
                                className="mt-2 w-full rounded-[var(--gm-radius)] bg-[var(--gm-wash)] px-3 py-2.5 text-sm text-[var(--gm-text)] outline-none ring-1 ring-[var(--gm-border)] transition-shadow focus:shadow-[0_0_0_4px_var(--gm-accent-soft)] focus:ring-[var(--gm-accent)]"
                            />
                        </label>
                        <label className="block text-sm font-medium text-[var(--gm-text)]">
                            剧本正文
                            <textarea
                                value={content}
                                onChange={(event) => setContent(event.target.value)}
                                placeholder="用自己的话写下场景、人物和对白"
                                rows={10}
                                className="mt-2 w-full resize-none rounded-[var(--gm-radius)] bg-[var(--gm-wash)] p-3 text-sm leading-7 text-[var(--gm-text)] outline-none ring-1 ring-[var(--gm-border)] transition-shadow focus:shadow-[0_0_0_4px_var(--gm-accent-soft)] focus:ring-[var(--gm-accent)]"
                            />
                        </label>
                        <label className="block text-sm font-medium text-[var(--gm-text)]">
                            备注（可选）
                            <textarea
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                                rows={2}
                                className="mt-2 w-full resize-none rounded-[var(--gm-radius)] bg-[var(--gm-wash)] p-3 text-sm text-[var(--gm-text)] outline-none ring-1 ring-[var(--gm-border)] transition-shadow focus:shadow-[0_0_0_4px_var(--gm-accent-soft)] focus:ring-[var(--gm-accent)]"
                            />
                        </label>
                        <GammaButton className="self-start" icon={<Save className="size-4" />} loading={saving} disabled={!canSave} onClick={handleSave}>
                            保存草稿
                        </GammaButton>
                    </div>

                    <section className="mt-8 border-t border-[var(--gm-border)] pt-5">
                        <h2 className="text-base font-semibold text-[var(--gm-text)]">历史草稿</h2>
                        {drafts.length ? (
                            <div className="mt-4 flex flex-col divide-y divide-[var(--gm-border)]">
                                {drafts.map((draft) => (
                                    <div key={draft.id} className="group flex items-center gap-3 py-4">
                                        <button type="button" onClick={() => handleOpen(draft)} className="min-w-0 flex-1 text-left">
                                            <p className="truncate text-sm font-medium text-[var(--gm-text)]">{draft.title}</p>
                                            <p className="mt-0.5 truncate text-xs text-[var(--gm-text-3)]">
                                                {draft.content.slice(0, 40)} · {draft.savedAt}
                                            </p>
                                        </button>
                                        <GammaIconButton label="删除草稿" onClick={() => handleDelete(draft)} className="opacity-0 transition-opacity group-hover:opacity-100">
                                            <Trash2 className="size-3.5" />
                                        </GammaIconButton>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <GammaEmptyState icon={<BookOpen />} title="还没有草稿" description="写完第一个剧本并保存后，会显示在这里" />
                        )}
                    </section>
                </div>
            </main>
            <GammaToastStack toasts={demo.toasts} onDismiss={demo.dismissToast} />
        </GammaThemeProvider>
    );
}
