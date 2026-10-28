"use client";

import { ChevronLeft, Clock3, FileText, Layers, Lock, Target } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { CourseCover } from "@/app/bluegamma/courses/course-cover";
import type { Course } from "@/app/bluegamma/courses/course-data";
import { cn } from "@/lib/utils";

/*
 * 课程详情页：课程大厅点进来的第一屏。
 * 只看介绍、大纲、产出物；备课入口在这里按一下才进去，锁定课程直接禁用按钮。
 */

/** 锁定规则先按 official 字段复用：校本课程(非官方)按锁定付费展示，官方课程免费公开。
 *  后续加真实付费字段后，这里换成读那个字段即可，调用方不用改。 */
function isLocked(course: Course) {
    return !course.official;
}

export function CourseDetail({ course, prepared, onBack, onPrep }: { course: Course; prepared: readonly string[]; onBack: () => void; onPrep: (lessonKey?: string) => void }) {
    const locked = isLocked(course);
    const Icon = course.subject.icon;

    return (
        <main className="gm-scroll relative min-w-0 flex-1 overflow-y-auto px-6 pt-6 pb-16">
            <button type="button" onClick={onBack} className="mb-4 inline-flex h-8 items-center gap-1 rounded-full pr-3 pl-1.5 text-[13px] text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]">
                <ChevronLeft className="size-4" />
                返回课程大厅
            </button>

            {/* 封面头：标题 + 简介 + 锁定态/开始备课按钮 */}
            <section className="relative mb-6 overflow-hidden rounded-[var(--gm-radius-xl)] ring-1 ring-[var(--gm-border)]">
                <div className="absolute inset-0">
                    <CourseCover subject={course.subject} />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                </div>
                <div className="relative flex flex-col gap-4 p-6 text-white md:flex-row md:items-end md:justify-between">
                    <div className="min-w-0">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] backdrop-blur">
                            <Icon className="size-3.5" />
                            {course.subject.name}
                        </span>
                        <h1 className="mt-3 text-2xl font-semibold">{course.title}</h1>
                        <p className="mt-1 max-w-xl text-sm text-white/80">{course.subtitle}</p>
                        <span className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/70">
                            <span className="inline-flex items-center gap-1">
                                <Layers className="size-3.5" />
                                {course.lessons.length} 课
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Clock3 className="size-3.5" />
                                {course.hours} 课时
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Target className="size-3.5" />
                                {course.grade}
                            </span>
                        </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {locked ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/90 backdrop-blur">
                                <Lock className="size-3.5" />
                                付费课程 · 解锁后可备课
                            </span>
                        ) : null}
                        <GammaButton shine={!locked} disabled={locked} onClick={() => onPrep()}>
                            {locked ? "解锁后备课" : prepared.length > 0 ? "继续备课" : "开始备课"}
                        </GammaButton>
                    </div>
                </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
                <section className="flex flex-col gap-4">
                    <div className="rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                        <h2 className="text-sm font-semibold">课程介绍</h2>
                        <p className="mt-2 text-sm text-[var(--gm-text-2)]">{course.brief}</p>
                    </div>

                    <div className="rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                        <h2 className="mb-3 text-sm font-semibold">
                            课节大纲 · {prepared.length}/{course.lessons.length} 已备
                        </h2>
                        <ol className="flex flex-col gap-2">
                            {course.lessons.map((lesson) => {
                                const done = prepared.includes(lesson.key);
                                return (
                                    <li key={lesson.key}>
                                        <button
                                            type="button"
                                            disabled={locked}
                                            onClick={() => onPrep(lesson.key)}
                                            className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--gm-wash)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                                        >
                                            <span className={cn("grid size-7 shrink-0 place-items-center rounded-full font-mono text-[11px]", done ? "bg-[var(--gm-success)] text-white" : "bg-[var(--gm-wash-strong)] text-[var(--gm-text-3)]")}>
                                                {lesson.index + 1}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13px] font-medium">{lesson.title}</span>
                                                <span className="block truncate text-xs text-[var(--gm-text-3)]">{lesson.goal}</span>
                                            </span>
                                            <span className="shrink-0 text-xs text-[var(--gm-text-3)]">{lesson.videoMinutes} 分钟</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                </section>

                <aside className="flex flex-col gap-4">
                    <div className="rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                        <h2 className="text-sm font-semibold">课程产出物</h2>
                        <p className="mt-2 text-sm text-[var(--gm-text-2)]">{course.deliverable}</p>
                        <div className="mt-3">
                            <GammaBadge tone={course.official ? "blue" : "neutral"}>{course.official ? "官方课程" : "校本课程"}</GammaBadge>
                        </div>
                    </div>
                    <div className="rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
                        <h2 className="text-sm font-semibold">课件与资料</h2>
                        <p className="mt-1 text-xs text-[var(--gm-text-3)]">每节课的课件、教案、任务单，在备课页里按课节下载</p>
                        <GammaButton className="mt-3 w-full" variant="outline" size="sm" disabled={locked} icon={<FileText className="size-4" />} onClick={() => onPrep()}>
                            进入备课查看课件
                        </GammaButton>
                    </div>
                </aside>
            </div>
        </main>
    );
}
