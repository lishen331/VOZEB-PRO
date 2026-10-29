"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { ChevronLeft, Clock3, LayoutDashboard, Layers, Library, Presentation, Target } from "lucide-react";

import "@/components/gamma-ui/gamma-tokens.css";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaToastStack } from "@/components/gamma-ui/gamma-overlays";
import { GammaSidebar, useGammaSidebarState } from "@/components/gamma-ui/gamma-sidebar";
import { GammaSidebarActions } from "@/app/bluegamma/home/sidebar-actions";
import { GAMMA_RAIL_ITEMS } from "@/app/bluegamma/gamma-nav";
import { useGammaDemo } from "@/app/bluegamma/use-gamma-demo";
import { courseBySlug, type Course } from "@/app/bluegamma/courses/course-data";
import { CourseList } from "@/app/bluegamma/courses/course-list";
import { TeachDashboard } from "@/app/bluegamma/courses/teach-dashboard";
import { GammaTabs } from "@/components/gamma-ui/gamma-controls";
import { CourseOutline, PrepPanel, SlideViewer } from "@/app/bluegamma/courses/course-prep";
import { CoursePresent } from "@/app/bluegamma/courses/course-present";

/** 侧栏与首页一致（课程入口已在 GAMMA_RAIL_ITEMS 里），当前页高亮「课程」 */
const SIDEBAR_ITEMS = GAMMA_RAIL_ITEMS.filter((item) => item.key !== "home" && item.key !== "kling-home").map((item) => (item.group === "more" ? { ...item, group: "community" } : item));

const PREP_KEY = "bluegamma:prepared-lessons";

/** 已备课节记在 localStorage（演示用） */
function usePrepared() {
    const [prepared, setPrepared] = useState<Record<string, readonly string[]>>({});
    useEffect(() => {
        try {
            setPrepared(JSON.parse(window.localStorage.getItem(PREP_KEY) ?? "{}"));
        } catch {
            // 读不到就当没有
        }
    }, []);
    const mark = useCallback((slug: string, lessonKey: string) => {
        setPrepared((current) => {
            if (current[slug]?.includes(lessonKey)) return current;
            const next = { ...current, [slug]: [...(current[slug] ?? []), lessonKey] };
            try {
                window.localStorage.setItem(PREP_KEY, JSON.stringify(next));
            } catch {
                // 写不进去不影响当前页面
            }
            return next;
        });
    }, []);
    return { prepared, mark };
}

/** 备课页：左大纲 · 中课件 · 右教案 */
function CoursePrepView({
    course,
    lessonKey,
    prepared,
    onLesson,
    onBack,
    onMark,
    onNotice,
}: {
    course: Course;
    lessonKey: string;
    prepared: readonly string[];
    onLesson: (key: string) => void;
    onBack: () => void;
    onMark: (key: string) => void;
    onNotice: (message: string) => void;
}) {
    const lesson = course.lessons.find((item) => item.key === lessonKey) ?? course.lessons[0];
    // 页码跟课节绑定：切到别的课节时立即从第 1 页开始（不经过一帧旧页码，避免误把新课节标成已备）
    const [cursor, setCursor] = useState({ key: lesson.key, page: 0 });
    const page = cursor.key === lesson.key ? cursor.page : 0;
    const setPage = useCallback((next: number) => setCursor({ key: lesson.key, page: next }), [lesson.key]);
    const [presenting, setPresenting] = useState(false);
    // 翻到最后一页视为本节已备
    useEffect(() => {
        if (page === lesson.slides.length - 1) onMark(lesson.key);
    }, [lesson.key, lesson.slides.length, onMark, page]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center gap-3 border-b border-[var(--gm-border)] px-5 py-3">
                <button type="button" onClick={onBack} aria-label="返回课程中心" className="grid size-8 place-items-center rounded-full text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]">
                    <ChevronLeft className="size-4" />
                </button>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-[var(--gm-text-3)]">
                        课程中心 / {course.subject.name} / 第 {lesson.index + 1} 课
                    </p>
                    <h1 className="truncate text-[15px] font-semibold">
                        {course.title} · {lesson.title}
                    </h1>
                </div>
                <span className="hidden items-center gap-4 text-xs text-[var(--gm-text-2)] lg:flex">
                    <span className="inline-flex items-center gap-1">
                        <Layers className="size-3.5" />
                        {lesson.slides.length} 页
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3.5" />
                        90 分钟
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <Target className="size-3.5" />
                        {course.grade}
                    </span>
                </span>
                <GammaButton size="sm" variant="soft" onClick={() => onNotice("已加入本周课表（演示）")}>
                    加入课表
                </GammaButton>
                <GammaButton size="sm" icon={<Presentation className="size-4" />} onClick={() => setPresenting(true)}>
                    开始上课
                </GammaButton>
            </header>
            {/* 桌面三栏；平板（<1280）把教案栏收窄、大纲收窄；更窄时教案栏移到课件下方 */}
            <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)] max-lg:overflow-y-auto lg:grid-cols-[200px_minmax(0,1fr)_300px] xl:grid-cols-[248px_minmax(0,1fr)_360px]">
                <aside className="gm-scroll overflow-y-auto border-r border-[var(--gm-border)] p-3 max-lg:max-h-[calc(100vh-64px)]">
                    <p className="px-2 pb-2 text-xs text-[var(--gm-text-3)]">
                        课程大纲 · {prepared.length}/{course.lessons.length} 已备
                    </p>
                    <CourseOutline course={course} lessonKey={lesson.key} prepared={prepared} onPick={onLesson} />
                </aside>
                <main className="gm-scroll min-w-0 overflow-y-auto p-5">
                    <SlideViewer course={course} lesson={lesson} page={page} onPage={setPage} onPresent={() => setPresenting(true)} />
                    <p className="mt-3 text-xs text-[var(--gm-text-3)]">← / → 翻页 · 翻到最后一页自动标记为已备</p>
                </main>
                {/* 平板竖屏：教案栏跨两列放到课件下面，固定高度内滚动 */}
                <aside className="flex min-h-0 flex-col border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] max-lg:col-span-2 max-lg:h-[520px] max-lg:border-t lg:border-l">
                    <PrepPanel lesson={lesson} page={page} onPage={setPage} />
                </aside>
            </div>
            <AnimatePresence>{presenting ? <CoursePresent course={course} lesson={lesson} page={page} onPage={setPage} onClose={() => setPresenting(false)} /> : null}</AnimatePresence>
        </div>
    );
}

