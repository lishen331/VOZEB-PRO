"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { BookOpen, Layers, Paperclip, Search, Users } from "lucide-react";

import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import { GM_EASE } from "@/components/gamma-ui/gamma-motion";
import type { SchoolCourseAssignment, SchoolCourseOffering } from "@/lib/school-domain";
import { cn } from "@/lib/utils";
import { TeachingCourseCover } from "./teaching-course-cover";
import { teachingCourseHref } from "./teaching-routes";

/*
 * 教学中心 · 备课（L1 默认标签）：版式复用预览页 /bluegamma/courses 的课程中心——
 * 顶部欢迎 + 数据 + 「继续备课」，下方搜索 + 课程卡网格；点卡片进入 L2 备课页。
 */

type Scope = "all" | "mine";
const SCOPES: readonly { key: Scope; label: string }[] = [
    { key: "all", label: "全部课程" },
    { key: "mine", label: "我备过的" },
];

function CourseCard({ item, index, classes, prepared }: { item: SchoolCourseAssignment; index: number; classes: readonly string[]; prepared: number }) {
    const reduce = useReducedMotion();
    const { course } = item;
    const lessonCount = Math.max(course.lessonCount, 0);
    return (
        <motion.li initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: GM_EASE, delay: Math.min(index, 8) * 0.03 }}>
            <Link
                href={teachingCourseHref(item.id)}
                className="group flex h-full flex-col overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] text-[var(--gm-text)] ring-1 ring-[var(--gm-border)] transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-accent-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
            >
                <span className="relative block aspect-[16/9] overflow-hidden">
                    <TeachingCourseCover seed={course.id} coverUrl={course.coverUrl} className="transition-transform duration-700 group-hover:scale-105" />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    {course.category ? <span className="absolute top-3 left-3 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur">{course.category}</span> : null}
                    {classes.length ? (
                        <span className="absolute right-3 bottom-3 left-3 flex items-center gap-1.5 truncate text-xs text-white">
                            <Users className="size-3.5 shrink-0" />
                            <span className="truncate">{classes.join("、")}</span>
                        </span>
                    ) : null}
                </span>
                <span className="flex flex-1 flex-col gap-2 p-4">
                    <span className="line-clamp-1 text-[15px] font-semibold">{course.title}</span>
                    <span className="line-clamp-2 min-h-[2.5em] text-xs leading-relaxed text-[var(--gm-text-3)]">{course.summary || "暂无课程简介"}</span>
                    <span className="mt-auto flex items-center gap-3 pt-1 text-xs text-[var(--gm-text-2)]">
                        <span className="inline-flex items-center gap-1">
                            <Layers className="size-3.5" />
                            {course.chapterCount} 章 · {course.lessonCount} 课时
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Paperclip className="size-3.5" />
                            {course.materialCount} 份资料
                        </span>
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-[var(--gm-wash-strong)]">
                            <span className="absolute inset-y-0 left-0 rounded-full bg-[image:var(--gm-gradient)]" style={{ width: `${lessonCount ? Math.min(100, (prepared / lessonCount) * 100) : 0}%` }} />
                        </span>
                        <span className="text-[11px] text-[var(--gm-text-3)] tabular-nums">
                            已备 {prepared}/{lessonCount}
                        </span>
                    </span>
                </span>
            </Link>
        </motion.li>
    );
}
export interface TeachingPrepBoardProps {
    teacherName: string;
    schoolName?: string;
    courses: readonly SchoolCourseAssignment[];
    offerings: readonly SchoolCourseOffering[];
    prepared: Record<string, readonly string[]>;
    loading: boolean;
}

/** 当前时段问候语 */
function greeting() {
    const hour = new Date().getHours();
    return hour < 11 ? "上午好" : hour < 13 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
}

