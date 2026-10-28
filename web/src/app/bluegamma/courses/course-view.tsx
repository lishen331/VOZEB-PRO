"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { ArrowRight, Check, ChevronLeft, ClipboardCheck, Clock3, Inbox, LayoutDashboard, Layers, Library, PackageCheck, Presentation, Target, Users } from "lucide-react";

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
import { CourseDetail } from "@/app/bluegamma/courses/course-detail";
import { CoursePresent } from "@/app/bluegamma/courses/course-present";
import { TeachingClassesTab } from "@/app/bluegamma/courses/teaching-classes-tab";
import { TeachingAssignmentsTab } from "@/app/bluegamma/courses/teaching-assignments-tab";
import { TeachingSubmissionsTab } from "@/app/bluegamma/courses/teaching-submissions-tab";
import { TeachingOrdersTab } from "@/app/bluegamma/courses/teaching-orders-tab";
import { setPrepared, useTeachingStore } from "@/app/bluegamma/courses/teaching-store";

/** 侧栏与首页一致（课程入口已在 GAMMA_RAIL_ITEMS 里），当前页高亮「课程」 */
const SIDEBAR_ITEMS = GAMMA_RAIL_ITEMS.filter((item) => item.key !== "home" && item.key !== "kling-home").map((item) => (item.group === "more" ? { ...item, group: "community" } : item));

