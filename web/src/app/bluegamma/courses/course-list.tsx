"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BookOpen, Clock3, Layers, Search, Sparkles } from "lucide-react";

import { GammaChip } from "@/components/gamma-ui/gamma-controls";
import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import { GM_EASE } from "@/components/gamma-ui/gamma-motion";
import { CourseCover } from "@/app/bluegamma/courses/course-cover";
import { COURSES, COURSE_FAMILIES, GRADES, type Course, type CourseFamily } from "@/app/bluegamma/courses/course-data";
import { cn } from "@/lib/utils";

type Filter = { family: CourseFamily | "all"; grade: string; query: string; tab: "all" | "mine" | "recent" };

/** 课程卡：封面 + 课时 + 课数；hover 浮起并亮边，点开进入备课 */
function CourseCard({ course, index, prepared, onOpen }: { course: Course; index: number; prepared: number; onOpen: () => void }) {
    const reduce = useReducedMotion();
    const Icon = course.subject.icon;
    return (
        <motion.li initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: GM_EASE, delay: Math.min(index, 8) * 0.03 }}>
            <button
                type="button"
                onClick={onOpen}
                className="group flex w-full flex-col overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] text-left ring-1 ring-[var(--gm-border)] transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-accent-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
            >
                <span className="relative block aspect-[16/9] overflow-hidden">
                    <CourseCover subject={course.subject} className="transition-transform duration-700 group-hover:scale-105" />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    <span className="absolute top-3 left-3 flex gap-1.5">
                        {course.official ? (
                            <span className="rounded-full bg-[var(--gm-blue)] px-2 py-0.5 text-[11px] font-medium text-white">官方课程</span>
                        ) : (
                            <span className="rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur">校本课程</span>
                        )}
                    </span>
                    <span className="absolute right-3 bottom-3 left-3 flex items-end justify-between text-white">
                        <span className="flex items-center gap-1.5 text-xs">
                            <span className="grid size-6 place-items-center rounded-full bg-white/20 backdrop-blur">
                                <Icon className="size-3.5" />
                            </span>
                            {course.subject.name}
                        </span>
                        <span className="text-[11px] opacity-80">{course.grade}</span>
                    </span>
                </span>
                <span className="flex flex-col gap-2 p-4">
                    <span className="line-clamp-1 text-[15px] font-semibold">{course.title}</span>
                    <span className="line-clamp-1 text-xs text-[var(--gm-text-3)]">{course.subtitle}</span>
                    <span className="mt-1 flex items-center gap-3 text-xs text-[var(--gm-text-2)]">
                        <span className="inline-flex items-center gap-1">
                            <Layers className="size-3.5" />
                            {course.lessons.length} 课
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-3.5" />
                            {course.hours} 课时
                        </span>
                        <span className="ml-auto text-[11px] text-[var(--gm-text-3)]">更新 {course.updated.slice(5)}</span>
                    </span>
                    {/* 备课进度：老师已经看过的课节 */}
                    <span className="mt-1 flex items-center gap-2">
                        <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-[var(--gm-wash-strong)]">
                            <span className="absolute inset-y-0 left-0 rounded-full bg-[image:var(--gm-gradient)]" style={{ width: `${(prepared / course.lessons.length) * 100}%` }} />
                        </span>
                        <span className="text-[11px] text-[var(--gm-text-3)] tabular-nums">
                            已备 {prepared}/{course.lessons.length}
                        </span>
                    </span>
                </span>
            </button>
        </motion.li>
    );
}

const TABS = [
    { key: "all", label: "全部课程" },
    { key: "mine", label: "我的备课" },
    { key: "recent", label: "最近更新" },
] as const;

function matches(course: Course, filter: Filter, prepared: Record<string, readonly string[]>) {
    if (filter.family !== "all" && course.family !== filter.family) return false;
    if (filter.grade !== "全部" && course.grade !== filter.grade) return false;
    if (filter.tab === "mine" && !(prepared[course.slug]?.length > 0)) return false;
    const query = filter.query.trim();
    return !query || `${course.title}${course.subject.name}${course.subtitle}`.includes(query);
}

