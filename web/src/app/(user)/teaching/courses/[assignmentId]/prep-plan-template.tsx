"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { BookMarked, ChevronDown } from "lucide-react";

import { lessonPlanTotalMinutes, type LessonPlanContent } from "@/lib/teaching-lesson-plan";
import { cn } from "@/lib/utils";
import { PhaseTimeline } from "./prep-plan-phases";

/*
 * 课程方的标准教案（只读参考）：显示在老师自己教案的上方，默认收起，展开后对照着写。
 * 不提供「套用」——老师的教案是自己的，标准教案只是参考。
 */

const TEXT = "text-[12.5px] leading-relaxed whitespace-pre-wrap text-[var(--gm-text-2)]";

function Item({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <h5 className="text-[11px] font-medium text-[var(--gm-text-3)]">{title}</h5>
            {children}
        </div>
    );
}

function TextItem({ title, value }: { title: string; value: string }) {
    if (!value) return null;
    return (
        <Item title={title}>
            <p className={TEXT}>{value}</p>
        </Item>
    );
}

export function LessonTemplatePanel({ content }: { content: LessonPlanContent }) {
    const [open, setOpen] = useState(false);
    const minutes = lessonPlanTotalMinutes(content);
    return (
        <section className="rounded-[14px] bg-[var(--gm-accent-soft)] ring-1 ring-[var(--gm-accent-ring)]">
            <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left">
                <BookMarked className="size-4 shrink-0 text-[var(--gm-accent)]" />
                <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">课程方标准教案</span>
                    <span className="block text-[11px] text-[var(--gm-text-3)]">
                        只读参考{content.phases.length ? ` · ${content.phases.length} 个环节` : ""}
                        {minutes ? ` · ${minutes} 分钟` : ""}
                    </span>
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-[var(--gm-text-3)] transition-transform", open && "rotate-180")} />
            </button>
            {open ? (
                <div className="flex flex-col gap-3 border-t border-[var(--gm-accent-ring)] px-3.5 pt-3 pb-3.5">
                    {content.objectives.length ? (
                        <Item title="教学目标">
                            <ol className={cn(TEXT, "list-decimal pl-4")}>
                                {content.objectives.map((objective, index) => (
                                    <li key={index}>{objective}</li>
                                ))}
                            </ol>
                        </Item>
                    ) : null}
                    <TextItem title="教学重点" value={content.keyPoints} />
                    <TextItem title="教学难点" value={content.difficulties} />
                    <TextItem title="课前准备" value={content.preparation} />
                    {content.phases.length ? (
                        <Item title="教学环节">
                            <PhaseTimeline phases={content.phases} />
                            <ol className="mt-1 flex flex-col gap-2">
                                {content.phases.map((phase, index) => (
                                    <li key={phase.id} className="rounded-[10px] bg-[var(--gm-bg-elevated)] p-2.5 ring-1 ring-[var(--gm-border)]">
                                        <p className="text-[12.5px] font-medium">
                                            {index + 1}. {phase.name || `环节 ${index + 1}`}
                                            <span className="ml-1.5 font-normal text-[var(--gm-text-3)] tabular-nums">{phase.minutes} 分钟</span>
                                        </p>
                                        {phase.teacher ? <p className={cn(TEXT, "mt-1")}>教师：{phase.teacher}</p> : null}
                                        {phase.student ? <p className={cn(TEXT, "mt-1")}>学生：{phase.student}</p> : null}
                                        {phase.notes ? <p className={cn(TEXT, "mt-1 text-[var(--gm-text-3)]")}>要点：{phase.notes}</p> : null}
                                    </li>
                                ))}
                            </ol>
                        </Item>
                    ) : null}
                    <TextItem title="课后作业" value={content.homework} />
                </div>
            ) : null}
        </section>
    );
}
