"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Flame, MapPin, Presentation, Users, Zap } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaAreaChart, GammaBarChart, GammaHeatmap, GammaMetric, GammaRingGauge } from "@/components/gamma-ui/gamma-charts";
import { GammaTabs } from "@/components/gamma-ui/gamma-controls";
import { SUBMIT_TREND, TEACH_CLASSES, WEEK_GENERATIONS, overall, stepAverages, stuckStep } from "@/app/bluegamma/courses/teach-data";
import { cn } from "@/lib/utils";

/*
 * 教师看板（数据大屏风格）：备课入口在最上面，下面是班级学情。
 * 深色底 + 网格光晕 + 发光数据；浅色主题下同一套组件自动换成浅底。
 */

function Panel({ title, extra, children, className }: { title: string; extra?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cn("relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-4 ring-1 ring-[var(--gm-border)]", className)}>
            {/* 大屏角标：左上、右下两个直角 */}
            <span aria-hidden className="pointer-events-none absolute top-2 left-2 size-2.5 border-t-[1.5px] border-l-[1.5px] border-[var(--gm-accent)] opacity-70" />
            <span aria-hidden className="pointer-events-none absolute right-2 bottom-2 size-2.5 border-r-[1.5px] border-b-[1.5px] border-[var(--gm-accent)] opacity-70" />
            <header className="relative flex items-center gap-2">
                <span className="h-3 w-1 rounded-full bg-[image:var(--gm-gradient)]" />
                <h2 className="text-sm font-semibold">{title}</h2>
                {extra ? <div className="ml-auto text-xs text-[var(--gm-text-3)]">{extra}</div> : null}
            </header>
            <div className="relative min-w-0">{children}</div>
        </section>
    );
}

