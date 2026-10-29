"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { Input, InputNumber } from "@/components/gamma-ui/gamma-ant-input";
import type { CourseMaterial } from "@/lib/school-domain";
import { LESSON_PLAN_LIMITS, lessonPlanTotalMinutes, type LessonPlanPhase } from "@/lib/teaching-lesson-plan";
import { cn } from "@/lib/utils";

/*
 * 教案的「教学环节」编辑：顶部按时长比例的时间轴，下面每个环节一张卡片
 *（名称 · 时长 · 教师活动 · 学生活动 · 讲解要点 · 本环节放映的资料），可上移 / 下移 / 删除。
 */

const SUGGESTED_MINUTES = 90;
const ICON_BTN = "grid size-7 place-items-center rounded-full text-[var(--gm-text-3)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)] disabled:pointer-events-none disabled:opacity-30";
export const PHASE_COLORS = ["bg-[var(--gm-blue)]", "bg-[var(--gm-accent)]", "bg-[var(--gm-success)]", "bg-[var(--gm-warning)]", "bg-[var(--gm-text-3)]"];

function newPhaseId(phases: readonly LessonPlanPhase[]) {
    let index = phases.length + 1;
    while (phases.some((phase) => phase.id === `phase-${index}`)) index += 1;
    return `phase-${index}`;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-[var(--gm-text-3)]">
                {label}
                {hint ? <span className="ml-1 font-normal opacity-70">{hint}</span> : null}
            </span>
            {children}
        </label>
    );
}

export function PhaseTimeline({ phases }: { phases: readonly LessonPlanPhase[] }) {
    const total = lessonPlanTotalMinutes({ phases });
    if (!total) return null;
    const tooLong = total > SUGGESTED_MINUTES + 10;
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--gm-wash)]">
                {phases.map((phase, index) =>
                    phase.minutes ? (
                        <span
                            key={phase.id}
                            title={`${phase.name || `环节 ${index + 1}`} · ${phase.minutes} 分钟`}
                            className={cn("h-full border-r border-[var(--gm-bg-elevated)] last:border-r-0", PHASE_COLORS[index % PHASE_COLORS.length])}
                            style={{ width: `${(phase.minutes / total) * 100}%` }}
                        />
                    ) : null,
                )}
            </div>
            <p className={cn("text-[11px] tabular-nums", tooLong ? "text-[var(--gm-warning)]" : "text-[var(--gm-text-3)]")}>
                合计 {total} 分钟{tooLong ? `，比常见的 ${SUGGESTED_MINUTES} 分钟（两节连上）长，确认课时安排` : ""}
            </p>
        </div>
    );
}

type PhaseCardProps = {
    phase: LessonPlanPhase;
    index: number;
    count: number;
    materials: readonly CourseMaterial[];
    onChange: (patch: Partial<LessonPlanPhase>) => void;
    onMove: (offset: -1 | 1) => void;
    onRemove: () => void;
};

