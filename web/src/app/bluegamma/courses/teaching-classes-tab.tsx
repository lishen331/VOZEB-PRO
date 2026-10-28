"use client";

import { useState } from "react";
import { CalendarClock, MapPin, Plus, Presentation, Users } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { GammaModal } from "@/components/gamma-ui/gamma-overlays";
import { TEACH_CLASSES, overall, type TeachClass } from "@/app/bluegamma/courses/teach-data";

/**
 * 我的班级：对照线上 /teaching?tab=classes —— 每个班级一张卡，显示课表/人数/完成度，
 * 可直接「进入备课」「布置作业」「学生名单」。
 * 名单用弹窗承载（线上是单独的学生列表页，演示稿收进弹窗，避免多一层路由）。
 */
export function TeachingClassesTab({ onPrep, onAssign }: { onPrep: (slug: string, lessonKey: string) => void; onAssign: (className: string) => void }) {
    const [roster, setRoster] = useState<TeachClass | null>(null);

    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {TEACH_CLASSES.map((group) => {
                    const lesson = group.course.lessons[group.schedule.lessonIndex];
                    return (
                        <article key={group.id} className="flex flex-col gap-3 rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-4 ring-1 ring-[var(--gm-border)]">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="truncate text-[15px] font-semibold text-[var(--gm-text)]">{group.name}</h3>
                                    <p className="mt-0.5 truncate text-xs text-[var(--gm-text-3)]">{group.course.title}</p>
                                </div>
                                <span className="shrink-0 rounded-full bg-[var(--gm-accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--gm-accent)]">{overall(group)}% 完成</span>
                            </div>
                            <p className="flex items-center gap-1.5 text-xs text-[var(--gm-text-2)]">
                                <CalendarClock className="size-3.5" />
                                {group.schedule.weekday} {group.schedule.time}
                                <MapPin className="ml-1.5 size-3.5" />
                                {group.schedule.room}
                            </p>
                            <p className="flex items-center gap-1.5 text-xs text-[var(--gm-text-2)]">
                                <Users className="size-3.5" />
                                {group.students.length} 名学生 · 当前第 {group.schedule.lessonIndex + 1} 课「{lesson.title}」
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2">
                                <GammaButton size="sm" variant="soft" icon={<Presentation className="size-3.5" />} onClick={() => onPrep(group.course.slug, lesson.key)}>
                                    进入备课
                                </GammaButton>
                                <GammaButton size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => onAssign(group.name)}>
                                    布置作业
                                </GammaButton>
                                <GammaButton size="sm" variant="ghost" icon={<Users className="size-3.5" />} onClick={() => setRoster(group)}>
                                    学生名单
                                </GammaButton>
                            </div>
                        </article>
                    );
                })}
            </div>

            <GammaModal open={Boolean(roster)} title={roster ? `${roster.name} · 学生名单` : "学生名单"} description={roster?.course.title} onClose={() => setRoster(null)} width={620}>
                {roster ? (
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--gm-text-3)]">
                            <span>{roster.students.length} 名学生</span>
                            <span>全部完成 {roster.students.filter((student) => student.progress.every((value) => value === 1)).length} 人</span>
                            <span>课堂进度 {overall(roster)}%</span>
                        </div>
                        <ol className="flex max-h-[52vh] flex-col divide-y divide-[var(--gm-border)] overflow-y-auto">
                            {roster.students.map((student) => {
                                const finished = student.progress.filter((value) => value === 1).length;
                                const doing = student.progress.findIndex((value) => value !== null && (value ?? 0) < 1);
                                return (
                                    <li key={student.name} className="flex items-center gap-3 py-2.5">
                                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--gm-wash-strong)] text-xs font-medium text-[var(--gm-text-2)]">{student.name.slice(0, 1)}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm text-[var(--gm-text)]">{student.name}</span>
                                            <span className="mt-0.5 block text-[11px] text-[var(--gm-text-3)]">
                                                完成 {finished}/{roster.course.lessons.length} 步{doing >= 0 ? ` · 正在做「${roster.course.lessons[doing].title}」` : " · 全部完成"}
                                            </span>
                                        </span>
                                        <GammaBadge tone={doing >= 0 ? "blue" : "success"}>{doing >= 0 ? "进行中" : "已完成"}</GammaBadge>
                                        <span className="w-16 shrink-0 text-right text-[11px] text-[var(--gm-text-3)]">{student.lastActive}</span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                ) : null}
            </GammaModal>
        </>
    );
}
