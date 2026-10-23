"use client";

import { CalendarClock, MapPin, Plus, Presentation, Users } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { TEACH_CLASSES, overall } from "@/app/bluegamma/courses/teach-data";

/**
 * 我的班级：对照线上 /teaching?tab=classes —— 每个班级一张卡，显示课表/人数/完成度，
 * 可直接「进入备课」或「布置作业」（布置作业跳到作业标签并预选该班级）。
 */
export function TeachingClassesTab({ onPrep, onAssign }: { onPrep: (slug: string, lessonKey: string) => void; onAssign: (className: string) => void }) {
    return (
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
                        </div>
                    </article>
                );
            })}
        </div>
    );
}