/**
 * 课程（教师备课）/bluegamma/courses：
 *   无参数        → 课程中心（列表）
 *   ?c=slug&l=key → 备课页（大纲 / 课件 / 教案）
 * 参考编程猫教师端「课程资源 → 在线备课」的结构，样式全部用 gamma-ui。
 */
export function CourseView() {
    const params = useSearchParams();
    const router = useRouter();
    const demo = useGammaDemo();
    const sidebar = useGammaSidebarState();
    const { prepared, mark } = usePrepared();
    const course = courseBySlug(params.get("c"));
    const tab: "board" | "library" = params.get("v") === "library" ? "library" : "board";
    const notice = useCallback((message: string) => demo.toast("info", message), [demo]);

    const go = useCallback(
        (slug?: string, lessonKey?: string) => {
            const query = slug ? `?c=${slug}${lessonKey ? `&l=${lessonKey}` : ""}` : "";
            router.push(`/bluegamma/courses${query}`, { scroll: false });
        },
        [router],
    );

    return (
        <>
            <div className="flex min-h-0 flex-1">
                <GammaSidebar
                    items={SIDEBAR_ITEMS}
                    homeHref="/bluegamma/home"
                    activeKey="courses"
                    collapsed={sidebar.collapsed}
                    onToggle={sidebar.toggle}
                    onSelect={() => notice("该模块的新版页面正在设计中")}
                    actions={<GammaSidebarActions collapsed={sidebar.collapsed} points={demo.points} checkedIn={demo.checkedIn} onCheckIn={demo.checkIn} onNotify={() => notice("暂无新通知")} onUpgrade={() => notice("升级（演示）")} onNotice={notice} />}
                />
                {course ? (
                    <CoursePrepView
                        key={course.slug}
                        course={course}
                        lessonKey={params.get("l") ?? course.lessons[0].key}
                        prepared={prepared[course.slug] ?? []}
                        onLesson={(key) => go(course.slug, key)}
                        onBack={() => go()}
                        onMark={(key) => mark(course.slug, key)}
                        onNotice={notice}
                    />
                ) : (
                    <main className="gm-scroll relative min-w-0 flex-1 overflow-y-auto">
                        {/* 顶部切换：教学看板（默认）/ 课程资源 */}
                        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--gm-border)] bg-[var(--gm-bg)]/80 px-6 py-3 backdrop-blur">
                            <GammaTabs
                                label="教学中心"
                                size="sm"
                                value={tab}
                                onChange={(next) => router.push(next === "board" ? "/bluegamma/courses" : "/bluegamma/courses?v=library", { scroll: false })}
                                options={[
                                    { value: "board", label: "教学看板", icon: <LayoutDashboard className="size-3.5" /> },
                                    { value: "library", label: "课程资源", icon: <Library className="size-3.5" /> },
                                ]}
                            />
                        </div>
                        {tab === "board" ? (
                            <div className="px-6 pt-5 pb-16">
                                <TeachDashboard onPrep={(slug, lessonKey) => go(slug, lessonKey)} />
                            </div>
                        ) : (
                            <CourseList prepared={prepared} onOpen={go} />
                        )}
                    </main>
                )}
            </div>
            <GammaToastStack toasts={demo.toasts} onDismiss={demo.dismissToast} />
        </>
    );
}
