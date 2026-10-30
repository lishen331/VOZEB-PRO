"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Pause, Play, Square, X } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import type { CourseMaterial } from "@/lib/school-domain";
import { lessonPlanTotalMinutes, type LessonPlanContent } from "@/lib/teaching-lesson-plan";
import { cn } from "@/lib/utils";
import { MaterialStage } from "./prep-materials";
import type { RehearsalInput } from "./use-lesson-plan";

/*
 * 试讲：老师自己按教案演练一遍，不选班级、不碰学生名单。
 *   左：环节列表（计划时长 / 已用时长，当前环节高亮）
 *   中：当前环节要放映的资料（环节没挂资料时放整节课的资料），←/→ 翻资料
 *   下：讲者备注（讲解要点 + 教师活动 + 学生活动）
 *   顶：当前环节倒计时、全程用时、暂停、下一环节、结束
 * 结束后显示每个环节「计划 vs 实际」，保存成试讲记录，提示去写教学反思。
 */

const TICK_MS = 1000;
/** 超出计划 1 分钟以内不算超时，避免切环节慢了几秒就标黄 */
const OVERTIME_GRACE_SECONDS = 60;

/** 计划时长为满格；超时部分用警示色接在后面 */
function PhaseBar({ seconds, plannedSeconds }: { seconds: number; plannedSeconds: number }) {
    const scale = Math.max(plannedSeconds, seconds, 1);
    const used = Math.min(seconds, plannedSeconds);
    const over = Math.max(0, seconds - plannedSeconds);
    return (
        <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-[var(--gm-wash-strong)]">
            <span className="h-full bg-[image:var(--gm-gradient)]" style={{ width: `${(used / scale) * 100}%` }} />
            {over ? <span className="h-full bg-[var(--gm-warning)]" style={{ width: `${(over / scale) * 100}%` }} /> : null}
        </div>
    );
}

