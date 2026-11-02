"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BookOpen, ChevronRight, FileText, Layers, Lock, LockOpen, Paperclip } from "lucide-react";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Spin, Tag } from "@/components/gamma-ui/gamma-ant";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import type { SchoolCourseCatalogDetail } from "@/lib/school-domain";
import { cn } from "@/lib/utils";
import { coursesApi } from "@/services/api/courses";
import { TeachingCourseCover } from "../../teaching-course-cover";
import { teachingCourseHref, teachingHref } from "../../teaching-routes";

/*
 * L1.5 课程详情（/teaching/catalog/<courseId>，从课程中心点进来）：
 *   左栏（吸顶）：封面 + 解锁状态 + 统计 + 主操作
 *   右栏：课程目录（章节 → 课时 → 资料）
 * 未解锁只给目录和资料文件名；解锁后给课时说明与资料地址。
 * 边框用 --gm-border-strong + 阴影画出清晰边界，避免大片黑底看不清分区。
 */

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

function StatTile({ icon, value, unit, label }: { icon: React.ReactNode; value: number; unit: string; label: string }) {
    return (
        <div className="flex flex-col gap-1 rounded-[var(--gm-radius)] bg-[var(--gm-wash)] px-3 py-2 ring-1 ring-[var(--gm-border)]">
            <span className="flex items-center gap-1 text-[10px] text-[var(--gm-text-3)]">
                {icon}
                {label}
            </span>
            <span className="text-lg leading-none font-semibold tabular-nums">
                {value}
                <span className="ml-0.5 text-[10px] font-normal text-[var(--gm-text-3)]">{unit}</span>
            </span>
        </div>
    );
}

