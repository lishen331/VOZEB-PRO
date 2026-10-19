import type { CourseChapter, CourseLesson, PlatformCourseDetail } from "@/lib/school-domain";

/*
 * 教学中心的页面层级（上下级关系只在这里定义一次，页面和测试都用它）：
 *
 *   L1  /teaching?tab=<tab>                                        教学中心（侧栏「教学中心」）
 *   L2  /teaching/courses/<assignmentId>?lesson=<id>&from=<tab>    课程备课
 *
 * - L1 的标签页写进 URL，所以从 L2 返回能回到原来的标签页（from 参数记录从哪个标签进来）
 * - L2 内切换课时用 replace，不新增历史记录：浏览器后退和页面左上角「返回」都回到 L1
 * - 放映、布置作业、上传资料都是 L2 上的浮层，不占路由
 */

export const TEACHING_TABS = ["prep", "classes", "assignments", "submissions", "orders"] as const;
export type TeachingTab = (typeof TEACHING_TABS)[number];
export const DEFAULT_TEACHING_TAB: TeachingTab = "prep";

export const TEACHING_TAB_LABELS: Record<TeachingTab, string> = {
    prep: "备课",
    classes: "我的班级",
    assignments: "作业",
    submissions: "学生提交",
    orders: "商单任务",
};

export function parseTeachingTab(value: string | null | undefined): TeachingTab {
    return TEACHING_TABS.includes(value as TeachingTab) ? (value as TeachingTab) : DEFAULT_TEACHING_TAB;
}

/** L1：教学中心某个标签页；默认标签不带参数，保持地址干净 */
export function teachingHref(tab: TeachingTab = DEFAULT_TEACHING_TAB) {
    return tab === DEFAULT_TEACHING_TAB ? "/teaching" : `/teaching?tab=${tab}`;
}

/** L2：某门课的备课页，可指定课时和来源标签 */
export function teachingCourseHref(assignmentId: string, options: { lessonId?: string; from?: TeachingTab } = {}) {
    const params = new URLSearchParams();
    if (options.lessonId) params.set("lesson", options.lessonId);
    if (options.from && options.from !== DEFAULT_TEACHING_TAB) params.set("from", options.from);
    const query = params.toString();
    return `/teaching/courses/${encodeURIComponent(assignmentId)}${query ? `?${query}` : ""}`;
}

export type PrepLesson = CourseLesson & { chapter: CourseChapter; number: number };

/** 章节树压平成按顺序编号的课时列表（第 1 课、第 2 课……跨章连续编号） */
export function flattenLessons(tree: Pick<PlatformCourseDetail, "chapters">): PrepLesson[] {
    const chapters = [...tree.chapters].sort((a, b) => a.sortOrder - b.sortOrder);
    let number = 0;
    return chapters.flatMap((chapter) =>
        [...chapter.lessons]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((lesson) => {
                number += 1;
                return { ...lesson, chapter, number };
            }),
    );
}

/** 要打开的课时：地址里指定的 → 第一节没备的 → 第一节 */
export function resolvePrepLesson(lessons: readonly PrepLesson[], requestedId: string | null | undefined, prepared: readonly string[] = []) {
    return lessons.find((lesson) => lesson.id === requestedId) ?? lessons.find((lesson) => !prepared.includes(lesson.id)) ?? lessons[0] ?? null;
}

/** 返回上一级：回到进来时的教学中心标签页 */
export function prepBackHref(from: string | null | undefined) {
    return teachingHref(parseTeachingTab(from));
}