function clock(totalSeconds: number) {
    const sign = totalSeconds < 0 ? "-" : "";
    const value = Math.abs(totalSeconds);
    return `${sign}${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

type Summary = { phaseId: string; name: string; plannedMinutes: number; seconds: number }[];

function RehearsalSummary({ summary, saving, saveError, onClose }: { summary: Summary; saving: boolean; saveError: string; onClose: () => void }) {
    const planned = summary.reduce((sum, item) => sum + item.plannedMinutes * 60, 0);
    const actual = summary.reduce((sum, item) => sum + item.seconds, 0);
    return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5 p-6 pt-10">
            <div>
                <h2 className="text-xl font-semibold">试讲完成</h2>
                <p className="mt-1 text-sm text-[var(--gm-text-2)] tabular-nums">
                    计划 {clock(planned)} · 实际 {clock(actual)}
                    {actual > planned ? <span className="text-[var(--gm-warning)]">，超出 {clock(actual - planned)}</span> : null}
                </p>
            </div>
            <ol className="flex flex-col gap-2">
                {summary.map((item, index) => {
                    const plannedSeconds = item.plannedMinutes * 60;
                    const over = item.seconds > plannedSeconds + OVERTIME_GRACE_SECONDS;
                    return (
                        <li key={item.phaseId} className="flex flex-col gap-1.5 rounded-[var(--gm-radius)] bg-[var(--gm-surface)] px-3.5 py-2.5 ring-1 ring-[var(--gm-border)]">
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="truncate">
                                    {index + 1}. {item.name || "未命名环节"}
                                </span>
                                <span className={cn("shrink-0 tabular-nums", over ? "text-[var(--gm-warning)]" : "text-[var(--gm-text-2)]")}>
                                    {clock(item.seconds)} / {item.plannedMinutes} 分钟
                                </span>
                            </div>
                            <PhaseBar seconds={item.seconds} plannedSeconds={plannedSeconds} />
                        </li>
                    );
                })}
            </ol>
            <p role="status" className={cn("text-xs leading-relaxed", saveError ? "text-[var(--gm-danger)]" : "text-[var(--gm-text-3)]")}>
                {saving ? "正在保存试讲记录…" : saveError ? `试讲记录保存失败：${saveError}` : "试讲记录已保存。回到教案，把超时的环节调一调，在「教学反思」里记下要改的地方。"}
            </p>
            <GammaButton onClick={onClose} className="self-start">
                回到教案
            </GammaButton>
        </div>
    );
}

export interface PrepRehearsalProps {
    caption: string;
    content: LessonPlanContent;
    materials: readonly CourseMaterial[];
    onFinish: (input: RehearsalInput) => Promise<unknown>;
    onClose: () => void;
}

export function PrepRehearsal({ caption, content, materials, onFinish, onClose }: PrepRehearsalProps) {
    const phases = content.phases;
    const [current, setCurrent] = useState(0);
    const [spent, setSpent] = useState<number[]>(() => phases.map(() => 0));
    const [paused, setPaused] = useState(false);
    const [slide, setSlide] = useState(0);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");

    const phase = phases[current];
    const byId = useMemo(() => new Map(materials.map((item) => [item.id, item])), [materials]);
    const phaseMaterials = useMemo(() => {
        const picked = (phase?.materialIds ?? []).flatMap((id) => byId.get(id) ?? []);
        return picked.length ? picked : materials;
    }, [byId, materials, phase]);
    const material = phaseMaterials[Math.min(slide, phaseMaterials.length - 1)];
    const totalSpent = spent.reduce((sum, value) => sum + value, 0);
    const remaining = phase ? phase.minutes * 60 - (spent[current] ?? 0) : 0;

    useEffect(() => {
        if (paused || summary || !phase) return;
        const timer = window.setInterval(() => setSpent((list) => list.map((value, index) => (index === current ? value + 1 : value))), TICK_MS);
        return () => window.clearInterval(timer);
    }, [current, paused, phase, summary]);

    const finish = () => {
        const result = phases.map((item, index) => ({ phaseId: item.id, name: item.name, plannedMinutes: item.minutes, seconds: spent[index] ?? 0 }));
        setSummary(result);
        if (!totalSpent) return;
        setSaving(true);
        onFinish({ totalSeconds: totalSpent, phases: result.map(({ phaseId, seconds }) => ({ phaseId, seconds })) })
            .catch((error: unknown) => setSaveError(error instanceof Error ? error.message : "保存失败"))
            .finally(() => setSaving(false));
    };

    const goPhase = (next: number) => {
        setCurrent(next);
        setSlide(0);
    };

    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
            if (summary) return;
            if (event.key === " ") {
                event.preventDefault();
                setPaused((value) => !value);
            }
            if (event.key === "ArrowRight") setSlide((value) => Math.min(phaseMaterials.length - 1, value + 1));
            if (event.key === "ArrowLeft") setSlide((value) => Math.max(0, value - 1));
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [onClose, phaseMaterials.length, summary]);

    return createPortal(
        // 试讲固定用深色（.gm 作用域取深色 token），和「放映」一致，投屏时不刺眼
        <motion.div role="dialog" aria-modal="true" aria-label="试讲" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="gm fixed inset-0 z-[1000] flex flex-col">
            <header className="relative flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] px-4 py-2.5">
                <span className="rounded-full bg-[var(--gm-accent-soft)] px-2.5 py-1 text-[11px] text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]">试讲 · 不计入班级</span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{caption}</p>
                    {!summary && phase ? (
                        <p className="truncate text-[11px] text-[var(--gm-text-3)]">
                            第 {current + 1}/{phases.length} 环节 · {phase.name || "未命名环节"}
                        </p>
                    ) : null}
                </div>
                {!summary && phase ? (
                    <>
                        <div className="flex flex-col items-end leading-tight">
                            <span className={cn("font-mono text-2xl font-semibold tabular-nums", remaining < 0 ? "text-[var(--gm-warning)]" : "", paused ? "opacity-50" : "")} aria-label="本环节剩余时间">
                                {clock(remaining)}
                            </span>
                            <span className="text-[11px] text-[var(--gm-text-3)] tabular-nums">
                                {paused ? "已暂停 · " : ""}全程 {clock(totalSpent)} / {lessonPlanTotalMinutes(content)} 分钟
                            </span>
                        </div>
                        <GammaButton size="sm" variant="glass" icon={paused ? <Play className="size-4" /> : <Pause className="size-4" />} onClick={() => setPaused((value) => !value)}>
                            {paused ? "继续" : "暂停"}
                        </GammaButton>
                        {current < phases.length - 1 ? (
                            <GammaButton size="sm" trailingIcon={<ChevronRight className="size-4" />} onClick={() => goPhase(current + 1)}>
                                下一环节
                            </GammaButton>
                        ) : null}
                        <GammaButton size="sm" variant="outline" icon={<Square className="size-3.5" />} onClick={finish}>
                            结束试讲
                        </GammaButton>
                    </>
                ) : null}
                <button type="button" aria-label="退出试讲" onClick={onClose} className="grid size-9 place-items-center rounded-full text-[var(--gm-text-2)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]">
                    <X className="size-4" />
                </button>
                {!summary && phase ? (
                    <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--gm-wash)]">
                        <span
                            className={cn("block h-full transition-[width] duration-1000 ease-linear", remaining < 0 ? "bg-[var(--gm-warning)]" : "bg-[image:var(--gm-gradient)]")}
                            style={{ width: `${phase.minutes ? Math.min(100, ((spent[current] ?? 0) / (phase.minutes * 60)) * 100) : 100}%` }}
                        />
                    </span>
                ) : null}
            </header>

            {summary ? (
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <RehearsalSummary summary={summary} saving={saving} saveError={saveError} onClose={onClose} />
                </div>
            ) : !phase ? (
                <div className="grid flex-1 place-items-center text-sm text-[var(--gm-text-2)]">教案还没有教学环节，先在「教案」里安排环节再试讲。</div>
            ) : (
                <div className="grid min-h-0 flex-1 grid-cols-[232px_minmax(0,1fr)] max-md:grid-cols-1">
                    <nav aria-label="教学环节" className="gm-scroll min-h-0 overflow-y-auto border-r border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] p-2 max-md:hidden">
                        {phases.map((item, index) => {
                            const used = spent[index] ?? 0;
                            const active = index === current;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    aria-current={active ? "step" : undefined}
                                    onClick={() => goPhase(index)}
                                    className={cn(
                                        "mb-1 flex w-full flex-col gap-1.5 rounded-[var(--gm-radius-sm)] px-3 py-2 text-left text-sm transition-colors",
                                        active ? "bg-[var(--gm-accent-soft)] ring-1 ring-[var(--gm-accent-ring)]" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)]",
                                    )}
                                >
                                    <span className="flex items-baseline justify-between gap-2">
                                        <span className="truncate font-medium">
                                            {index + 1}. {item.name || "未命名环节"}
                                        </span>
                                        <span className={cn("shrink-0 text-[11px] tabular-nums", used > item.minutes * 60 ? "text-[var(--gm-warning)]" : "text-[var(--gm-text-3)]")}>
                                            {clock(used)} / {item.minutes}′
                                        </span>
                                    </span>
                                    {used || active ? <PhaseBar seconds={used} plannedSeconds={item.minutes * 60} /> : null}
                                </button>
                            );
                        })}
                    </nav>
                    <div className="flex min-h-0 flex-col">
                        <div className="relative min-h-0 flex-1 p-4">
                            {material ? (
                                <MaterialStage material={material} />
                            ) : (
                                <div className="grid h-full place-items-center rounded-[var(--gm-radius-xl)] border border-dashed border-[var(--gm-border-strong)] text-sm text-[var(--gm-text-3)]">这节课还没有资料，可以只按环节和讲者备注试讲</div>
                            )}
                            {phaseMaterials.length > 1 ? (
                                <div className="gm-glass absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-1.5 py-1 text-xs">
                                    <button type="button" aria-label="上一份资料" onClick={() => setSlide((value) => Math.max(0, value - 1))} className="grid size-7 place-items-center rounded-full hover:bg-[var(--gm-wash-strong)]">
                                        <ChevronLeft className="size-4" />
                                    </button>
                                    <span className="tabular-nums">
                                        {Math.min(slide, phaseMaterials.length - 1) + 1} / {phaseMaterials.length}
                                    </span>
                                    <button type="button" aria-label="下一份资料" onClick={() => setSlide((value) => Math.min(phaseMaterials.length - 1, value + 1))} className="grid size-7 place-items-center rounded-full hover:bg-[var(--gm-wash-strong)]">
                                        <ChevronRight className="size-4" />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        <section aria-label="讲者备注" className="gm-scroll grid max-h-[38%] shrink-0 gap-4 overflow-y-auto border-t border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] px-5 py-3.5 text-sm md:grid-cols-[1.4fr_1fr_1fr]">
                            <div>
                                <h3 className="mb-1 text-[11px] font-medium text-[var(--gm-accent)]">讲解要点</h3>
                                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{phase.notes || "—"}</p>
                            </div>
                            <div>
                                <h3 className="mb-1 text-[11px] font-medium text-[var(--gm-text-3)]">教师活动</h3>
                                <p className="leading-relaxed whitespace-pre-wrap text-[var(--gm-text-2)]">{phase.teacher || "—"}</p>
                            </div>
                            <div>
                                <h3 className="mb-1 text-[11px] font-medium text-[var(--gm-text-3)]">学生活动</h3>
                                <p className="leading-relaxed whitespace-pre-wrap text-[var(--gm-text-2)]">{phase.student || "—"}</p>
                            </div>
                            <p className="text-[11px] text-[var(--gm-text-3)] md:col-span-full">空格 暂停/继续 · ← / → 翻资料 · Esc 退出</p>
                        </section>
                    </div>
                </div>
            )}
        </motion.div>,
        document.body,
    );
}
