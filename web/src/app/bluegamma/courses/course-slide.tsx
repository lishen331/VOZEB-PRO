"use client";

import type { ReactNode } from "react";
import { Check, Clock3, Lightbulb, Target } from "lucide-react";

import { CourseCover } from "@/app/bluegamma/courses/course-cover";
import type { Course, Lesson, Slide } from "@/app/bluegamma/courses/course-data";
import { cn } from "@/lib/utils";

/*
 * 课件单页：固定 16:9，所有尺寸用容器宽度单位（cqw），所以同一个组件既能当缩略图也能全屏放映。
 * 版式按页面类型（封面 / 目标 / 流程定位 / 要点 / 示范提示词 / 练习 / 小结）区分。
 */

function Frame({ children, className, dark = false }: { children: ReactNode; className?: string; dark?: boolean }) {
    return <div className={cn("@container relative aspect-video w-full overflow-hidden select-none", dark ? "bg-[#060a18] text-white" : "bg-[#f6f8fc] text-[#0b1020]", className)}>{children}</div>;
}

/** 页脚：课程名 + 页码，每页一致 */
function Footer({ course, lesson, page, total, dark = false }: { course: Course; lesson: Lesson; page: number; total: number; dark?: boolean }) {
    return (
        <div className={cn("absolute inset-x-[5cqw] bottom-[3cqw] flex items-center justify-between text-[1.3cqw]", dark ? "text-white/50" : "text-[#0b1020]/45")}>
            <span>
                {course.subject.name} · 第 {lesson.index + 1} 课 {lesson.title}
            </span>
            <span className="font-mono">
                {String(page).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
        </div>
    );
}

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
    return (
        <div className="flex flex-col gap-[0.8cqw]">
            <span className="font-mono text-[1.3cqw] tracking-[0.2em] text-[#0050f5] uppercase">{eyebrow}</span>
            <h2 className="text-[3.6cqw] leading-tight font-bold">{title}</h2>
        </div>
    );
}

function Bullets({ items, icon = "dot" }: { items: readonly string[]; icon?: "dot" | "check" | "num" }) {
    return (
        <ul className="flex flex-col gap-[1.6cqw]">
            {items.map((item, index) => (
                <li key={item} className="flex items-start gap-[1.4cqw] text-[2cqw] leading-snug">
                    <span className="mt-[0.3cqw] grid size-[2.6cqw] shrink-0 place-items-center rounded-full bg-[#0050f5] text-[1.3cqw] font-bold text-white">
                        {icon === "check" ? <Check className="size-[1.6cqw]" /> : icon === "num" ? index + 1 : <span className="size-[0.8cqw] rounded-full bg-white" />}
                    </span>
                    {item}
                </li>
            ))}
        </ul>
    );
}