export function TeachingPrepBoard({ teacherName, schoolName, courses, offerings, prepared, loading }: TeachingPrepBoardProps) {
    const [scope, setScope] = useState<Scope>("all");
    const [query, setQuery] = useState("");
    const classesByAssignment = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const offering of offerings) {
            if (offering.status !== "active") continue;
            map.set(offering.assignmentId, [...(map.get(offering.assignmentId) ?? []), offering.className]);
        }
        return map;
    }, [offerings]);
    const preparedCount = (item: SchoolCourseAssignment) => prepared[item.id]?.length ?? 0;
    const visible = courses.filter((item) => {
        if (scope === "mine" && !preparedCount(item)) return false;
        const keyword = query.trim();
        return !keyword || `${item.course.title}${item.course.summary}${item.course.category ?? ""}`.includes(keyword);
    });
    const resume = courses.find((item) => preparedCount(item) > 0 && preparedCount(item) < item.course.lessonCount) ?? courses.find((item) => classesByAssignment.has(item.id)) ?? courses[0];
    const totalLessons = courses.reduce((sum, item) => sum + item.course.lessonCount, 0);
    const totalPrepared = courses.reduce((sum, item) => sum + preparedCount(item), 0);

    return (
        <div className="flex flex-col gap-6">
            {/* 欢迎条：左边问候 + 数据，右边「继续备课」 */}
            <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
                <div className="relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-6 ring-1 ring-[var(--gm-border)]">
                    <div aria-hidden className="gm-aurora pointer-events-none absolute -top-16 right-10 size-56 rounded-full bg-[var(--gm-blue)] opacity-25 blur-3xl" />
                    <p className="relative text-xs text-[var(--gm-text-3)]">{schoolName || "学校课程"}</p>
                    <h2 className="relative mt-1 text-2xl font-semibold">
                        {teacherName}，{greeting()}
                    </h2>
                    <p className="relative mt-1 text-sm text-[var(--gm-text-2)]">课程章节、课时资料都在这里，点开一门课开始备课。</p>
                    <dl className="relative mt-5 flex gap-8">
                        {[
                            { label: "负责课程", value: courses.length, unit: "门" },
                            { label: "课时", value: totalLessons, unit: "节" },
                            { label: "已备课", value: totalPrepared, unit: "节" },
                        ].map((item) => (
                            <div key={item.label}>
                                <dt className="text-xs text-[var(--gm-text-3)]">{item.label}</dt>
                                <dd className="mt-0.5 text-2xl font-semibold tabular-nums">
                                    {item.value}
                                    <span className="ml-0.5 text-xs font-normal text-[var(--gm-text-3)]">{item.unit}</span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
                {resume ? (
                    <Link
                        href={teachingCourseHref(resume.id)}
                        className="group relative isolate flex overflow-hidden rounded-[var(--gm-radius-xl)] p-5 text-white ring-1 ring-[var(--gm-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                    >
                        <span className="absolute inset-0 -z-10 transition-transform duration-700 group-hover:scale-105">
                            <TeachingCourseCover seed={resume.course.id} coverUrl={resume.course.coverUrl} />
                        </span>
                        {/* 颜色保留：压在封面图上的固定深色遮罩，保证白字在深浅两套主题下都可读；gm token 会随主题变浅，故不迁 */}
                        <span className="absolute inset-0 -z-10 bg-gradient-to-r from-[#060a18]/75 via-[#060a18]/35 to-transparent" />
                        <span className="flex flex-col justify-between gap-6">
                            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] backdrop-blur">
                                <BookOpen className="size-3" /> {preparedCount(resume) ? "继续备课" : "开始备课"}
                            </span>
                            <span>
                                <span className="block text-lg font-semibold">{resume.course.title}</span>
                                <span className="mt-1 block text-xs text-white/70">
                                    已备 {preparedCount(resume)}/{resume.course.lessonCount} 课时
                                    {classesByAssignment.get(resume.id)?.length ? ` · ${classesByAssignment.get(resume.id)?.join("、")}` : ""}
                                </span>
                            </span>
                            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--gm-surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--gm-text)] transition-transform group-hover:translate-x-1">进入备课 →</span>
                        </span>
                    </Link>
                ) : null}
            </section>

            <section className="flex flex-wrap items-center gap-3">
                <div role="group" aria-label="课程范围" className="flex rounded-full bg-[var(--gm-wash)] p-1 ring-1 ring-[var(--gm-border)]">
                    {SCOPES.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            aria-pressed={scope === item.key}
                            onClick={() => setScope(item.key)}
                            className={cn(
                                "h-8 rounded-full px-4 text-[13px] transition-colors",
                                scope === item.key ? "bg-[var(--gm-bg-elevated)] font-medium text-[var(--gm-text)] shadow-sm ring-1 ring-[var(--gm-border-strong)]" : "text-[var(--gm-text-2)] hover:text-[var(--gm-text)]",
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <label className="ml-auto flex h-9 w-full items-center gap-2 rounded-full bg-[var(--gm-wash)] px-3.5 ring-1 ring-[var(--gm-border)] focus-within:ring-[var(--gm-accent)] sm:w-72">
                    <Search className="size-4 text-[var(--gm-text-3)]" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程" aria-label="搜索课程" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--gm-text-3)]" />
                </label>
            </section>

            {loading && !courses.length ? (
                <ul aria-busy="true" aria-label="正在加载课程" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {Array.from({ length: 4 }, (_, index) => (
                        <li key={index} className="overflow-hidden rounded-[var(--gm-radius-xl)] ring-1 ring-[var(--gm-border)]">
                            <span className="block aspect-[16/9] animate-pulse bg-[var(--gm-wash-strong)]" />
                            <span className="m-4 block h-4 w-2/3 animate-pulse rounded bg-[var(--gm-wash-strong)]" />
                        </li>
                    ))}
                </ul>
            ) : visible.length ? (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {visible.map((item, index) => (
                        <CourseCard key={item.id} item={item} index={index} classes={classesByAssignment.get(item.id) ?? []} prepared={preparedCount(item)} />
                    ))}
                </ul>
            ) : (
                <GammaEmptyState
                    icon={<BookOpen />}
                    title={courses.length ? "没有符合条件的课程" : "暂无负责课程"}
                    description={courses.length ? (scope === "mine" ? "打开课程标记过已备的课时，会出现在这里" : "换个关键词试试") : "学校管理员给你的班级安排课程后，课程会出现在这里"}
                />
            )}
        </div>
    );
}
