/*
 * 老师的课时教案（前后端共用的结构、清洗和完整度检查）。
 * 一份教案 = 学校课程 × 课时 × 老师；只属于老师自己，不绑定班级。
 * 服务端写入前一律走 normalizeLessonPlanContent，前端编辑器也用它兜底旧数据。
 */

export type LessonPlanStatus = "draft" | "ready";

export type LessonPlanPhase = {
    id: string;
    /** 环节名称，例如「导入」「示范讲解」 */
    name: string;
    minutes: number;
    /** 教师活动：老师在这个环节做什么、怎么讲 */
    teacher: string;
    /** 学生活动：学生在这个环节做什么、产出什么 */
    student: string;
    /** 讲解要点 / 话术：试讲时显示在讲者备注区 */
    notes: string;
    /** 这个环节要放映的课时资料 */
    materialIds: string[];
};

export type LessonPlanContent = {
    objectives: string[];
    keyPoints: string;
    difficulties: string;
    preparation: string;
    phases: LessonPlanPhase[];
    homework: string;
    reflection: string;
};

export type LessonPlanRehearsal = {
    at: string;
    totalSeconds: number;
    phases: { phaseId: string; name: string; plannedMinutes: number; seconds: number }[];
};

export type TeachingLessonPlan = {
    id: string;
    assignmentId: string;
    lessonId: string;
    status: LessonPlanStatus;
    content: LessonPlanContent;
    lastRehearsal: LessonPlanRehearsal | null;
    rehearsalCount: number;
    createdAt: string;
    updatedAt: string;
};

/** 列表用的摘要（不带正文），用于教学中心的备课进度和大纲状态 */
export type TeachingLessonPlanSummary = Pick<TeachingLessonPlan, "assignmentId" | "lessonId" | "status" | "rehearsalCount" | "updatedAt"> & { totalMinutes: number };

export type LessonPlanSaveInput = { content: unknown; status?: unknown; baseUpdatedAt?: unknown };
export type LessonPlanRehearsalInput = { totalSeconds: unknown; phases: unknown };

export const LESSON_PLAN_LIMITS = {
    objectives: 12,
    objectiveLength: 300,
    textLength: 3000,
    phases: 20,
    phaseNameLength: 40,
    phaseMinutes: 240,
    materialIds: 20,
    idLength: 80,
} as const;

const MAX_REHEARSAL_SECONDS = 12 * 60 * 60;

export function emptyLessonPlanContent(): LessonPlanContent {
    return { objectives: [], keyPoints: "", difficulties: "", preparation: "", phases: [], homework: "", reflection: "" };
}

export function isLessonPlanStatus(value: unknown): value is LessonPlanStatus {
    return value === "draft" || value === "ready";
}

function cleanText(value: unknown, max: number) {
    return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}

function cleanId(value: unknown) {
    return typeof value === "string" ? value.trim().slice(0, LESSON_PLAN_LIMITS.idLength) : "";
}