/** 课程中心：顶部欢迎 + 继续备课，下方筛选 + 课程卡网格 */
export function CourseList({ prepared, onOpen }: { prepared: Record<string, readonly string[]>; onOpen: (slug: string, lessonKey?: string) => void }) {
    const [filter, setFilter] = useState<Filter>({ family: "all", grade: "全部", query: "", tab: "all" });
    const visible = useMemo(() => {
        const list = COURSES.filter((course) => matches(course, filter, prepared));
        return filter.tab === "recent" ? [...list].sort((a, b) => b.updated.localeCompare(a.updated)) : list;
    }, [filter, prepared]);
    const last = Object.entries(prepared).find(([, keys]) => keys.length > 0);
    const resume = last ? COURSES.find((course) => course.slug === last[0]) : COURSES[1];
    const totalLessons = COURSES.reduce((sum, course) => sum + course.lessons.length, 0);
    const preparedCount = Object.values(prepared).reduce((sum, keys) => sum + keys.length, 0);

    return (
        <div className="flex flex-col gap-6 px-6 pt-6 pb-16">
            {/* 欢迎条：左边问候 + 数据，右边「继续备课」卡 */}
            <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
                <div className="relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-6 ring-1 ring-[var(--gm-border)]">
                    <div aria-hidden className="gm-aurora pointer-events-none absolute -top-16 right-10 size-56 rounded-full bg-[var(--gm-blue)] opacity-25 blur-3xl" />
                    <p className="text-xs text-[var(--gm-text-3)]">2026 秋季学期 · 第 7 周</p>
                    <h1 className="mt-1 text-2xl font-semibold">林老师，下午好</h1>
                    <p className="mt-1 text-sm text-[var(--gm-text-2)]">本周有 3 节课待上，课件和教案都可以在这里提前看。</p>
                    <dl className="mt-5 flex gap-8">
                        {[
                            { label: "可用课程", value: COURSES.length, unit: "门" },
                            { label: "课节", value: totalLessons, unit: "节" },
                            { label: "已备课", value: preparedCount, unit: "节" },
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
                    <button
                        type="button"
                        onClick={() => onOpen(resume.slug, prepared[resume.slug]?.at(-1))}
                        className="group relative isolate flex overflow-hidden rounded-[var(--gm-radius-xl)] p-5 text-left text-white ring-1 ring-[var(--gm-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                    >
                        <span className="absolute inset-0 -z-10 transition-transform duration-700 group-hover:scale-105">
                            <CourseCover subject={resume.subject} iconScale={0.8} />
                        </span>
                        {/* 颜色保留：压在封面图上的固定深色遮罩，保证白字在深浅两套主题下都可读；gm token 会随主题变浅，故不迁 */}
                        <span className="absolute inset-0 -z-10 bg-gradient-to-r from-[#060a18]/70 via-[#060a18]/30 to-transparent" />
                        <span className="flex flex-col justify-between gap-6">
                            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] backdrop-blur">
                                <BookOpen className="size-3" /> 继续备课
                            </span>
                            <span>
                                <span className="block text-lg font-semibold">{resume.title}</span>
                                <span className="mt-1 block text-xs text-white/70">
                                    下一节：第 {Math.min((prepared[resume.slug]?.length ?? 0) + 1, resume.lessons.length)} 课 · {resume.lessons[Math.min(prepared[resume.slug]?.length ?? 0, resume.lessons.length - 1)].title}
                                </span>
                            </span>
                            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--gm-surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--gm-text)] transition-transform group-hover:translate-x-1">打开课件 →</span>
                        </span>
                    </button>
                ) : null}
            </section>

            {/* 筛选：标签页 + 专业大类 + 年级 + 搜索 */}
            <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <div role="tablist" aria-label="课程范围" className="flex rounded-full bg-[var(--gm-wash)] p-1 ring-1 ring-[var(--gm-border)]">
                        {TABS.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                role="tab"
                                aria-selected={filter.tab === tab.key}
                                onClick={() => setFilter((value) => ({ ...value, tab: tab.key }))}
                                className={cn(
                                    "h-8 rounded-full px-4 text-[13px] transition-colors",
                                    filter.tab === tab.key ? "bg-[var(--gm-bg-elevated)] font-medium text-[var(--gm-text)] shadow-sm ring-1 ring-[var(--gm-border-strong)]" : "text-[var(--gm-text-2)] hover:text-[var(--gm-text)]",
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <label className="ml-auto flex h-9 w-72 items-center gap-2 rounded-full bg-[var(--gm-wash)] px-3.5 ring-1 ring-[var(--gm-border)] focus-within:ring-[var(--gm-accent)]">
                        <Search className="size-4 text-[var(--gm-text-3)]" />
                        <input
                            value={filter.query}
                            onChange={(event) => setFilter((value) => ({ ...value, query: event.target.value }))}
                            placeholder="搜索课程、专业"
                            aria-label="搜索课程"
                            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--gm-text-3)]"
                        />
                    </label>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-[var(--gm-text-3)]">专业大类</span>
                        {[{ key: "all" as const, label: "全部" }, ...COURSE_FAMILIES].map((family) => (
                            <GammaChip key={family.key} active={filter.family === family.key} onClick={() => setFilter((value) => ({ ...value, family: family.key }))}>
                                {family.label}
                            </GammaChip>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-[var(--gm-text-3)]">年级</span>
                        {["全部", ...GRADES].map((grade) => (
                            <GammaChip key={grade} active={filter.grade === grade} onClick={() => setFilter((value) => ({ ...value, grade }))}>
                                {grade}
                            </GammaChip>
                        ))}
                    </div>
                </div>
            </section>

            {visible.length === 0 ? (
                <GammaEmptyState icon={<Sparkles className="size-6" />} title="没有符合条件的课程" description={filter.tab === "mine" ? "打开任意课程看过的课节，会出现在「我的备课」里" : "换个筛选条件试试"} />
            ) : (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {visible.map((course, index) => (
                        <CourseCard key={course.slug} course={course} index={index} prepared={prepared[course.slug]?.length ?? 0} onOpen={() => onOpen(course.slug)} />
                    ))}
                </ul>
            )}
        </div>
    );
}
