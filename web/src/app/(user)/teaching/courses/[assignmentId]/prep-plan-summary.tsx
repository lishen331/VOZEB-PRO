"use client";

import Link from "next/link";
import { ArrowRight, NotebookPen } from "lucide-react";

import { lessonPlanTotalMinutes, type LessonPlanContent } from "@/lib/teaching-lesson-plan";
import type { PlanDoc, PlanLoad, SaveState } from "./use-lesson-plan";

/*
 * L2 右栏的「教案」标签：只放概要 + 入口。
 * 完整的教案编辑搬到了 L3 /teaching/courses/<assignmentId>/plan/<lessonId>（全屏），
 * 这里保持在 360px 栏里能看懂的摘要，不重复放编辑器。
 */

function savedLabel(state: SaveState, dirty: boolean) {
    if (state === "saving") return "正在保存…";
    if (state === "error") return "保存失败";
    if (state === "conflict") return "有冲突";
    if (dirty) return "有未保存修改";
    return "已保存";
}

function statOf(content: LessonPlanContent) {
    return {
        minutes: lessonPlanTotalMinutes(content),
        objectives: content.objectives.filter((item) => item.trim()).length,
        phases: content.phases.length,
    };
}

export function PlanSummaryCard({ doc, load, dirty, saveState, href }: { doc: PlanDoc | null; load: PlanLoad; dirty: boolean; saveState: SaveState; href: string }) {
    if (load.phase === "error") {
        return (
            <div className="flex flex-col gap-2 text-xs">
                <p className="text-[var(--gm-danger)]">{load.message}</p>
                <Link href={href} className="text-[var(--gm-accent)] underline-offset-2 hover:underline">
                    去教案页重试
                </Link>
            </div>
        );
    }
    if (load.phase === "loading" || !doc) {
        return (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="正在加载教案">
                {[0, 1, 2].map((item) => (
                    <span key={item} className="h-10 animate-pulse rounded-[10px] bg-[var(--gm-wash-strong)]" />
                ))}
            </div>
        );
    }

    const stats = statOf(doc.content);
    const isStarter = doc.isStarter && !dirty;

    return (
        <div className="flex flex-col gap-3">
            <section className="rounded-[12px] bg-[var(--gm-wash)] p-3">
                <div className="flex items-baseline justify-between gap-2">
                    <h4 className="flex items-center gap-1.5 text-xs font-medium text-[var(--gm-text-2)]">
                        <NotebookPen className="size-3.5" />
                        教案
                    </h4>
                    <span className="text-[11px] text-[var(--gm-text-3)]">{savedLabel(saveState, dirty)}</span>
                </div>
                {isStarter ? (
                    <p className="mt-2 text-[12px] leading-relaxed text-[var(--gm-text-3)]">还没有写教案。打开教案页，从空白或课程方的标准教案开始。</p>
                ) : (
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                        {[
                            { label: "教学目标", value: stats.objectives, unit: "条" },
                            { label: "教学环节", value: stats.phases, unit: "个" },
                            { label: "计划时长", value: stats.minutes, unit: "分钟" },
                        ].map((item) => (
                            <div key={item.label} className="rounded-[10px] bg-[var(--gm-surface)] px-2 py-1.5 ring-1 ring-[var(--gm-border)]">
                                <dt className="text-[10px] text-[var(--gm-text-3)]">{item.label}</dt>
                                <dd className="mt-0.5 text-base font-semibold tabular-nums">
                                    {item.value}
                                    <span className="ml-0.5 text-[10px] font-normal text-[var(--gm-text-3)]">{item.unit}</span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
                {doc.lastRehearsal ? (
                    <p className="mt-2 text-[11px] tabular-nums text-[var(--gm-text-3)]">
                        上次试讲 {Math.floor(doc.lastRehearsal.totalSeconds / 60)} 分 {doc.lastRehearsal.totalSeconds % 60} 秒 · 共 {doc.rehearsalCount} 次
                    </p>
                ) : null}
            </section>
            <Link
                href={href}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--gm-radius-sm)] bg-[image:var(--gm-gradient)] px-3.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent-ring)]"
            >
                {isStarter ? "开始写教案" : "打开教案"}
                <ArrowRight className="size-4" />
            </Link>
            <p className="text-[11px] leading-relaxed text-[var(--gm-text-3)]">教案在独立页面里写，空间更大；返回后这里的概要会同步更新。</p>
        </div>
    );
}
