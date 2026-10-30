"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Layers, Paperclip, Presentation, Timer, Users } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import type { PlatformCourseDetail, SchoolCourseOffering, TeachingAssignment } from "@/lib/school-domain";
import { cn } from "@/lib/utils";
import { teachingHref, type PrepLesson } from "@/app/(user)/teaching/teaching-routes";
import { MaterialPresent, MaterialViewer } from "./prep-materials";
import { PrepOutline } from "./prep-outline";
import { PrepPanel, type MaterialActions } from "./prep-panel";

/*
 * 备课页的版式（与 /bluegamma/courses 的 CoursePrepView 一致）：
 *   顶栏：返回上一级 + 面包屑（教学中心 / 来源标签 / 课程 / 第 N 课）+ 标记已备 + 放映 + 试讲
 *   主体：左大纲 248px · 中资料预览 · 右备课面板 360px；平板收窄，竖屏时右栏落到中栏下方
 */

/** 返回上一级：教学中心的来源标签 */
export function PrepBackLink({ href, label }: { href: string; label: string }) {
    return (
        <Link href={href} aria-label={`返回教学中心 · ${label}`} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full pr-3 pl-1.5 text-[13px] text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]">
            <ChevronLeft className="size-4" />
            返回
        </Link>
    );
}

/** 面包屑：每一级都能点回去 */
function Breadcrumb({ backHref, backLabel, courseTitle, lessonNumber }: { backHref: string; backLabel: string; courseTitle: string; lessonNumber?: number }) {
    const crumbs: { label: string; href?: string }[] = [
        { label: "教学中心", href: teachingHref() },
        ...(backLabel !== "备课" ? [{ label: backLabel, href: backHref }] : []),
        { label: courseTitle },
        ...(lessonNumber ? [{ label: `第 ${lessonNumber} 课` }] : []),
    ];
    return (
        <nav aria-label="当前位置" className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--gm-text-3)]">
            {crumbs.map((crumb, index) => (
                <span key={`${index}-${crumb.label}`} className="inline-flex min-w-0 items-center gap-1">
                    {index > 0 ? <ChevronRight aria-hidden className="size-3 shrink-0" /> : null}
                    {crumb.href ? (
                        <Link href={crumb.href} className="truncate hover:text-[var(--gm-text)]">
                            {crumb.label}
                        </Link>
                    ) : (
                        <span className="truncate">{crumb.label}</span>
                    )}
                </span>
            ))}
        </nav>
    );
}