export function CatalogCourseDetail({ courseId }: { courseId: string }) {
    const { message } = App.useApp();
    const [detail, setDetail] = useState<SchoolCourseCatalogDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [unlocking, setUnlocking] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setDetail(await coursesApi.getCourseCatalogDetail(courseId));
            setError("");
        } catch (caught) {
            setError(errorMessage(caught, "课程目录加载失败"));
        } finally {
            setLoading(false);
        }
    }, [courseId]);

    useEffect(() => {
        void load();
    }, [load]);

    const unlock = async () => {
        if (!detail) return;
        setUnlocking(true);
        try {
            await coursesApi.unlockCourse(detail.id);
            message.success(`已解锁《${detail.title}》`);
            // 解锁后重新拉一次：课时说明和资料地址只有解锁态才下发
            await load();
        } catch (caught) {
            message.error(errorMessage(caught, "课程解锁失败"));
        } finally {
            setUnlocking(false);
        }
    };

    const backHref = teachingHref("catalog");

    if (loading) {
        return (
            <main className="grid h-full min-h-0 place-items-center">
                <Spin />
            </main>
        );
    }

    if (!detail) {
        return (
            <main className="h-full min-h-0 overflow-y-auto px-4 py-8">
                <div className="mx-auto w-full max-w-3xl">
                    <GammaEmptyState
                        icon={<BookOpen />}
                        title="课程打不开"
                        description={error || "这门课程可能已下架，或者你所在学校没有访问权限。"}
                        action={
                            <Link href={backHref} className="inline-flex h-9 items-center gap-1 rounded-full px-4 text-[13px] text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border-strong)] hover:bg-[var(--gm-wash)]">
                                返回课程中心
                            </Link>
                        }
                    />
                </div>
            </main>
        );
    }

    const prepHref = detail.unlocked && detail.assignmentId ? teachingCourseHref(detail.assignmentId, { from: "catalog" }) : null;

    return (
        <main className="h-full min-h-0 overflow-y-auto px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
            <div className="gm-page flex flex-col gap-4">
                <nav aria-label="当前位置" className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--gm-text-3)]">
                    <Link href={teachingHref()} className="hover:text-[var(--gm-text)]">
                        教学中心
                    </Link>
                    <ChevronRight aria-hidden className="size-3 shrink-0" />
                    <Link href={backHref} className="hover:text-[var(--gm-text)]">
                        课程中心
                    </Link>
                    <ChevronRight aria-hidden className="size-3 shrink-0" />
                    <span className="truncate text-[var(--gm-text-2)]">{detail.title}</span>
                </nav>

                <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                    {/* 左栏：封面 + 概要 + 主操作，滚动时吸顶 */}
                    <aside className="flex flex-col gap-3 lg:sticky lg:top-0 lg:self-start">
                        <section className="overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] shadow-[var(--gm-shadow)] ring-1 ring-[var(--gm-border-strong)]">
                            <div className="relative aspect-[16/10] overflow-hidden">
                                <TeachingCourseCover seed={detail.id} coverUrl={detail.coverUrl} />
                                <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                                <span
                                    className={cn(
                                        "absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-md",
                                        detail.unlocked ? "bg-white/90 text-[#0b1526]" : "bg-black/55 text-white ring-1 ring-white/25",
                                    )}
                                >
                                    {detail.unlocked ? <LockOpen className="size-2.5" /> : <Lock className="size-2.5" />}
                                    {detail.unlocked ? "本校已解锁" : "待解锁"}
                                </span>
                            </div>
                            <div className="flex flex-col gap-2.5 p-4">
                                <div className="flex flex-wrap gap-1.5">
                                    {detail.category ? <Tag>{detail.category}</Tag> : null}
                                    {detail.templateLessonCount ? <Tag color="blue">{detail.templateLessonCount} 节标准教案</Tag> : null}
                                </div>
                                <h1 className="text-lg leading-snug font-semibold tracking-tight">{detail.title}</h1>
                                <p className="text-[13px] leading-relaxed text-[var(--gm-text-2)]">{detail.summary || "暂无课程简介"}</p>
                                <div className="grid grid-cols-3 gap-2">
                                    <StatTile icon={<Layers className="size-3" />} value={detail.chapterCount} unit="章" label="章节" />
                                    <StatTile icon={<BookOpen className="size-3" />} value={detail.lessonCount} unit="节" label="课时" />
                                    <StatTile icon={<Paperclip className="size-3" />} value={detail.materialCount} unit="份" label="资料" />
                                </div>
                                <div className="mt-1 flex flex-col gap-2">
                                    {prepHref ? (
                                        <Link
                                            href={prepHref}
                                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--gm-radius-sm)] bg-[image:var(--gm-gradient)] px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent-ring)]"
                                        >
                                            进入备课
                                            <ArrowRight className="size-4" />
                                        </Link>
                                    ) : null}
                                    {detail.canUnlock ? (
                                        <GammaButton icon={<LockOpen className="size-4" />} loading={unlocking} onClick={() => void unlock()} className="w-full justify-center">
                                            解锁这门课程
                                        </GammaButton>
                                    ) : null}
                                    {!detail.unlocked && !detail.canUnlock ? <p className="text-[11px] leading-relaxed text-[var(--gm-text-3)]">解锁需要学校管理员操作，请联系本校管理员。</p> : null}
                                    {detail.unlocked ? <p className="text-[11px] leading-relaxed text-[var(--gm-text-3)]">这门课已进入「备课」标签，可以直接使用里面的课件。</p> : null}
                                </div>
                            </div>
                        </section>
                    </aside>

                    {/* 右栏：课程目录 */}
                    <section className="flex min-w-0 flex-col gap-3">
                        <header className="flex flex-wrap items-baseline gap-2">
                            <h2 className="flex items-center gap-2 text-sm font-semibold">
                                <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-full bg-[image:var(--gm-gradient)]" />
                                课程目录
                            </h2>
                            <span className="text-[11px] text-[var(--gm-text-3)] tabular-nums">
                                {detail.chapters.length} 章 · {detail.lessonCount} 课时
                            </span>
                            {!detail.unlocked ? <span className="ml-auto text-[11px] text-[var(--gm-text-3)]">未解锁只显示标题和文件名，解锁后可下载全部资料</span> : null}
                        </header>

                        {detail.chapters.length ? (
                            <div className="flex flex-col gap-2.5">
                                {detail.chapters.map((chapter, chapterIndex) => (
                                    <section key={chapter.id} className="overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border-strong)]">
                                        <header className="flex items-center gap-2.5 border-b border-[var(--gm-border)] bg-[var(--gm-wash)] px-3.5 py-2.5">
                                            <span className="grid size-6 shrink-0 place-items-center rounded-[6px] bg-[var(--gm-accent-soft)] text-[11px] font-semibold text-[var(--gm-accent)] tabular-nums ring-1 ring-[var(--gm-accent-ring)]">
                                                {chapterIndex + 1}
                                            </span>
                                            <h3 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{chapter.title}</h3>
                                            <span className="shrink-0 text-[11px] text-[var(--gm-text-3)] tabular-nums">{chapter.lessons.length} 课时</span>
                                        </header>
                                        {chapter.description ? <p className="border-b border-[var(--gm-border)] px-3.5 py-2 text-xs leading-relaxed text-[var(--gm-text-2)]">{chapter.description}</p> : null}
                                        <ul className="divide-y divide-[var(--gm-border)]">
                                            {chapter.lessons.map((lesson, lessonIndex) => (
                                                <li key={lesson.id} className="px-3.5 py-2.5 transition-colors hover:bg-[var(--gm-wash)]">
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="w-4 shrink-0 text-[10.5px] text-[var(--gm-text-3)] tabular-nums">{lessonIndex + 1}</span>
                                                        <h4 className="min-w-0 flex-1 truncate text-[13px] font-medium">{lesson.title}</h4>
                                                        {lesson.materials.length ? <span className="shrink-0 text-[10.5px] text-[var(--gm-text-3)]">{lesson.materials.length} 份</span> : null}
                                                    </div>
                                                    {lesson.description ? <p className="mt-1 pl-6 text-[11.5px] leading-relaxed text-[var(--gm-text-2)]">{lesson.description}</p> : null}
                                                    {lesson.materials.length ? <MaterialChips materials={lesson.materials} className="mt-1.5 pl-6" /> : null}
                                                </li>
                                            ))}
                                            {!chapter.lessons.length ? <li className="px-3.5 py-2.5 text-xs text-[var(--gm-text-3)]">本章还没有课时</li> : null}
                                        </ul>
                                        {chapter.materials.length ? (
                                            <div className="border-t border-[var(--gm-border)] bg-[var(--gm-wash)]/60 px-3.5 py-2">
                                                <p className="mb-1.5 text-[10.5px] text-[var(--gm-text-3)]">章节资料</p>
                                                <MaterialChips materials={chapter.materials} />
                                            </div>
                                        ) : null}
                                    </section>
                                ))}
                            </div>
                        ) : (
                            <GammaEmptyState icon={<BookOpen />} title="这门课还没有章节内容" description="课程方补充内容后，这里会显示章节课时和资料。" />
                        )}
                    </section>
                </div>
            </div>
        </main>
    );
}

