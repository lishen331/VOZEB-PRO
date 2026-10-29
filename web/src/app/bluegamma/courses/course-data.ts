import { MAJOR_FLOWS } from "@/app/bluegamma/flow/flow-data";
import { fillBrief, type FlowStep, type MajorFlow } from "@/app/bluegamma/flow/flow-types";
import { gammaSubjectBySlug, type GammaSubject } from "@/components/gamma-ui/gamma-subjects";

/*
 * 教师备课的演示数据（本地，不调接口）。
 * 每门课 = 一个专业的创作流程：流程里的每一步就是一节课，课件 / 教案 / 任务单都从步骤数据生成，
 * 这样老师备的课和学生在引导画布里走的步骤是同一套。
 */

export type CourseFamily = "space" | "visual" | "media";

export const COURSE_FAMILIES: readonly { key: CourseFamily; label: string; slugs: readonly string[] }[] = [
    { key: "space", label: "空间与造型", slugs: ["interior", "fashion", "product", "ceramics", "jewelry"] },
    { key: "visual", label: "平面与商业", slugs: ["advertising", "visual-communication", "ecommerce"] },
    { key: "media", label: "影像与叙事", slugs: ["film", "digital-media", "animation", "game-art"] },
];

export const GRADES = ["大一", "大二", "大三", "大四"] as const;
export type Grade = (typeof GRADES)[number];

export type SlideKind = "cover" | "goals" | "position" | "concept" | "prompt" | "practice" | "summary";

export interface Slide {
    kind: SlideKind;
    title: string;
    /** 每页的讲解提示（演讲者备注） */
    note: string;
    bullets?: readonly string[];
    code?: string;
}

export interface LessonPhase {
    name: string;
    minutes: number;
    content: string;
}

export interface Lesson {
    key: string;
    index: number;
    title: string;
    kind: FlowStep["kind"];
    goal: string;
    objectives: readonly string[];
    keyPoints: readonly string[];
    difficulty: string;
    phases: readonly LessonPhase[];
    slides: readonly Slide[];
    task: readonly string[];
    videoMinutes: number;
}

export interface Course {
    slug: string;
    title: string;
    subtitle: string;
    subject: GammaSubject;
    family: CourseFamily;
    grade: Grade;
    hours: number;
    brief: string;
    deliverable: string;
    lessons: readonly Lesson[];
    updated: string;
    official: boolean;
}

const KIND_VERB: Record<FlowStep["kind"], string> = { text: "撰写", image: "生成", video: "制作", audio: "合成" };
const GRADE_OF: Record<CourseFamily, Grade> = { space: "大二", visual: "大二", media: "大三" };

function lessonOf(flow: MajorFlow, step: FlowStep, index: number): Lesson {
    const upstream = (step.refs ?? []).map((ref) => flow.steps.find((item) => item.key === ref)?.name).filter((name): name is string => Boolean(name));
    const preset = step.presets[0];
    const prompt = preset ? fillBrief(preset.prompt, flow.brief) : "";
    const objectives = [
        `理解「${step.name}」在${gammaSubjectBySlug(flow.slug).name}流程中的作用`,
        `能用 AI ${KIND_VERB[step.kind]}${step.name}产出，并说明设计依据`,
        upstream.length ? `学会把「${upstream.join("、")}」的成果作为参考输入` : "学会把课题拆成可执行的提示词",
    ];
    const keyPoints = [step.goal, ...(step.tip ? [step.tip] : [])];
    const phases: LessonPhase[] = [
        { name: "导入", minutes: 5, content: `展示往届「${step.name}」优秀作业，提问：这一步解决什么问题？` },
        { name: "讲授", minutes: 15, content: `讲解${step.goal}；对比好 / 差两组案例。` },
        { name: "示范", minutes: 15, content: `现场用「${preset?.name ?? "模板"}」演示一次完整${KIND_VERB[step.kind]}过程，说明参数怎么选。` },
        { name: "练习", minutes: 40, content: "学生在专业画布中完成本步，产出至少 2 版，选 1 版提交。" },
        { name: "点评", minutes: 15, content: "随机抽 3 份作业投屏点评，记录共性问题。" },
    ];
    const slides: Slide[] = [
        { kind: "cover", title: step.name, note: "开场 1 分钟：说明本节课在整个课程里的位置。" },
        { kind: "goals", title: "本节课你将学会", bullets: objectives, note: "逐条读出目标，下课前回到这页对照。" },
        { kind: "position", title: "我们在流程的哪一步", note: "指出上一步的成果会作为这一步的参考。" },
        { kind: "concept", title: "这一步要解决什么", bullets: keyPoints, note: "举一个真实项目的例子，避免只讲概念。" },
        { kind: "prompt", title: "示范提示词", code: prompt, bullets: step.presets.map((item) => item.name), note: "边念边解释每个关键词的作用，提醒学生替换成自己的课题。" },
        { kind: "practice", title: "课堂练习 · 40 分钟", bullets: [`课题：${flow.brief}`, `在画布中完成「${step.name}」`, "至少生成 2 版，挑 1 版写 50 字设计说明"], note: "巡场重点看提示词是否结合了自己的课题。" },
        { kind: "summary", title: "小结与作业", bullets: [`本节产出：${step.name}`, index + 1 < flow.steps.length ? `下节课：${flow.steps[index + 1].name}` : "下节课：作品集整理与答辩"], note: "布置作业并说明提交方式。" },
    ];
    return {
        key: step.key,
        index,
        title: step.name,
        kind: step.kind,
        goal: step.goal,
        objectives,
        keyPoints,
        difficulty: upstream.length > 1 ? `需要同时消化 ${upstream.length} 个上游成果，学生容易顾此失彼` : "提示词容易写得空泛，要引导学生加入课题的具体信息",
        phases,
        slides,
        task: [`课题：${flow.brief}`, `完成「${step.name}」：${step.goal}`, "提交：最终版 1 份 + 过程版 1 份 + 50 字说明"],
        videoMinutes: 6 + ((index * 3) % 7),
    };
}

const UPDATED = ["2026-10-12", "2026-10-09", "2026-10-03", "2026-09-28", "2026-09-21", "2026-09-15"];

export const COURSES: readonly Course[] = MAJOR_FLOWS.map((flow, index) => {
    const subject = gammaSubjectBySlug(flow.slug);
    const family = COURSE_FAMILIES.find((item) => item.slugs.includes(flow.slug))?.key ?? "space";
    return {
        slug: flow.slug,
        title: `AIGC + ${subject.name}全流程实训`,
        subtitle: subject.tagline,
        subject,
        family,
        grade: index % 4 === 0 ? "大三" : GRADE_OF[family],
        hours: flow.steps.length * 2,
        brief: flow.brief,
        deliverable: flow.deliverable,
        lessons: flow.steps.map((step, stepIndex) => lessonOf(flow, step, stepIndex)),
        updated: UPDATED[index % UPDATED.length],
        official: index % 3 !== 2,
    };
});

export function courseBySlug(slug: string | null | undefined) {
    return COURSES.find((course) => course.slug === slug) ?? null;
}
