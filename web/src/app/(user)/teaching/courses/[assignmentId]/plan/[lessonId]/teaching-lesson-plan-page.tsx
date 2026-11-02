"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { BookOpen, ChevronLeft, ChevronRight, Presentation } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import { Spin } from "@/components/gamma-ui/gamma-ant";
import type { PlatformCourseDetail } from "@/lib/school-domain";
import { AnimatePresence } from "motion/react";
import { coursesApi } from "@/services/api/courses";
import { flattenLessons, parseTeachingTab, prepBackHref, resolvePrepLesson, teachingCourseHref, teachingHref, teachingLessonPlanHref, TEACHING_TAB_LABELS } from "@/app/(user)/teaching/teaching-routes";
import { usePreparedLessons } from "@/app/(user)/teaching/use-prepared-lessons";
import { PrepRehearsal } from "../../prep-rehearsal";
import { PlanEditor } from "../../prep-plan-editor";
import { PrepOutline } from "../../prep-outline";
import { useLessonPlan } from "../../use-lesson-plan";

/*
 * L3 教案全屏页（上一级：L2 备课页 /teaching/courses/<assignmentId>?lesson=<lessonId>）
 *   顶栏：返回备课 + 面包屑 + 试讲
 *   左：本节课大纲（切课时用 replace，不在课时之间堆历史）
 *   右：教案编辑器（把 L2 右栏 360px 的编辑区放到整屏；字段与数据模型完全不变）
 * 试讲仍是本页浮层；离开前未保存的修改由 useLessonPlan 负责补发。
 */

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; tree: PlatformCourseDetail };

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