export function CourseSlide({ course, lesson, slide, page, className }: { course: Course; lesson: Lesson; slide: Slide; page: number; className?: string }) {
    const total = lesson.slides.length;
    const footer = (dark = false) => <Footer course={course} lesson={lesson} page={page} total={total} dark={dark} />;

    if (slide.kind === "cover") {
        return (
            <Frame dark className={className}>
                <span className="absolute inset-y-0 right-0 w-[58%] [mask-image:linear-gradient(90deg,transparent,#000_45%)]">
                    <CourseCover subject={course.subject} iconScale={1.2} />
                </span>
                <div className="absolute inset-0 bg-[radial-gradient(70%_90%_at_0%_100%,rgba(0,80,245,0.55),transparent_60%)]" />
                <div className="absolute inset-y-0 left-[6cqw] flex w-[52%] flex-col justify-center gap-[1.6cqw]">
                    <span className="font-mono text-[1.4cqw] tracking-[0.24em] text-[#28ebfa]">LESSON {String(lesson.index + 1).padStart(2, "0")}</span>
                    <h1 className="text-[6cqw] leading-[1.05] font-bold">{lesson.title}</h1>
                    <p className="text-[1.9cqw] text-white/70">{course.title}</p>
                    <div className="mt-[1cqw] flex gap-[1cqw] text-[1.4cqw]">
                        <span className="rounded-full bg-white/15 px-[1.4cqw] py-[0.5cqw]">90 分钟</span>
                        <span className="rounded-full bg-white/15 px-[1.4cqw] py-[0.5cqw]">{course.grade}</span>
                    </div>
                </div>
                {footer(true)}
            </Frame>
        );
    }

    if (slide.kind === "position") {
        return (
            <Frame className={className}>
                <div className="absolute inset-x-[6cqw] top-[6cqw]">
                    <Heading eyebrow="Where we are" title={slide.title} />
                </div>
                <ol className="absolute inset-x-[6cqw] top-[48%] flex -translate-y-1/2 items-center">
                    {course.lessons.map((item, index) => {
                        const current = item.key === lesson.key;
                        const done = index < lesson.index;
                        return (
                            <li key={item.key} className="flex flex-1 items-center last:flex-none">
                                <span className="flex flex-col items-center gap-[1cqw]">
                                    <span
                                        className={cn(
                                            "grid size-[5cqw] place-items-center rounded-full text-[1.8cqw] font-bold",
                                            current ? "bg-[#0050f5] text-white shadow-[0_0_0_1cqw_rgba(0,80,245,0.15)]" : done ? "bg-[#0b1020] text-white" : "bg-white text-[#0b1020]/40 ring-1 ring-[#0b1020]/10",
                                        )}
                                    >
                                        {done ? <Check className="size-[2.2cqw]" /> : index + 1}
                                    </span>
                                    <span className={cn("w-[10cqw] text-center text-[1.4cqw]", current ? "font-bold text-[#0050f5]" : "text-[#0b1020]/60")}>{item.title}</span>
                                </span>
                                {index < course.lessons.length - 1 ? <span className={cn("mx-[0.6cqw] mb-[3.6cqw] h-[0.3cqw] flex-1 rounded-full", done ? "bg-[#0b1020]" : "bg-[#0b1020]/10")} /> : null}
                            </li>
                        );
                    })}
                </ol>
                <p className="absolute inset-x-[6cqw] bottom-[9cqw] text-[1.8cqw] text-[#0b1020]/60">最终交付：{course.deliverable}</p>
                {footer()}
            </Frame>
        );
    }

    if (slide.kind === "prompt") {
        return (
            <Frame dark className={className}>
                <div className="absolute inset-x-[6cqw] top-[6cqw] [&_h2]:text-white">
                    <Heading eyebrow="Demo prompt" title={slide.title} />
                </div>
                <div className="absolute inset-x-[6cqw] top-[24cqw] rounded-[1.6cqw] bg-white/[0.06] p-[2.4cqw] ring-1 ring-white/10">
                    <div className="mb-[1.4cqw] flex gap-[0.7cqw]">
                        {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
                            <span key={color} className="size-[1cqw] rounded-full" style={{ background: color }} />
                        ))}
                    </div>
                    <p className="font-mono text-[1.75cqw] leading-relaxed text-[#9fe9ff]">{slide.code}</p>
                </div>
                <div className="absolute inset-x-[6cqw] bottom-[8cqw] flex flex-wrap gap-[1cqw] text-[1.4cqw]">
                    <span className="text-white/50">可选模板：</span>
                    {slide.bullets?.map((item) => (
                        <span key={item} className="rounded-full bg-[#0050f5]/40 px-[1.2cqw] py-[0.3cqw]">
                            {item}
                        </span>
                    ))}
                </div>
                {footer(true)}
            </Frame>
        );
    }

    const eyebrow = { goals: "Objectives", concept: "Key points", practice: "Practice", summary: "Wrap up" }[slide.kind as "goals" | "concept" | "practice" | "summary"];
    const Icon = slide.kind === "practice" ? Clock3 : slide.kind === "concept" ? Lightbulb : Target;
    return (
        <Frame className={className}>
            <div aria-hidden className="absolute -top-[10cqw] -right-[10cqw] size-[36cqw] rounded-full bg-[radial-gradient(circle,rgba(40,235,250,0.25),transparent_65%)]" />
            <div className="absolute inset-x-[6cqw] top-[6cqw] flex items-start justify-between">
                <Heading eyebrow={eyebrow} title={slide.title} />
                <span className="grid size-[6cqw] place-items-center rounded-[1.6cqw] bg-white text-[#0050f5] shadow-[0_1cqw_3cqw_rgba(0,30,90,0.08)]">
                    <Icon className="size-[3cqw]" />
                </span>
            </div>
            <div className="absolute inset-x-[6cqw] top-[24cqw]">
                <Bullets items={slide.bullets ?? []} icon={slide.kind === "goals" ? "num" : slide.kind === "summary" ? "check" : "dot"} />
            </div>
            {footer()}
        </Frame>
    );
}