/** 备课页：左大纲 · 中课件 · 右教案 */
function CoursePrepView({
    course,
    lessonKey,
    prepared,
    onLesson,
    onBack,
    onMark,
    onNotice,
    onOpenAssignments,
    onOpenCourseList,
}: {
    course: Course;
    lessonKey: string;
    prepared: readonly string[];
    onLesson: (key: string, replace?: boolean) => void;
    onBack: () => void;
    onMark: (key: string, done: boolean) => void;
    onNotice: (message: string) => void;
    onOpenAssignments: () => void;
    onOpenCourseList: () => void;
}) {
    const lesson = course.lessons.find((item) => item.key === lessonKey) ?? course.lessons[0];
    // 页码跟课节绑定：切到别的课节时立即从第 1 页开始（不经过一帧旧页码，避免误把新课节标成已备）
    const [cursor, setCursor] = useState({ key: lesson.key, page: 0 });
    const page = cursor.key === lesson.key ? cursor.page : 0;
    const setPage = useCallback((next: number) => setCursor({ key: lesson.key, page: next }), [lesson.key]);
    const [presenting, setPresenting] = useState(false);
    const done = prepared.includes(lesson.key);
    // 翻到最后一页自动标记；也可以手动取消 —— 真实项目里「标记已备」是可切换的，不能只增不减
    useEffect(() => {
        if (page === lesson.slides.length - 1) onMark(lesson.key, true);
    }, [lesson.key, lesson.slides.length, onMark, page]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center gap-3 border-b border-[var(--gm-border)] px-5 py-3">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="返回上一级"
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full pr-3 pl-1.5 text-[13px] text-[var(--gm-text-2)] transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]"
                >
                    <ChevronLeft className="size-4" />
                    返回
                </button>
                <div className="min-w-0 flex-1">
                    {/* 面包屑三级：课程大厅 → 课程详情 → 当前课节，和「返回」按钮回的都是详情页 */}
                    <nav aria-label="当前位置" className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--gm-text-3)]">
                        <button type="button" onClick={onOpenCourseList} className="truncate hover:text-[var(--gm-text)]">
                            课程大厅
                        </button>
                        <span aria-hidden>/</span>
                        <button type="button" onClick={onBack} className="truncate hover:text-[var(--gm-text)]">
                            {course.title}
                        </button>
                        <span aria-hidden>/</span>
                        <span className="truncate">第 {lesson.index + 1} 课</span>
                    </nav>
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
                <GammaButton size="sm" variant={done ? "soft" : "outline"} icon={<Check className="size-4" />} onClick={() => onMark(lesson.key, !done)}>
                    {done ? "已备课" : "标记已备"}
                </GammaButton>
                <GammaButton size="sm" variant="ghost" onClick={() => onNotice("已加入本周课表（演示）")}>
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
                    <CourseOutline course={course} lessonKey={lesson.key} prepared={prepared} onPick={(key) => onLesson(key, true)} />
                </aside>
                <main className="gm-scroll min-w-0 overflow-y-auto p-5">
                    <SlideViewer course={course} lesson={lesson} page={page} onPage={setPage} onPresent={() => setPresenting(true)} />
                    <p className="mt-3 text-xs text-[var(--gm-text-3)]">← / → 翻页 · 翻到最后一页自动标记为已备</p>
                </main>
                {/* 平板竖屏：教案栏跨两列放到课件下面，固定高度内滚动 */}
                <aside className="flex min-h-0 flex-col border-[var(--gm-border)] bg-[var(--gm-bg-elevated)] max-lg:col-span-2 max-lg:h-[520px] max-lg:border-t lg:border-l">
                    <PrepPanel course={course} lesson={lesson} page={page} onPage={setPage} onOpenAssignments={onOpenAssignments} />
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
    const teaching = useTeachingStore();
    const prepared = teaching.prepared;
    const course = courseBySlug(params.get("c"));
    const lessonKeyParam = params.get("l");
    // 课程资源已独立成大厅 → 详情 → 备课的子页面链路，不再挤在顶部 tab 里；
    // 其余 5 个教学身份下的平行视角（看板/班级/作业/提交/商单）仍用 tab，彼此常互相跳转。
    const TABS = ["board", "classes", "assignments", "submissions", "orders"] as const;
    type Tab = (typeof TABS)[number];
    const tab: Tab = (TABS as readonly string[]).includes(params.get("v") ?? "") ? (params.get("v") as Tab) : "board";
    const presetClass = params.get("class") ?? undefined;
    // 返回目标：从哪个标签进的备课页就回哪个标签，没有就回默认看板
    const fromRaw = params.get("from") ?? "";
    const fromTab: Tab = (TABS as readonly string[]).includes(fromRaw) ? (fromRaw as Tab) : "board";
    const presetAssignment = params.get("assignment") ?? undefined;
    const showHall = !course && params.get("v") === "hall";
    const notice = useCallback((message: string) => demo.toast("info", message), [demo]);

    const goTab = useCallback(
        (next: Tab, extra?: Record<string, string>) => {
            const query = new URLSearchParams();
            if (next !== "board") query.set("v", next);
            for (const [key, value] of Object.entries(extra ?? {})) query.set(key, value);
            const search = query.toString();
            router.push(`/bluegamma/courses${search ? `?${search}` : ""}`, { scroll: false });
        },
        [router],
    );

    /**
     * 进出备课页。from 记录当前标签，返回时能回到原标签；
     * replace=true 用于课节间切换（不新增历史记录，浏览器后退直接回列表）。
     */
    const go = useCallback(
        (slug?: string, lessonKey?: string, options: { replace?: boolean; sourceTab?: string } = {}) => {
            const query = new URLSearchParams();
            if (slug) {
                query.set("c", slug);
                if (lessonKey) query.set("l", lessonKey);
                const source = options.sourceTab ?? (tab !== "board" ? tab : "");
                if (source) query.set("from", source);
            } else {
                // 不带课程 slug 调用 go() 统一表示「回课程大厅」，和默认落地的教学看板分开
                query.set("v", "hall");
            }
            const search = query.toString();
            const href = `/bluegamma/courses${search ? `?${search}` : ""}`;
            if (options.replace) router.replace(href, { scroll: false });
            else router.push(href, { scroll: false });
        },
        [router, tab],
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
                {course && lessonKeyParam ? (
                    <CoursePrepView
                        key={course.slug}
                        course={course}
                        lessonKey={lessonKeyParam}
                        prepared={prepared[course.slug] ?? []}
                        onLesson={(key, replace) => go(course.slug, key, { replace, sourceTab: params.get("from") ?? undefined })}
                        onBack={() => go(course.slug)}
                        onMark={(key, done) => setPrepared(course.slug, key, done)}
                        onNotice={notice}
                        onOpenAssignments={() => goTab("assignments")}
                        onOpenCourseList={() => go()}
                    />
                ) : course ? (
                    <CourseDetail key={course.slug} course={course} prepared={prepared[course.slug] ?? []} onBack={() => go()} onPrep={(lessonKey) => go(course.slug, lessonKey ?? course.lessons[0].key)} />
                ) : showHall ? (
                    <CourseList prepared={prepared} onOpen={(slug, lessonKey) => go(slug, lessonKey)} />
                ) : (
                    <main className="gm-scroll relative min-w-0 flex-1 overflow-y-auto">
                        {/* 顶部：教学工作台内 5 个平行视角用 tab 切换；课程资源是单独的大厅/详情/备课子页面链路，右边常驻入口跳过去 */}
                        <div className="sticky top-0 z-20 flex items-center gap-3 overflow-x-auto border-b border-[var(--gm-border)] bg-[var(--gm-bg)]/80 px-6 py-3 backdrop-blur">
                            <GammaTabs
                                label="教学中心"
                                size="sm"
                                value={tab}
                                onChange={(next) => goTab(next as Tab)}
                                options={[
                                    { value: "board", label: "教学看板", icon: <LayoutDashboard className="size-3.5" /> },
                                    { value: "classes", label: "我的班级", icon: <Users className="size-3.5" /> },
                                    { value: "assignments", label: "作业", icon: <ClipboardCheck className="size-3.5" /> },
                                    { value: "submissions", label: "学生提交", icon: <Inbox className="size-3.5" /> },
                                    { value: "orders", label: "商单任务", icon: <PackageCheck className="size-3.5" /> },
                                ]}
                            />
                            <GammaButton size="sm" variant="outline" className="ml-auto" icon={<Library className="size-3.5" />} trailingIcon={<ArrowRight className="size-3.5" />} onClick={() => go()}>
                                课程大厅
                            </GammaButton>
                        </div>
                        {tab === "board" ? (
                            <div className="px-6 pt-5 pb-16">
                                <TeachDashboard onPrep={(slug, lessonKey) => go(slug, lessonKey, { sourceTab: "board" })} />
                            </div>
                        ) : (
                            <div className="px-6 pt-5 pb-16">
                                {tab === "classes" ? (
                                    <TeachingClassesTab onPrep={(slug, lessonKey) => go(slug, lessonKey, { sourceTab: "classes" })} onAssign={(className) => goTab("assignments", { class: className })} />
                                ) : tab === "assignments" ? (
                                    <TeachingAssignmentsTab
                                        presetClass={presetClass}
                                        onOpenSubmissions={(assignmentId) => goTab("submissions", { assignment: assignmentId })}
                                        onOpenLesson={(slug, lessonKey) => go(slug, lessonKey || undefined, { sourceTab: "assignments" })}
                                    />
                                ) : tab === "submissions" ? (
                                    <TeachingSubmissionsTab presetAssignmentId={presetAssignment} onBackToAssignments={() => goTab("assignments")} />
                                ) : (
                                    <TeachingOrdersTab />
                                )}
                            </div>
                        )}
                    </main>
                )}
            </div>
            <GammaToastStack toasts={demo.toasts} onDismiss={demo.dismissToast} />
        </>
    );
}
