"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Check, CloudOff, Loader2, Plus, RotateCcw, X } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import type { CourseMaterial } from "@/lib/school-domain";
import { LESSON_PLAN_LIMITS, type LessonPlanContent, type LessonPlanRehearsal } from "@/lib/teaching-lesson-plan";
import type { PlanDoc, PlanLoad, SaveState } from "./use-lesson-plan";
import { PhaseEditor } from "./prep-plan-phases";
import { LessonTemplatePanel } from "./prep-plan-template";

/*
 * 右栏「教案」：老师自己的教案，停手自动保存。
 *   教学目标（可增删的条目）· 重点 · 难点 · 课前准备 · 教学环节（时间轴 + 环节卡片）· 课后作业 · 教学反思
 * 顶部一行保存状态；冲突时给「载入最新」/「用我的覆盖」两个选择。
 */

const TEXT_AREA = { autoSize: { minRows: 2, maxRows: 10 }, maxLength: LESSON_PLAN_LIMITS.textLength } as const;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** 上次试讲：各环节计划 vs 实际，超时的标出来，方便写反思 */
function LastRehearsal({ rehearsal, count }: { rehearsal: LessonPlanRehearsal; count: number }) {
    const planned = rehearsal.phases.reduce((sum, item) => sum + item.plannedMinutes * 60, 0);
    return (
        <section className="flex flex-col gap-2 rounded-[12px] bg-[var(--gm-wash)] p-3">
            <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-xs font-medium text-[var(--gm-text-2)]">上次试讲</h4>
                <span className="text-[11px] text-[var(--gm-text-3)]">共试讲 {count} 次</span>
            </div>
            <p className="text-[12px] tabular-nums">
                用时 {clock(rehearsal.totalSeconds)} · 计划 {clock(planned)}
            </p>
            <ul className="flex flex-col gap-1 text-[12px] leading-relaxed">
                {rehearsal.phases.map((item) => {
                    const over = item.seconds > item.plannedMinutes * 60;
                    return (
                        <li key={item.phaseId} className="flex justify-between gap-2 tabular-nums">
                            <span className="truncate">{item.name}</span>
                            <span className={over ? "text-[var(--gm-warning)]" : "text-[var(--gm-text-3)]"}>
                                {clock(item.seconds)} / {item.plannedMinutes} 分钟
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <div>
                <h4 className="text-xs font-medium text-[var(--gm-text-2)]">{title}</h4>
                {hint ? <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--gm-text-3)]">{hint}</p> : null}
            </div>
            {children}
        </section>
    );
}

function SaveIndicator({
    state,
    error,
    savedAt,
    dirty,
    isStarter,
    onReload,
    onOverwrite,
    onRetry,
}: {
    state: SaveState;
    error: string;
    savedAt: string | null;
    dirty: boolean;
    isStarter: boolean;
    onReload: () => void;
    onOverwrite: () => void;
    onRetry: () => void;
}) {
    if (state === "conflict") {
        return (
            <div role="alert" className="flex flex-col gap-2 rounded-[10px] bg-[var(--gm-warning)]/12 px-3 py-2.5 text-xs text-[var(--gm-text)] ring-1 ring-[var(--gm-warning)]/40">
                <p className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="size-3.5 text-[var(--gm-warning)]" />
                    这份教案在别的窗口改过
                </p>
                <p className="text-[var(--gm-text-2)]">自动保存已暂停。选择保留哪一份：</p>
                <div className="flex gap-2">
                    <GammaButton size="xs" variant="outline" onClick={onReload}>
                        载入最新版本
                    </GammaButton>
                    <GammaButton size="xs" variant="soft" onClick={onOverwrite}>
                        用本页内容覆盖
                    </GammaButton>
                </div>
            </div>
        );
    }
    if (state === "error") {
        return (
            <p role="alert" className="flex items-center gap-1.5 text-[11px] text-[var(--gm-danger)]">
                <CloudOff className="size-3.5" />
                {error || "保存失败"}
                <button type="button" onClick={onRetry} className="ml-1 inline-flex items-center gap-0.5 underline underline-offset-2">
                    <RotateCcw className="size-3" />
                    重试
                </button>
            </p>
        );
    }
    if (state === "saving") {
        return (
            <p className="flex items-center gap-1.5 text-[11px] text-[var(--gm-text-3)]">
                <Loader2 className="size-3.5 animate-spin" />
                保存中…
            </p>
        );
    }
    if (isStarter && !dirty) return <p className="text-[11px] leading-relaxed text-[var(--gm-text-3)]">这是起步模板，改任意一处就会存成你自己的教案。</p>;
    if (dirty) return <p className="text-[11px] text-[var(--gm-text-3)]">有修改，停手后自动保存</p>;
    return (
        <p className="flex items-center gap-1.5 text-[11px] text-[var(--gm-text-3)]">
            <Check className="size-3.5 text-[var(--gm-success)]" />
            已保存{savedAt ? ` · ${new Date(savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </p>
    );
}

function ObjectiveList({ objectives, onChange }: { objectives: readonly string[]; onChange: (next: string[]) => void }) {
    // 编辑中允许空行（新加的那条），保存时由服务端清洗掉空目标
    return (
        <ol className="flex flex-col gap-1.5">
            {objectives.map((objective, index) => (
                <li key={index} className="flex items-start gap-2">
                    <span className="mt-2 w-4 shrink-0 text-right text-[11px] text-[var(--gm-text-3)] tabular-nums">{index + 1}.</span>
                    <Input.TextArea
                        aria-label={`教学目标 ${index + 1}`}
                        value={objective}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        maxLength={LESSON_PLAN_LIMITS.objectiveLength}
                        placeholder="学生学完能做到什么（用可检验的动词：说出 / 完成 / 对比…）"
                        onChange={(event) => onChange(objectives.map((item, i) => (i === index ? event.target.value : item)))}
                    />
                    <button
                        type="button"
                        aria-label={`删除教学目标 ${index + 1}`}
                        onClick={() => onChange(objectives.filter((_, i) => i !== index))}
                        className="mt-1 grid size-7 shrink-0 place-items-center rounded-full text-[var(--gm-text-3)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-danger)]"
                    >
                        <X className="size-3.5" />
                    </button>
                </li>
            ))}
            {objectives.length < LESSON_PLAN_LIMITS.objectives ? (
                <li>
                    <button type="button" onClick={() => onChange([...objectives, ""])} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs text-[var(--gm-accent)] hover:bg-[var(--gm-accent-soft)]">
                        <Plus className="size-3.5" />
                        添加目标
                    </button>
                </li>
            ) : null}
        </ol>
    );
}

export interface PlanEditorProps {
    doc: PlanDoc | null;
    load: PlanLoad;
    materials: readonly CourseMaterial[];
    saveState: SaveState;
    saveError: string;
    savedAt: string | null;
    dirty: boolean;
    onUpdate: (recipe: (content: LessonPlanContent) => LessonPlanContent) => void;
    onRetrySave: () => void;
    onReload: () => void;
    onOverwrite: () => void;
}

export function PlanEditor({ doc, load, materials, saveState, saveError, savedAt, dirty, onUpdate, onRetrySave, onReload, onOverwrite }: PlanEditorProps) {
    if (load.phase === "error") {
        return (
            <div className="flex flex-col items-start gap-2 text-xs">
                <p className="text-[var(--gm-danger)]">{load.message}</p>
                <GammaButton size="xs" variant="outline" onClick={onReload}>
                    重新加载
                </GammaButton>
            </div>
        );
    }
    if (load.phase === "loading" || !doc) {
        return (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="正在加载教案">
                {[0, 1, 2].map((item) => (
                    <span key={item} className="h-16 animate-pulse rounded-[10px] bg-[var(--gm-wash-strong)]" />
                ))}
            </div>
        );
    }
    const content = doc.content;
    const set = <K extends keyof LessonPlanContent>(key: K, value: LessonPlanContent[K]) => onUpdate((current) => ({ ...current, [key]: value }));
    return (
        <div className="flex flex-col gap-5">
            <SaveIndicator state={saveState} error={saveError} savedAt={savedAt} dirty={dirty} isStarter={doc.isStarter} onReload={onReload} onOverwrite={onOverwrite} onRetry={onRetrySave} />
            {doc.template ? <LessonTemplatePanel content={doc.template} /> : null}
            <Section title="教学目标" hint="写 2–4 条，学完能检验的结果">
                <ObjectiveList objectives={content.objectives} onChange={(next) => set("objectives", next)} />
            </Section>
            <Section title="教学重点">
                <Input.TextArea aria-label="教学重点" value={content.keyPoints} placeholder="这节课学生必须掌握的 1–2 个要点" onChange={(event) => set("keyPoints", event.target.value)} {...TEXT_AREA} />
            </Section>
            <Section title="教学难点">
                <Input.TextArea aria-label="教学难点" value={content.difficulties} placeholder="学生最容易卡住的地方，以及你准备怎么化解" onChange={(event) => set("difficulties", event.target.value)} {...TEXT_AREA} />
            </Section>
            <Section title="课前准备" hint="上课前要检查的东西：账号、素材、示范作品、设备">
                <Input.TextArea aria-label="课前准备" value={content.preparation} placeholder={"每行一项，例如：\n确认学生账号能登录\n准备 3 张示范作品"} onChange={(event) => set("preparation", event.target.value)} {...TEXT_AREA} />
            </Section>
            <Section title="教学环节" hint="按上课顺序排；讲解要点会在试讲时显示在讲者备注区">
                <PhaseEditor phases={content.phases} materials={materials} onChange={(next) => set("phases", next)} />
            </Section>
            <Section title="课后作业" hint="写清要求、提交形式和评价标准；真正布置给班级在「作业」标签里做">
                <Input.TextArea aria-label="课后作业" value={content.homework} placeholder="作业要求、提交形式、评价标准" onChange={(event) => set("homework", event.target.value)} {...TEXT_AREA} />
            </Section>
            {doc.lastRehearsal ? <LastRehearsal rehearsal={doc.lastRehearsal} count={doc.rehearsalCount} /> : null}
            <Section title="教学反思" hint="试讲或上完课后记下来：哪里超时、哪里学生没听懂、下次怎么改">
                <Input.TextArea aria-label="教学反思" value={content.reflection} placeholder="（可选）" onChange={(event) => set("reflection", event.target.value)} {...TEXT_AREA} />
            </Section>
        </div>
    );
}
