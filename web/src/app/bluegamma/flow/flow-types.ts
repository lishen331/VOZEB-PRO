/*
 * 专业创作流程（引导式画布）的数据结构。
 * 每个专业是一条 4–7 步的链：上一步的产出自动作为下一步的参考，学生按步骤推进就能做完一整套方案。
 * 步骤拆分参考了各专业真实的课程/作业流程；提示词里的 {课题} 会替换成学生填写的题目。
 */

export type FlowStepKind = "text" | "image" | "video" | "audio";

export interface FlowPreset {
    name: string;
    prompt: string;
}

export interface FlowStep {
    key: string;
    name: string;
    kind: FlowStepKind;
    /** 这一步要解决什么（给学生看的一句话） */
    goal: string;
    /** 以哪些上游步骤的产出作为参考（自动连线） */
    refs?: readonly string[];
    /** 模板库：选一个即可填好提示词 */
    presets: readonly FlowPreset[];
    /** 老师式的小提醒 */
    tip?: string;
    /** 文本类步骤的演示产出（要点） */
    sample?: readonly string[];
}

export interface MajorFlow {
    slug: string;
    /** 默认课题，学生可改 */
    brief: string;
    /** 全部完成后得到什么 */
    deliverable: string;
    steps: readonly FlowStep[];
}

/** 把提示词里的 {课题} 换成当前题目 */
export function fillBrief(prompt: string, brief: string) {
    return prompt.replaceAll("{课题}", brief.trim() || "我的课题");
}