export interface PrepLayoutProps {
    tree: PlatformCourseDetail;
    lessons: readonly PrepLesson[];
    lesson: PrepLesson | null;
    prepared: readonly string[];
    offerings: readonly SchoolCourseOffering[];
    assignments: readonly TeachingAssignment[];
    backHref: string;
    backLabel: string;
    /** 写过教案但还没标记已备的课时（大纲里显示「草稿」） */
    drafted: readonly string[];
    materialActions: MaterialActions;
    /** 右栏「教案」标签内容 */
    planEditor: ReactNode;
    /** 教案已载入、不处于冲突状态：才允许标记已备 / 试讲 */
    canMarkPrepared: boolean;
    canRehearse: boolean;
    onPickLesson: (lessonId: string) => void;
    onTogglePrepared: (lessonId: string, done: boolean) => void;
    onRehearse: () => void;
    onCreateAssignment: () => void;
    onOpenAssignments: () => void;
}
export function PrepLayout({
    tree,
    lessons,
    lesson,
    prepared,
    drafted,
    offerings,
    assignments,
    backHref,
    backLabel,
    materialActions,
    planEditor,
    canMarkPrepared,
    canRehearse,
    onPickLesson,
    onTogglePrepared,
    onRehearse,
    onCreateAssignment,
    onOpenAssignments,
}: PrepLayoutProps) {
    // 资料序号跟课时绑定：切到别的课时立即回到第 1 份
    const [cursor, setCursor] = useState({ lessonId: "", index: 0 });
    const index = lesson && cursor.lessonId === lesson.id ? cursor.index : 0;
    const setIndex = (next: number) => {
        if (lesson) setCursor({ lessonId: lesson.id, index: next });
    };
    const [presenting, setPresenting] = useState(false);
    const done = lesson ? prepared.includes(lesson.id) : false;
    const classes = offerings.filter((item) => item.status === "active").map((item) => item.className);
    const lessonAssignments = lesson ? assignments.filter((item) => item.lessonId === lesson.id || (!item.lessonId && item.chapterId === lesson.chapter.id)) : [];
    const materials = lesson?.materials ?? [];
    const preparedInCourse = prepared.filter((id) => lessons.some((item) => item.id === id)).length;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-center gap-3 border-b border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] px-4 py-2.5">
                <PrepBackLink href={backHref} label={backLabel} />
                <span aria-hidden className="h-6 w-px shrink-0 bg-[var(--gm-border-strong)]" />
                <div className="min-w-0 flex-1">
                    <Breadcrumb backHref={backHref} backLabel={backLabel} courseTitle={tree.title} lessonNumber={lesson?.number} />
                    <h1 className="truncate text-[15px] font-semibold">
                        {tree.title}
                        {lesson ? ` · ${lesson.title}` : ""}
                    </h1>
                </div>
                <span className="hidden items-center gap-4 text-xs text-[var(--gm-text-2)] xl:flex">
                    <span className="inline-flex items-center gap-1">
                        <Layers className="size-3.5" />
                        {tree.chapterCount} 章 · {tree.lessonCount} 课时
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <Paperclip className="size-3.5" />
                        {tree.materialCount} 份资料
                    </span>
                    {classes.length ? (
                        <span className="inline-flex max-w-56 items-center gap-1">
                            <Users className="size-3.5 shrink-0" />
                            <span className="truncate">{classes.join("、")}</span>
                        </span>
                    ) : null}
                </span>
                {lesson ? (
                    <GammaButton size="sm" variant={done ? "soft" : "outline"} icon={<Check className="size-4" />} disabled={!canMarkPrepared && !done} onClick={() => onTogglePrepared(lesson.id, !done)}>
                        {done ? "已备课" : "标记已备"}
                    </GammaButton>
                ) : null}
                <GammaButton size="sm" variant="outline" icon={<Presentation className="size-4" />} disabled={!materials.length} onClick={() => setPresenting(true)}>
                    放映
                </GammaButton>
                {lesson ? (
                    <GammaButton size="sm" icon={<Timer className="size-4" />} disabled={!canRehearse} onClick={onRehearse}>
                        试讲
                    </GammaButton>
                ) : null}
            </header>

            {lesson ? (
                <div className="grid min-h-0 flex-1 grid-cols-1 max-lg:auto-rows-max max-lg:overflow-y-auto sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)_300px] xl:grid-cols-[248px_minmax(0,1fr)_360px]">
                    <aside className="gm-scroll overflow-y-auto border-[var(--gm-border)] p-3 max-sm:max-h-64 max-sm:border-b sm:border-r max-lg:max-h-[calc(100dvh-64px)]">
                        <p className="px-2 pb-2 text-xs text-[var(--gm-text-3)]">
                            课程大纲 · {preparedInCourse}/{lessons.length} 已备
                        </p>
                        <PrepOutline lessons={lessons} lessonId={lesson.id} prepared={prepared} drafted={drafted} onPick={onPickLesson} />
                    </aside>
                    <main className="gm-scroll min-w-0 overflow-y-auto p-5">
                        {materials.length ? (
                            <>
                                <MaterialViewer materials={materials} index={index} onIndex={setIndex} onPresent={() => setPresenting(true)} />
                                <p className="mt-3 text-xs text-[var(--gm-text-3)]">← / → 切换资料 · 备完点右上角「标记已备」</p>
                            </>
                        ) : (
                            <div className="grid aspect-video place-items-center rounded-[var(--gm-radius-xl)] border border-dashed border-[var(--gm-border-strong)] bg-[var(--gm-wash)] p-6 text-center">
                                <div>
                                    <p className="text-sm font-medium">这节课还没有课件资料</p>
                                    <p className="mt-1 text-xs text-[var(--gm-text-3)]">{materialActions.canManage ? "在右侧「资料」里上传本校课件，所有使用此课程的班级都能看到" : "课程方或老师上传后会显示在这里"}</p>
                                </div>
                            </div>
                        )}
                    </main>
                    <aside className="flex min-h-0 flex-col border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] max-lg:col-span-full max-lg:h-[520px] max-lg:border-t lg:border-l">
                        <PrepPanel
                            key={lesson.id}
                            lesson={lesson}
                            actions={{
                                ...materialActions,
                                onOpen: (material) => {
                                    const target = materials.findIndex((item) => item.id === material.id);
                                    if (target >= 0) setIndex(target);
                                },
                            }}
                            assignments={lessonAssignments}
                            canCreateAssignment={offerings.some((item) => item.status === "active")}
                            planEditor={planEditor}
                            onCreateAssignment={onCreateAssignment}
                            onOpenAssignments={onOpenAssignments}
                        />
                    </aside>
                </div>
            ) : (
                <div className="grid flex-1 place-items-center p-6 text-center">
                    <div>
                        <p className="text-sm font-medium">课程还没有课时</p>
                        <p className="mt-1 text-xs text-[var(--gm-text-3)]">平台设置好章节与课时后，就可以在这里备课</p>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {presenting && lesson && materials.length ? <MaterialPresent materials={materials} index={index} caption={`第 ${lesson.number} 课 ${lesson.title}`} onIndex={setIndex} onClose={() => setPresenting(false)} /> : null}
            </AnimatePresence>
        </div>
    );
}

/** 加载中：顶栏 + 三栏骨架（返回按钮先可用） */
export function PrepSkeleton({ backHref, backLabel }: { backHref: string; backLabel: string }) {
    const bone = "animate-pulse rounded bg-[var(--gm-wash-strong)]";
    return (
        <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="正在加载课程">
            <header className="flex shrink-0 items-center gap-3 border-b border-[var(--gm-border)] px-4 py-2.5">
                <PrepBackLink href={backHref} label={backLabel} />
                <span className={cn(bone, "h-5 w-56")} />
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)_360px]">
                <div className="flex flex-col gap-2">
                    {Array.from({ length: 6 }, (_, item) => (
                        <span key={item} className={cn(bone, "h-10")} />
                    ))}
                </div>
                <span className={cn(bone, "aspect-video rounded-[var(--gm-radius-xl)]")} />
                <div className="hidden flex-col gap-3 lg:flex">
                    <span className={cn(bone, "h-8")} />
                    <span className={cn(bone, "h-3 w-2/3")} />
                    <span className={cn(bone, "h-16")} />
                </div>
            </div>
        </div>
    );
}
