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
 *   面包屑 → 课程头（封面 / 标题 / 简介 / 统计 / 主操作）→ 章节大纲
 * 未解锁只给目录和资料文件名；解锁后给课时说明与资料地址。
 * 后续「资源库」等能力作为这里的一个区块/标签接进来，不再挤进抽屉。
 */

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

function Stat({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <span className="inline-flex items-center gap-1 text-xs text-[var(--gm-text-2)]">
            {icon}
            {label}
        </span>
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
            <main className="h-full min-h-0 overflow-y-auto px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
                <div className="mx-auto flex min-h-60 w-full max-w-6xl items-center justify-center">
                    <Spin />
                </div>
            </main>
        );
    }

    if (!detail) {
        return (
            <main className="h-full min-h-0 overflow-y-auto px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
                <div className="mx-auto w-full max-w-6xl">
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
        <main className="h-full min-h-0 overflow-y-auto px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
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

                <section className="relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)]">
                    <div className="grid md:grid-cols-[minmax(0,1fr)_300px]">
                        <div className="relative flex min-w-0 flex-col gap-3 p-5 sm:p-6">
                            <div aria-hidden className="gm-aurora pointer-events-none absolute -top-24 right-6 size-56 rounded-full bg-[var(--gm-blue)] opacity-20 blur-3xl" />
                            <div className="relative flex flex-wrap items-center gap-2">
                                {detail.unlocked ? (
                                    <Tag color="success" icon={<LockOpen className="size-3" />}>
                                        本校已解锁
                                    </Tag>
                                ) : (
                                    <Tag icon={<Lock className="size-3" />}>待解锁</Tag>
                                )}
                                {detail.category ? <Tag>{detail.category}</Tag> : null}
                                {detail.templateLessonCount ? <Tag color="blue">{detail.templateLessonCount} 节标准教案</Tag> : null}
                            </div>
                            <h1 className="relative text-xl font-semibold tracking-tight sm:text-2xl">{detail.title}</h1>
                            <p className="relative max-w-2xl text-[13px] leading-relaxed text-[var(--gm-text-2)]">{detail.summary || "暂无课程简介"}</p>
                            <div className="relative flex flex-wrap items-center gap-4">
                                <Stat icon={<Layers className="size-3.5" />} label={`${detail.chapterCount} 章 · ${detail.lessonCount} 课时`} />
                                <Stat icon={<Paperclip className="size-3.5" />} label={`${detail.materialCount} 份资料`} />
                            </div>
                            <div className="relative mt-1 flex flex-wrap items-center gap-2">
                                {prepHref ? (
                                    <Link
                                        href={prepHref}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-[var(--gm-radius-sm)] bg-[image:var(--gm-gradient)] px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent-ring)]"
                                    >
                                        进入备课
                                        <ArrowRight className="size-4" />
                                    </Link>
                                ) : null}
                                {detail.canUnlock ? (
                                    <GammaButton icon={<LockOpen className="size-4" />} loading={unlocking} onClick={() => void unlock()}>
                                        解锁这门课程
                                    </GammaButton>
                                ) : null}
                                {!detail.unlocked && !detail.canUnlock ? <p className="text-xs text-[var(--gm-text-3)]">解锁需要学校管理员操作，请联系本校管理员。</p> : null}
                                {detail.unlocked ? <p className="text-xs text-[var(--gm-text-3)]">这门课已进入「备课」标签，可以直接使用里面的课件。</p> : null}
                            </div>
                        </div>
                        <div className="relative hidden min-h-[180px] md:block">
                            <TeachingCourseCover seed={detail.id} coverUrl={detail.coverUrl} />
                            <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-[var(--gm-surface)] via-transparent to-transparent" />
                        </div>
                    </div>
                </section>

                {!detail.unlocked ? <p className="text-xs text-[var(--gm-text-3)]">未解锁时只显示章节、课时标题和资料文件名；解锁后可查看课时说明并下载全部资料。</p> : null}

                <section className="flex flex-col gap-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-full bg-[image:var(--gm-gradient)]" />
                        课程目录
                    </h2>
                    {detail.chapters.length ? (
                        <div className="flex flex-col gap-3">
                            {detail.chapters.map((chapter, chapterIndex) => (
                                <section key={chapter.id} className="overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)]">
                                    <header className="flex items-baseline gap-2 border-b border-[var(--gm-border)] px-4 py-3">
                                        <span className="text-[11px] font-medium text-[var(--gm-text-3)] tabular-nums">第 {chapterIndex + 1} 章</span>
                                        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{chapter.title}</h3>
                                        <span className="shrink-0 text-[11px] text-[var(--gm-text-3)]">{chapter.lessons.length} 课时</span>
                                    </header>
                                    {chapter.description ? <p className="border-b border-[var(--gm-border)] px-4 py-2.5 text-xs leading-relaxed text-[var(--gm-text-2)]">{chapter.description}</p> : null}
                                    <ul className="divide-y divide-[var(--gm-border)]">
                                        {chapter.lessons.map((lesson, lessonIndex) => (
                                            <li key={lesson.id} className="px-4 py-3">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="w-4 shrink-0 text-[11px] text-[var(--gm-text-3)] tabular-nums">{lessonIndex + 1}</span>
                                                    <h4 className="min-w-0 flex-1 truncate text-[13px] font-medium">{lesson.title}</h4>
                                                    {lesson.materials.length ? <span className="shrink-0 text-[11px] text-[var(--gm-text-3)]">{lesson.materials.length} 份资料</span> : null}
                                                </div>
                                                {lesson.description ? <p className="mt-1 pl-6 text-xs leading-relaxed text-[var(--gm-text-2)]">{lesson.description}</p> : null}
                                                {lesson.materials.length ? <MaterialChips materials={lesson.materials} className="mt-2 pl-6" /> : null}
                                            </li>
                                        ))}
                                        {!chapter.lessons.length ? <li className="px-4 py-3 text-xs text-[var(--gm-text-3)]">本章还没有课时</li> : null}
                                    </ul>
                                    {chapter.materials.length ? (
                                        <div className="border-t border-[var(--gm-border)] px-4 py-3">
                                            <p className="mb-1.5 text-[11px] text-[var(--gm-text-3)]">章节资料</p>
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
    const base = "inline-flex max-w-[280px] items-center gap-1.5 rounded-full bg-[var(--gm-wash)] px-2.5 py-1 text-[11px] text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border)]";
    if (!material.url) return <span className={base}>{content}</span>;
    return (
        <a href={material.url} target="_blank" rel="noopener noreferrer" className={cn(base, "transition-colors hover:text-[var(--gm-text)] hover:ring-[var(--gm-border-strong)]")}>
            {content}
        </a>
    );
}