/** 资料小标签：解锁态是下载链接，锁定态只是文件名 */
function MaterialChips({ materials, className }: { materials: SchoolCourseCatalogDetail["chapters"][number]["materials"]; className?: string }) {
    return (
        <ul className={cn("flex flex-wrap gap-1.5", className)}>
            {materials.map((material) => (
                <li key={material.id}>
                    <MaterialChip material={material} />
                </li>
            ))}
        </ul>
    );
}

function MaterialChip({ material }: { material: SchoolCourseCatalogDetail["chapters"][number]["materials"][number] }) {
    const content = (
        <>
            <FileText className="size-3 shrink-0 text-[var(--gm-text-3)]" />
            <span className="truncate">{material.fileName}</span>
            <span className="shrink-0 text-[var(--gm-text-3)]">{formatBytes(material.bytes)}</span>
        </>
    );
    const base = "inline-flex max-w-[240px] items-center gap-1.5 rounded-full bg-[var(--gm-bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border)]";
    if (!material.url) return <span className={base}>{content}</span>;
    return (
        <a href={material.url} target="_blank" rel="noopener noreferrer" className={cn(base, "transition-colors hover:text-[var(--gm-text)] hover:ring-[var(--gm-border-strong)]")}>
            {content}
        </a>
    );
}
