"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";

import type { PrepLesson } from "@/app/(user)/teaching/teaching-routes";
import { cn } from "@/lib/utils";

/** 左栏课程大纲：按章分组，每课一行；已备打勾，当前课时高亮（样式同 /bluegamma/courses 的 CourseOutline） */
export function PrepOutline({ lessons, lessonId, prepared, onPick }: { lessons: readonly PrepLesson[]; lessonId: string; prepared: readonly string[]; onPick: (lessonId: string) => void }) {
    const reduce = useReducedMotion();
    const chapters = lessons.reduce<{ id: string; title: string; lessons: PrepLesson[] }[]>((groups, lesson) => {
        const last = groups.at(-1);
        if (last?.id === lesson.chapter.id) return [...groups.slice(0, -1), { ...last, lessons: [...last.lessons, lesson] }];
        return [...groups, { id: lesson.chapter.id, title: lesson.chapter.title, lessons: [lesson] }];
    }, []);

    return (
        <nav aria-label="课程大纲" className="flex flex-col gap-3">
            {chapters.map((chapter, chapterIndex) => (
                <section key={chapter.id} className="flex flex-col gap-1">
                    <h3 className="truncate px-2 text-[11px] font-medium text-[var(--gm-text-3)]">
                        第 {chapterIndex + 1} 章 · {chapter.title}
                    </h3>
                    {chapter.lessons.map((lesson) => {
                        const active = lesson.id === lessonId;
                        const done = prepared.includes(lesson.id);
                        return (
                            <button
                                key={lesson.id}
                                type="button"
                                onClick={() => onPick(lesson.id)}
                                aria-current={active ? "true" : undefined}
                                className={cn("relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors", active ? "text-[var(--gm-text)]" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)]")}
                            >
                                {active ? (
                                    <motion.span
                                        layoutId="teaching-outline-active"
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
                                    {done ? <Check className="size-3" /> : lesson.number}
                                </span>
                                <span className="relative flex min-w-0 flex-1 flex-col leading-tight">
                                    <span className="truncate text-[13px] font-medium">{lesson.title}</span>
                                    <span className="truncate text-[11px] text-[var(--gm-text-3)]">{lesson.materials.length ? `${lesson.materials.length} 份资料` : "暂无资料"}</span>
                                </span>
                            </button>
                        );
                    })}
                    {!chapter.lessons.length ? <p className="px-3 py-2 text-xs text-[var(--gm-text-3)]">本章暂无课时</p> : null}
                </section>
            ))}
        </nav>
    );
}
