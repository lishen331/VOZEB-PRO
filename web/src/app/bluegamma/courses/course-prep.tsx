"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, FileText, Film, ListChecks, MessageSquareText, Paperclip, Presentation } from "lucide-react";

import { GM_EASE } from "@/components/gamma-ui/gamma-motion";
import type { Course, Lesson } from "@/app/bluegamma/courses/course-data";
import { CourseSlide } from "@/app/bluegamma/courses/course-slide";
import { cn } from "@/lib/utils";

type PanelTab = "plan" | "notes" | "task" | "files";
const PANEL_TABS: readonly { key: PanelTab; label: string; icon: typeof FileText }[] = [
    { key: "plan", label: "教案", icon: FileText },
    { key: "notes", label: "讲解备注", icon: MessageSquareText },
    { key: "task", label: "任务单", icon: ListChecks },
    { key: "files", label: "资源", icon: Paperclip },
];

/** 左侧课程大纲：每节课一行，已备的打勾，当前高亮 */
export function CourseOutline({ course, lessonKey, prepared, onPick }: { course: Course; lessonKey: string; prepared: readonly string[]; onPick: (key: string) => void }) {
    const reduce = useReducedMotion();
    return (
        <nav aria-label="课程大纲" className="flex flex-col gap-1">
            {course.lessons.map((lesson) => {
                const active = lesson.key === lessonKey;
                const done = prepared.includes(lesson.key);
                return (
                    <button
                        key={lesson.key}
                        type="button"
                        onClick={() => onPick(lesson.key)}
                        aria-current={active ? "true" : undefined}
                        className={cn("relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors", active ? "text-[var(--gm-text)]" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)]")}
                    >
                        {active ? (
                            <motion.span
                                layoutId="course-outline-active"
                                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                                className="absolute inset-0 rounded-[12px] bg-[var(--gm-accent-soft)] ring-1 ring-[var(--gm-accent-ring)]"
                            />
                        ) : null}
                        <span
                            className={cn(
                                "relative grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px]",
                                done ? "bg-[var(--gm-success)] text-white" : active ? "bg-[var(--gm-blue)] text-white" : "bg-[var(--gm-wash-strong)] text-[var(--gm-text-3)]",
                            )}
                        >
                            {done ? <Check className="size-3" /> : lesson.index + 1}
                        </span>
                        <span className="relative flex min-w-0 flex-1 flex-col leading-tight">
                            <span className="truncate text-[13px] font-medium">{lesson.title}</span>
                            <span className="truncate text-[11px] text-[var(--gm-text-3)]">
                                {lesson.slides.length} 页课件 · 视频 {lesson.videoMinutes} 分钟
                            </span>
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}

/** 中间：课件预览（大图 + 缩略图条），左右键翻页 */
export function SlideViewer({ course, lesson, page, onPage, onPresent }: { course: Course; lesson: Lesson; page: number; onPage: (page: number) => void; onPresent: () => void }) {
    const reduce = useReducedMotion();
    const total = lesson.slides.length;
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if ((event.target as HTMLElement).closest("input,textarea")) return;
            if (event.key === "ArrowRight") onPage(Math.min(total - 1, page + 1));
            if (event.key === "ArrowLeft") onPage(Math.max(0, page - 1));
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [onPage, page, total]);

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="group relative overflow-hidden rounded-[var(--gm-radius-xl)] shadow-[var(--gm-shadow)] ring-1 ring-[var(--gm-border-strong)]">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={`${lesson.key}-${page}`} initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -16 }} transition={{ duration: 0.25, ease: GM_EASE }}>
                        <CourseSlide course={course} lesson={lesson} slide={lesson.slides[page]} page={page + 1} />
                    </motion.div>
                </AnimatePresence>
                {[
                    { side: "left-3", icon: ChevronLeft, label: "上一页", to: page - 1 },
                    { side: "right-3", icon: ChevronRight, label: "下一页", to: page + 1 },
                ].map((item) =>
                    item.to >= 0 && item.to < total ? (
                        <button
                            key={item.label}
                            type="button"
                            aria-label={item.label}
                            onClick={() => onPage(item.to)}
                            className={cn("gm-glass absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-[var(--gm-text)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100", item.side)}
                        >
                            <item.icon className="size-5" />
                        </button>
                    ) : null,
                )}
                <button
                    type="button"
                    onClick={onPresent}
                    className="gm-glass absolute top-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                    <Presentation className="size-3.5" />
                    放映
                </button>
            </div>
            <ol className="gm-scroll flex gap-2 overflow-x-auto pb-1" aria-label="课件页">
                {lesson.slides.map((slide, index) => (
                    <li key={`${lesson.key}-${slide.kind}`} className="w-[132px] shrink-0">
                        <button
                            type="button"
                            onClick={() => onPage(index)}
                            aria-label={`第 ${index + 1} 页：${slide.title}`}
                            aria-current={index === page ? "true" : undefined}
                            className={cn("block w-full overflow-hidden rounded-[10px] ring-2 transition-[box-shadow,opacity]", index === page ? "ring-[var(--gm-accent)]" : "opacity-70 ring-transparent hover:opacity-100")}
                        >
                            <CourseSlide course={course} lesson={lesson} slide={slide} page={index + 1} />
                        </button>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-[var(--gm-text-3)]">{title}</h4>
            {children}
        </section>
    );
}

function PlanPanel({ lesson }: { lesson: Lesson }) {
    const total = lesson.phases.reduce((sum, phase) => sum + phase.minutes, 0);
    return (
        <div className="flex flex-col gap-5">
            <Block title="教学目标">
                <ol className="flex flex-col gap-1.5 text-[13px] leading-relaxed">
                    {lesson.objectives.map((item, index) => (
                        <li key={item} className="flex gap-2">
                            <span className="font-mono text-[var(--gm-accent)]">{index + 1}.</span>
                            {item}
                        </li>
                    ))}
                </ol>
            </Block>
            <Block title="重点 / 难点">
                <p className="rounded-[10px] bg-[var(--gm-wash)] px-3 py-2 text-[13px] leading-relaxed">
                    <span className="mr-1.5 rounded bg-[var(--gm-accent-soft)] px-1.5 py-0.5 text-[11px] text-[var(--gm-accent)]">重点</span>
                    {lesson.keyPoints[0]}
                </p>
                <p className="rounded-[10px] bg-[var(--gm-wash)] px-3 py-2 text-[13px] leading-relaxed">
                    <span className="mr-1.5 rounded bg-[color-mix(in_srgb,var(--gm-warning)_10%,transparent)] px-1.5 py-0.5 text-[11px] text-[var(--gm-warning)]">难点</span>
                    {lesson.difficulty}
                </p>
            </Block>
            <Block title={`教学过程 · ${total} 分钟`}>
                {/* 时间轴：每段宽度按分钟数分配 */}
                <div className="flex h-2 overflow-hidden rounded-full">
                    {lesson.phases.map((phase, index) => (
                        <span key={phase.name} className="h-full" style={{ width: `${(phase.minutes / total) * 100}%`, background: `color-mix(in srgb, var(--gm-blue) ${100 - index * 16}%, var(--gm-cyan))` }} />
                    ))}
                </div>
                <ol className="mt-1 flex flex-col">
                    {lesson.phases.map((phase) => (
                        <li key={phase.name} className="flex gap-3 border-b border-[var(--gm-border)] py-2.5 last:border-0">
                            <span className="w-12 shrink-0 text-[13px] font-medium">{phase.name}</span>
                            <span className="flex-1 text-[13px] leading-relaxed text-[var(--gm-text-2)]">{phase.content}</span>
                            <span className="shrink-0 font-mono text-xs text-[var(--gm-text-3)]">{phase.minutes}′</span>
                        </li>
                    ))}
                </ol>
            </Block>
        </div>
    );
}

function NotesPanel({ lesson, page, onPage }: { lesson: Lesson; page: number; onPage: (page: number) => void }) {
    return (
        <ol className="flex flex-col gap-2">
            {lesson.slides.map((slide, index) => (
                <li key={slide.kind}>
                    <button
                        type="button"
                        onClick={() => onPage(index)}
                        className={cn("flex w-full gap-3 rounded-[12px] p-3 text-left ring-1 transition-colors", index === page ? "bg-[var(--gm-accent-soft)] ring-[var(--gm-accent-ring)]" : "ring-[var(--gm-border)] hover:bg-[var(--gm-wash)]")}
                    >
                        <span className="font-mono text-xs text-[var(--gm-text-3)]">P{index + 1}</span>
                        <span className="flex flex-col gap-0.5">
                            <span className="text-[13px] font-medium">{slide.title}</span>
                            <span className="text-xs leading-relaxed text-[var(--gm-text-2)]">{slide.note}</span>
                        </span>
                    </button>
                </li>
            ))}
        </ol>
    );
}

function TaskPanel({ lesson }: { lesson: Lesson }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-[14px] bg-[var(--gm-wash)] p-4 ring-1 ring-[var(--gm-border)]">
                <p className="text-xs text-[var(--gm-text-3)]">学生任务单 · 第 {lesson.index + 1} 课</p>
                <ul className="mt-2 flex flex-col gap-2 text-[13px] leading-relaxed">
                    {lesson.task.map((item) => (
                        <li key={item} className="flex gap-2">
                            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--gm-accent)]" />
                            {item}
                        </li>
                    ))}
                </ul>
            </div>
            <Block title="评分建议">
                {[
                    ["切题", 30],
                    ["完成度", 30],
                    ["设计说明", 20],
                    ["过程记录", 20],
                ].map(([name, score]) => (
                    <div key={name} className="flex items-center gap-3 text-[13px]">
                        <span className="w-16">{name}</span>
                        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--gm-wash-strong)]">
                            <span className="absolute inset-y-0 left-0 rounded-full bg-[image:var(--gm-gradient)]" style={{ width: `${score}%` }} />
                        </span>
                        <span className="w-8 text-right font-mono text-xs text-[var(--gm-text-3)]">{score}</span>
                    </div>
                ))}
            </Block>
        </div>
    );
}