function PhaseCard({ phase, index, count, materials, onChange, onMove, onRemove }: PhaseCardProps) {
    const toggleMaterial = (id: string) => onChange({ materialIds: phase.materialIds.includes(id) ? phase.materialIds.filter((item) => item !== id) : [...phase.materialIds, id] });
    const label = phase.name || `环节 ${index + 1}`;
    return (
        <li className="@container flex flex-col gap-3 rounded-[14px] bg-[var(--gm-bg-elevated)] p-3.5 ring-1 ring-[var(--gm-border)]">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white tabular-nums", PHASE_COLORS[index % PHASE_COLORS.length])}>{index + 1}</span>
                <Input aria-label={`第 ${index + 1} 个环节名称`} value={phase.name} maxLength={LESSON_PLAN_LIMITS.phaseNameLength} placeholder="环节名称，例如：导入" onChange={(event) => onChange({ name: event.target.value })} />
                <div className="flex shrink-0">
                    <button type="button" aria-label={`上移「${label}」`} disabled={index === 0} onClick={() => onMove(-1)} className={ICON_BTN}>
                        <ArrowUp className="size-3.5" />
                    </button>
                    <button type="button" aria-label={`下移「${label}」`} disabled={index === count - 1} onClick={() => onMove(1)} className={ICON_BTN}>
                        <ArrowDown className="size-3.5" />
                    </button>
                    <button type="button" aria-label={`删除「${label}」`} onClick={onRemove} className={cn(ICON_BTN, "hover:text-[var(--gm-danger)]")}>
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            </div>
            <div className="flex items-center gap-2 pl-8">
                <span className="shrink-0 text-[11px] font-medium whitespace-nowrap text-[var(--gm-text-3)]">时长</span>
                <InputNumber aria-label={`「${label}」时长（分钟）`} value={phase.minutes} min={0} max={LESSON_PLAN_LIMITS.phaseMinutes} onChange={(value) => onChange({ minutes: value ?? 0 })} suffix="分钟" className="w-28 shrink-0" />
            </div>
            {/* 按卡片自身宽度分栏：右栏只有 300–360px，按视口分栏会把两列挤成每行五六个字 */}
            <div className="grid gap-3 @lg:grid-cols-2">
                <Field label="教师活动" hint="必填">
                    <Input.TextArea
                        aria-label={`「${label}」教师活动`}
                        value={phase.teacher}
                        autoSize={{ minRows: 2, maxRows: 8 }}
                        maxLength={LESSON_PLAN_LIMITS.textLength}
                        placeholder="老师做什么、怎么讲、怎么示范"
                        onChange={(event) => onChange({ teacher: event.target.value })}
                    />
                </Field>
                <Field label="学生活动">
                    <Input.TextArea
                        aria-label={`「${label}」学生活动`}
                        value={phase.student}
                        autoSize={{ minRows: 2, maxRows: 8 }}
                        maxLength={LESSON_PLAN_LIMITS.textLength}
                        placeholder="学生做什么、产出什么"
                        onChange={(event) => onChange({ student: event.target.value })}
                    />
                </Field>
            </div>
            <Field label="讲解要点 / 话术" hint="试讲时显示在提词区">
                <Input.TextArea
                    aria-label={`「${label}」讲解要点`}
                    value={phase.notes}
                    autoSize={{ minRows: 1, maxRows: 6 }}
                    maxLength={LESSON_PLAN_LIMITS.textLength}
                    placeholder="关键提问、要强调的一句话、容易超时的提醒"
                    onChange={(event) => onChange({ notes: event.target.value })}
                />
            </Field>
            <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-[var(--gm-text-3)]">本环节放映的资料</span>
                {materials.length ? (
                    <div className="flex flex-wrap gap-1.5">
                        {materials.map((material) => {
                            const on = phase.materialIds.includes(material.id);
                            return (
                                <button
                                    key={material.id}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggleMaterial(material.id)}
                                    className={cn(
                                        "max-w-56 truncate rounded-full px-2.5 py-1 text-[12px] ring-1 transition-colors",
                                        on ? "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)] ring-[var(--gm-accent-ring)]" : "text-[var(--gm-text-2)] ring-[var(--gm-border)] hover:bg-[var(--gm-wash)]",
                                    )}
                                >
                                    {material.title}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-[12px] text-[var(--gm-text-3)]">本课时还没有资料，可在右侧「资料」标签上传后再选。</p>
                )}
            </div>
        </li>
    );
}

export function PhaseEditor({ phases, materials, onChange }: { phases: readonly LessonPlanPhase[]; materials: readonly CourseMaterial[]; onChange: (phases: LessonPlanPhase[]) => void }) {
    const patch = (index: number, value: Partial<LessonPlanPhase>) => onChange(phases.map((phase, i) => (i === index ? { ...phase, ...value } : phase)));
    const move = (index: number, offset: -1 | 1) => {
        const next = [...phases];
        const [item] = next.splice(index, 1);
        next.splice(index + offset, 0, item);
        onChange(next);
    };
    const add = () => onChange([...phases, { id: newPhaseId(phases), name: "", minutes: 10, teacher: "", student: "", notes: "", materialIds: [] }]);
    return (
        <div className="flex flex-col gap-3">
            <PhaseTimeline phases={phases} />
            <ol className="flex flex-col gap-3">
                {phases.map((phase, index) => (
                    <PhaseCard
                        key={phase.id}
                        phase={phase}
                        index={index}
                        count={phases.length}
                        materials={materials}
                        onChange={(value) => patch(index, value)}
                        onMove={(offset) => move(index, offset)}
                        onRemove={() => onChange(phases.filter((_, i) => i !== index))}
                    />
                ))}
            </ol>
            {phases.length < LESSON_PLAN_LIMITS.phases ? (
                <GammaButton size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={add} className="self-start">
                    添加环节
                </GammaButton>
            ) : null}
        </div>
    );
}