function cleanMinutes(value: unknown) {
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    return Number.isFinite(number) ? Math.min(LESSON_PLAN_LIMITS.phaseMinutes, Math.max(0, Math.round(number))) : 0;
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizePhase(value: unknown, index: number): LessonPlanPhase {
    const source = record(value);
    const materialIds = Array.isArray(source.materialIds) ? [...new Set(source.materialIds.map(cleanId).filter(Boolean))].slice(0, LESSON_PLAN_LIMITS.materialIds) : [];
    return {
        id: cleanId(source.id) || `phase-${index + 1}`,
        name: cleanText(source.name, LESSON_PLAN_LIMITS.phaseNameLength),
        minutes: cleanMinutes(source.minutes),
        teacher: cleanText(source.teacher, LESSON_PLAN_LIMITS.textLength),
        student: cleanText(source.student, LESSON_PLAN_LIMITS.textLength),
        notes: cleanText(source.notes, LESSON_PLAN_LIMITS.textLength),
        materialIds,
    };
}

/** 清洗任意输入成合法教案：截断超长文本、丢掉空目标、环节 id 去重 */
export function normalizeLessonPlanContent(value: unknown): LessonPlanContent {
    const source = record(value);
    const objectives = Array.isArray(source.objectives)
        ? source.objectives
              .map((item) => cleanText(item, LESSON_PLAN_LIMITS.objectiveLength))
              .filter(Boolean)
              .slice(0, LESSON_PLAN_LIMITS.objectives)
        : [];
    const seen = new Set<string>();
    const phases = (Array.isArray(source.phases) ? source.phases.slice(0, LESSON_PLAN_LIMITS.phases) : []).map((item, index) => {
        const phase = normalizePhase(item, index);
        const id = seen.has(phase.id) ? `${phase.id}-${index + 1}` : phase.id;
        seen.add(id);
        return { ...phase, id };
    });
    return {
        objectives,
        keyPoints: cleanText(source.keyPoints, LESSON_PLAN_LIMITS.textLength),
        difficulties: cleanText(source.difficulties, LESSON_PLAN_LIMITS.textLength),
        preparation: cleanText(source.preparation, LESSON_PLAN_LIMITS.textLength),
        phases,
        homework: cleanText(source.homework, LESSON_PLAN_LIMITS.textLength),
        reflection: cleanText(source.reflection, LESSON_PLAN_LIMITS.textLength),
    };
}

export function lessonPlanTotalMinutes(content: { phases: readonly Pick<LessonPlanPhase, "minutes">[] }) {
    return content.phases.reduce((sum, phase) => sum + phase.minutes, 0);
}

/** 标记「已备课」前必须补齐的项（空数组 = 可以标记） */
export function lessonPlanMissingItems(content: LessonPlanContent): string[] {
    const missing: string[] = [];
    if (!content.objectives.length) missing.push("至少写 1 条教学目标");
    if (!content.keyPoints) missing.push("填写教学重点");
    if (!content.phases.length) missing.push("至少安排 1 个教学环节");
    content.phases.forEach((phase, index) => {
        const label = phase.name || `第 ${index + 1} 个环节`;
        if (!phase.name) missing.push(`给第 ${index + 1} 个环节起名`);
        if (!phase.minutes) missing.push(`「${label}」设置时长`);
        if (!phase.teacher) missing.push(`「${label}」填写教师活动`);
    });
    return missing;
}

/**
 * 老师第一次打开某课时、平台也没有默认教案时的起步教案：
 * 按一节 90 分钟的 AIGC 实训课给出常用的五段式结构，文字是写法提示，老师替换成自己的内容。
 */
export function starterLessonPlan(lesson: { title: string; description?: string }, materialIds: readonly string[] = []): LessonPlanContent {
    const topic = lesson.title.trim() || "本课时";
    const brief = lesson.description?.trim();
    return {
        objectives: [`说清楚「${topic}」要解决什么问题、产出什么`, `能独立用 AI 工具完成「${topic}」的课堂产出，并说明取舍依据`, "能按评价标准检查自己的作品并提出 1 条改进"],
        keyPoints: brief ? `${brief}\n（把课程方的要求改写成本节课学生必须掌握的 1–2 个要点）` : `「${topic}」的核心方法：从需求到提示词、从结果到筛选。`,
        difficulties: "学生最容易卡住的地方：描述不具体导致结果随机。准备 1 组「模糊描述 vs 具体描述」的对比示范。",
        preparation: "课件与示范素材已上传到本课时资料\n提前用自己的账号跑一遍示范流程，确认模型和积分可用\n准备 2–3 张往届优秀作品作为评价参照",
        phases: [
            { id: "phase-1", name: "导入", minutes: 10, teacher: `展示与「${topic}」相关的真实案例，提问：这个效果是怎么做出来的？`, student: "观察案例，说出自己的猜测", notes: "开场 1 分钟内抛出问题，不要先讲概念", materialIds: materialIds.slice(0, 1) },
            { id: "phase-2", name: "讲解示范", minutes: 25, teacher: "边讲边演示完整流程：拆需求 → 写提示词 → 生成 → 筛选与修改", student: "跟随记录关键步骤与参数", notes: "每一步停下来问一句「为什么这样写」", materialIds: materialIds.slice(1) },
            { id: "phase-3", name: "课堂实操", minutes: 35, teacher: "布置任务，巡视指导，收集典型问题", student: "按任务单独立完成，至少产出 2 版", notes: "第 15 分钟统一讲一次共性问题", materialIds: [] },
            { id: "phase-4", name: "展示点评", minutes: 15, teacher: "挑 3 份不同水平的作品点评，对照评价标准", student: "展示作品，说明设计依据，互评", notes: "先肯定再指出 1 个可改进点", materialIds: [] },
            { id: "phase-5", name: "小结", minutes: 5, teacher: "回顾本课要点，布置课后作业", student: "记录作业要求", notes: "", materialIds: [] },
        ],
        homework: `完善课堂作品，提交最终版 + 不少于 100 字的设计说明（写清楚「${topic}」中的关键取舍）。`,
        reflection: "",
    };
}

/** 清洗试讲记录：只保留教案里存在的环节，秒数取整并限制上限 */
export function normalizeLessonPlanRehearsal(input: LessonPlanRehearsalInput, content: LessonPlanContent, at: string): LessonPlanRehearsal {
    const byId = new Map(content.phases.map((phase) => [phase.id, phase]));
    const seconds = (value: unknown) => {
        const number = typeof value === "number" ? value : Number.NaN;
        return Number.isFinite(number) ? Math.min(MAX_REHEARSAL_SECONDS, Math.max(0, Math.round(number))) : 0;
    };
    const phases = (Array.isArray(input.phases) ? input.phases : [])
        .map((item) => record(item))
        .flatMap((item) => {
            const phase = byId.get(cleanId(item.phaseId));
            return phase ? [{ phaseId: phase.id, name: phase.name, plannedMinutes: phase.minutes, seconds: seconds(item.seconds) }] : [];
        });
    return { at, totalSeconds: seconds(input.totalSeconds), phases };
}