export function TeachingLessonPlanPage({ assignmentId, lessonId, from }: { assignmentId: string; lessonId: string; from: string | null }) {
    const { message } = App.useApp();
    const router = useRouter();
    const fromTab = parseTeachingTab(from);
    const backHref = prepBackHref(from);
    const backLabel = TEACHING_TAB_LABELS[fromTab];
    const { prepared, drafted, refresh: refreshProgress } = usePreparedLessons(true, assignmentId);
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const [rehearsing, setRehearsing] = useState(false);

    const loadTree = useCallback(async () => {
        try {
            setState({ status: "ready", tree: await coursesApi.getSchoolCourseTree(assignmentId) });
        } catch (error) {
            setState({ status: "error", message: errorMessage(error, "课程内容加载失败") });
        }
    }, [assignmentId]);

    useEffect(() => {
        setState({ status: "loading" });
        void loadTree();
    }, [loadTree]);

    const tree = state.status === "ready" ? state.tree : null;
    const lessons = useMemo(() => (tree ? flattenLessons(tree) : []), [tree]);
    const coursePrepared = prepared[assignmentId] ?? [];
    const courseDrafted = drafted[assignmentId] ?? [];
    const lesson = lessons.find((item) => item.id === lessonId) ?? resolvePrepLesson(lessons, lessonId, coursePrepared);
    const plan = useLessonPlan(assignmentId, lesson, refreshProgress);
    const planReady = plan.load.phase === "ready" && plan.doc?.lessonId === lesson?.id && plan.saveState !== "conflict";

    // 切课时用 replace：浏览器后退仍回到备课页，而不是在课时之间来回
    const pickLesson = useCallback((nextLessonId: string) => router.replace(teachingLessonPlanHref(assignmentId, nextLessonId, { from: fromTab }), { scroll: false }), [assignmentId, fromTab, router]);

    const prepHref = teachingHref(fromTab);
    const lessonPrepHref = lesson ? teachingCourseHref(assignmentId, { lessonId: lesson.id, from: fromTab }) : prepHref;

    const startRehearsal = async () => {
        if (!plan.doc?.content.phases.length) {
            message.warning("先在教案里安排至少 1 个教学环节");
            return;
        }
        try {
            if (plan.dirty || plan.doc.isStarter) await plan.save();
            setRehearsing(true);
        } catch (error) {
            message.error(errorMessage(error, "教案保存失败，暂时不能试讲"));
        }
    };

    if (state.status === "loading") {
        return (
            <main className="grid h-full min-h-0 place-items-center">
                <Spin />
            </main>
        );
    }

    if (!tree) {
        return (
            <main className="h-full min-h-0 overflow-y-auto px-4 py-6">
                <div className="mx-auto w-full max-w-3xl">
                    <GammaEmptyState
                        icon={<BookOpen />}
                        title="教案打不开"
                        description={state.status === "error" ? state.message : "这门课可能已下架，或者你不在本校的授课范围内。"}
                        action={
                            <Link href={backHref} className="inline-flex h-9 items-center gap-1 rounded-full px-4 text-[13px] text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border-strong)] hover:bg-[var(--gm-wash)]">
                                返回{backLabel}
                            </Link>
                        }
                    />
                </div>
            </main>
        );
    }

    return (
        <main className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-center gap-3 border-b border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] px-4 py-2.5">
                <Link
                    href={lessonPrepHref}
                    aria-label="返回备课页"
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full pr-3 pl-1.5 text-[13px] text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]"
                >
                    <ChevronLeft className="size-4" />
                    返回
                </Link>
                <span aria-hidden className="h-6 w-px shrink-0 bg-[var(--gm-border-strong)]" />
                <div className="min-w-0 flex-1">
                    <nav aria-label="当前位置" className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--gm-text-3)]">
                        <Link href={teachingHref()} className="hover:text-[var(--gm-text)]">
                            教学中心
                        </Link>
                        <ChevronRight aria-hidden className="size-3 shrink-0" />
                        <Link href={backHref} className="hover:text-[var(--gm-text)]">
                            {backLabel}
                        </Link>
                        <ChevronRight aria-hidden className="size-3 shrink-0" />
                        <Link href={lessonPrepHref} className="truncate hover:text-[var(--gm-text)]">
                            {tree.title}
                        </Link>
                        <ChevronRight aria-hidden className="size-3 shrink-0" />
                        <span className="truncate text-[var(--gm-text-2)]">教案{lesson ? ` · 第 ${lesson.number} 课` : ""}</span>
                    </nav>
                    <h1 className="truncate text-[15px] font-semibold">
                        {tree.title}
                        {lesson ? ` · ${lesson.title}` : ""}
                    </h1>
                </div>
                <GammaButton size="sm" variant="outline" icon={<Presentation className="size-4" />} disabled={!planReady} onClick={() => void startRehearsal()}>
                    试讲
                </GammaButton>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)] max-lg:grid-cols-1 max-lg:grid-rows-[auto_minmax(0,1fr)]">
                <aside className="gm-scroll min-h-0 overflow-y-auto border-r border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] p-2 max-lg:max-h-40 max-lg:border-r-0 max-lg:border-b">
                    <PrepOutline lessons={lessons} lessonId={lesson?.id ?? ""} prepared={coursePrepared} drafted={courseDrafted} onPick={pickLesson} />
                </aside>
                {/* 教案正文：整屏宽度，长教案不用再挤在 360px 的右栏里 */}
                <section aria-label="教案" className="gm-scroll min-h-0 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10">
                    <div className="mx-auto w-full max-w-3xl">
                        <PlanEditor
                            doc={plan.doc?.lessonId === lesson?.id ? plan.doc : null}
                            load={plan.load}
                            materials={lesson?.materials ?? []}
                            saveState={plan.saveState}
                            saveError={plan.saveError}
                            savedAt={plan.savedAt}
                            dirty={plan.dirty}
                            onUpdate={plan.update}
                            onRetrySave={() => void plan.save().catch(() => undefined)}
                            onReload={plan.reload}
                            onOverwrite={() => void plan.overwrite().catch(() => undefined)}
                        />
                    </div>
                </section>
            </div>

            <AnimatePresence>
                {rehearsing && lesson && plan.doc ? (
                    <PrepRehearsal
                        caption={`第 ${lesson.number} 课 ${lesson.title}`}
                        content={plan.doc.content}
                        materials={lesson.materials}
                        onFinish={async (input) => {
                            try {
                                await plan.recordRehearsal(input);
                                message.success("试讲记录已保存，可以在教案里看到各环节用时");
                            } catch (error) {
                                message.error(errorMessage(error, "试讲记录保存失败"));
                                throw error;
                            }
                        }}
                        onClose={() => setRehearsing(false)}
                    />
                ) : null}
            </AnimatePresence>
        </main>
    );
}