function FilesPanel({ lesson }: { lesson: Lesson }) {
    const files = [
        { icon: Presentation, name: `${lesson.title} · 课件`, meta: `${lesson.slides.length} 页 · PPTX` },
        { icon: Film, name: `${lesson.title} · 示范视频`, meta: `${lesson.videoMinutes} 分钟 · MP4` },
        { icon: FileText, name: `${lesson.title} · 教案`, meta: "DOCX" },
        { icon: ListChecks, name: `${lesson.title} · 任务单`, meta: "PDF" },
    ];
    return (
        <ul className="flex flex-col gap-2">
            {files.map((file) => (
                <li key={file.name} className="flex items-center gap-3 rounded-[12px] p-3 ring-1 ring-[var(--gm-border)]">
                    <span className="grid size-9 place-items-center rounded-[10px] bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]">
                        <file.icon className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="truncate text-[13px]">{file.name}</span>
                        <span className="text-[11px] text-[var(--gm-text-3)]">{file.meta}</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}

/** 右侧：教案 / 讲解备注 / 任务单 / 资源 */
export function PrepPanel({ lesson, page, onPage }: { lesson: Lesson; page: number; onPage: (page: number) => void }) {
    const [tab, setTab] = useState<PanelTab>("plan");
    const reduce = useReducedMotion();
    return (
        <div className="flex min-h-0 flex-col">
            <div role="tablist" aria-label="备课资料" className="flex gap-1 border-b border-[var(--gm-border)] px-4">
                {PANEL_TABS.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        role="tab"
                        aria-selected={tab === item.key}
                        onClick={() => setTab(item.key)}
                        className={cn("relative inline-flex h-11 items-center gap-1.5 px-2.5 text-[13px] transition-colors", tab === item.key ? "text-[var(--gm-text)]" : "text-[var(--gm-text-3)] hover:text-[var(--gm-text-2)]")}
                    >
                        <item.icon className="size-3.5" />
                        {item.label}
                        {tab === item.key ? (
                            <motion.span layoutId="prep-tab-line" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38 }} className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-[image:var(--gm-gradient)]" />
                        ) : null}
                    </button>
                ))}
            </div>
            <div className="gm-scroll min-h-0 flex-1 overflow-y-auto p-4">
                {tab === "plan" ? <PlanPanel lesson={lesson} /> : tab === "notes" ? <NotesPanel lesson={lesson} page={page} onPage={onPage} /> : tab === "task" ? <TaskPanel lesson={lesson} /> : <FilesPanel lesson={lesson} />}
            </div>
        </div>
    );
}