export function TeachDashboard({ onPrep }: { onPrep: (slug: string, lessonKey: string) => void }) {
    const [classId, setClassId] = useState(TEACH_CLASSES[0].id);
    const group = TEACH_CLASSES.find((item) => item.id === classId) ?? TEACH_CLASSES[0];
    const averages = useMemo(() => stepAverages(group), [group]);
    const stuck = useMemo(() => stuckStep(group), [group]);
    const done = group.students.filter((student) => student.progress.every((value) => value === 1)).length;
    const nextLesson = group.course.lessons[group.schedule.lessonIndex];
    const stepNames = group.course.lessons.map((lesson) => lesson.title);

    return (
        <div className="relative flex flex-col gap-4">
            {/* 背景：网格渐隐，营造大屏氛围 */}
            <div
                aria-hidden
                className="pointer-events-none absolute -inset-x-6 -top-6 h-[420px] opacity-[0.06]"
                style={{ backgroundImage: "linear-gradient(var(--gm-text) 1px, transparent 1px), linear-gradient(90deg, var(--gm-text) 1px, transparent 1px)", backgroundSize: "36px 36px", maskImage: "linear-gradient(#000, transparent)" }}
            />

            {/* 下一节课：备课入口 */}
            <section className="relative isolate grid gap-4 overflow-hidden rounded-[var(--gm-radius-xl)] p-5 ring-1 ring-[var(--gm-accent-ring)] lg:grid-cols-[1fr_auto]">
                <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(120deg,rgba(0,80,245,0.32),rgba(40,235,250,0.10)_55%,transparent)]" />
                <span aria-hidden className="gm-aurora absolute -top-20 left-1/3 -z-10 size-72 rounded-full bg-[var(--gm-cyan)] opacity-20 blur-3xl" />
                <div className="flex flex-col gap-2">
                    <p className="inline-flex flex-wrap items-center gap-1.5 text-xs text-[var(--gm-accent)]">
                        <CalendarClock className="size-3.5" />
                        下一节课 · {group.schedule.weekday} {group.schedule.time}
                        <span className="inline-flex items-center gap-1 text-[var(--gm-text-3)]">
                            <MapPin className="ml-2 size-3" /> {group.schedule.room}
                        </span>
                    </p>
                    <h2 className="text-xl font-semibold">
                        {group.name} · 第 {group.schedule.lessonIndex + 1} 课「{nextLesson.title}」
                    </h2>
                    <p className="text-sm text-[var(--gm-text-2)]">{nextLesson.goal}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        {stuck.count > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--gm-warning)_8%,transparent)] px-2.5 py-1 font-medium text-[var(--gm-warning)]">
                                <AlertTriangle className="size-3.5" />
                                {stuck.count} 人卡在「{stepNames[stuck.index]}」，建议上课先讲
                            </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gm-wash)] px-2.5 py-1 text-[var(--gm-text-2)]">课件 7 页 · 教案 · 任务单已就绪</span>
                    </div>
                </div>
                <div className="flex items-end gap-2">
                    <GammaButton variant="ghost" icon={<Presentation className="size-4" />} onClick={() => onPrep(group.course.slug, nextLesson.key)}>
                        开始上课
                    </GammaButton>
                    <GammaButton shine trailingIcon={<ArrowRight className="size-4" />} onClick={() => onPrep(group.course.slug, nextLesson.key)}>
                        去备课
                    </GammaButton>
                </div>
            </section>

            {/* 班级切换 */}
            <div className="flex flex-wrap items-center gap-3">
                <GammaTabs label="班级" size="sm" value={classId} onChange={setClassId} options={TEACH_CLASSES.map((item) => ({ value: item.id, label: `${item.name} · ${item.course.subject.name}` }))} />
                <span className="text-xs text-[var(--gm-text-3)]">数据每 10 分钟更新 · 演示数据</span>
            </div>

            {/* 指标 */}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <GammaMetric label="班级人数" value={group.students.length} unit="人" icon={<Users />} tone="blue" />
                <GammaMetric label="整体完成度" value={overall(group)} unit="%" previous={overall(group) - 7} trend={[22, 28, 31, 35, 40, 44, overall(group)]} icon={<CheckCircle2 />} />
                <GammaMetric label="全部完成" value={done} unit="人" previous={done > 0 ? done - 1 : undefined} trend={[0, 0, 1, 1, 2, done]} icon={<Flame />} tone="violet" />
                <GammaMetric label="本周生成" value={WEEK_GENERATIONS.reduce((sum, item) => sum + item.value, 0)} unit="次" previous={1240} trend={WEEK_GENERATIONS.map((item) => item.value)} icon={<Zap />} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                <Panel title="学生 × 步骤完成度" extra="点格子看学生作品（演示）">
                    <GammaHeatmap rows={group.students.map((student) => student.name)} columns={stepNames} values={group.students.map((student) => student.progress)} />
                </Panel>
                <div className="grid gap-4">
                    <Panel title="各步骤平均完成度">
                        <div className="flex items-center justify-around gap-4">
                            <GammaRingGauge value={overall(group)} label="整体完成度" sub={`${group.students.length} 人`} />
                            <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
                                {stepNames.map((name, index) => (
                                    <li key={name} className="flex items-center gap-2">
                                        <span className={cn("w-16 truncate", index === stuck.index ? "text-[var(--gm-warning)]" : "text-[var(--gm-text-2)]")}>{name}</span>
                                        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--gm-wash-strong)]">
                                            <span className="absolute inset-y-0 left-0 rounded-full bg-[image:var(--gm-gradient)] shadow-[0_0_8px_rgba(40,235,250,0.6)]" style={{ width: `${averages[index]}%` }} />
                                        </span>
                                        <span className="w-8 text-right font-mono tabular-nums">{averages[index]}%</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </Panel>
                    <Panel title="本周每日生成次数">
                        <GammaBarChart items={WEEK_GENERATIONS} unit=" 次" height={170} highlight={4} />
                    </Panel>
                </div>
            </div>

            <Panel title="近 8 周作业提交率" extra="提交 / 按时提交">
                <GammaAreaChart
                    labels={SUBMIT_TREND.labels}
                    unit="%"
                    series={[
                        { name: "提交率", values: SUBMIT_TREND.submitted },
                        { name: "按时提交", values: SUBMIT_TREND.onTime, tone: "cyan" },
                    ]}
                />
            </Panel>
        </div>
    );
}
