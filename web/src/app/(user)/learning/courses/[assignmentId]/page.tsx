"use client";

import { App, Spin, Tag } from "antd";
import { ChevronLeft, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import type { PlatformCourseDetail } from "@/lib/school-domain";
import { coursesApi } from "@/services/api/courses";
import { SchoolCourseTree } from "@/components/school/school-course-tree";

export default function LearningCourseDetailPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const params = useParams<{ assignmentId: string }>();
    const assignmentId = params.assignmentId;
    const [course, setCourse] = useState<PlatformCourseDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        setLoading(true);
        coursesApi
            .getSchoolCourseTree(assignmentId, { signal: controller.signal })
            .then((result) => {
                if (!active) return;
                setCourse(result);
            })
            .catch((error) => {
                if (!active) return;
                setCourse(null);
                message.error(errorMessage(error, "课程详情加载失败"));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
            controller.abort();
        };
    }, [assignmentId, message]);

    if (loading) {
        return (
            <main className="flex h-full min-h-0 items-center justify-center">
                <Spin />
            </main>
        );
    }

    if (!course) {
        return (
            <main className="h-full min-h-0 overflow-y-auto px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
                <div className="mx-auto w-full max-w-5xl">
                    <BackRow onBack={() => router.push("/learning")} title="课程不存在或已被移除" />
                </div>
            </main>
        );
    }

    const coverUrl = course.coverUrl;
    const body = typeof course.content.body === "string" ? course.content.body : "";

    return (
        <main className="h-full min-h-0 overflow-y-auto px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto w-full max-w-5xl">
                <BackRow onBack={() => router.push("/learning")} title={course.title} />

                <div className="flex flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="aspect-video w-full flex-none overflow-hidden rounded-xl bg-zinc-100 sm:w-70 dark:bg-zinc-900">{coverUrl ? <img src={coverUrl} alt={course.title} className="h-full w-full object-cover" /> : null}</div>
                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-lg font-semibold text-zinc-950 sm:text-xl dark:text-zinc-100">{course.title}</h1>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
                                <Clock className="size-3.5" />
                                {course.lessonCount} 课时
                            </span>
                        </div>
                        <div className="flex gap-2 text-sm leading-6">
                            <span className="w-12 flex-none text-zinc-400">简介</span>
                            <span className="min-w-0 text-zinc-600 dark:text-zinc-300">{course.summary || body || "暂无简介"}</span>
                        </div>
                        <div className="flex gap-2 text-sm leading-6">
                            <span className="w-12 flex-none text-zinc-400">类别</span>
                            <span className="min-w-0">{course.category ? <Tag>{course.category}</Tag> : <span className="text-zinc-500">未设置</span>}</span>
                        </div>
                        <div className="flex gap-2 text-sm leading-6">
                            <span className="w-12 flex-none text-zinc-400">有效期</span>
                            <span className="min-w-0 text-zinc-600 dark:text-zinc-300">{course.validUntil ? formatDate(course.validUntil) + " 到期" : "永久"}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-8">
                    <h2 className="mb-4 text-base font-semibold text-zinc-950 dark:text-zinc-100">课程列表</h2>
                    <SchoolCourseTree assignmentId={assignmentId} />
                </div>
            </div>
        </main>
    );
}

function BackRow({ onBack, title }: { onBack: () => void; title: string }) {
    return (
        <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            <ChevronLeft className="size-4" />
            <span>我的课程 / </span>
            <span className="font-medium text-zinc-800 dark:text-zinc-100">{title}</span>
        </button>
    );
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}
