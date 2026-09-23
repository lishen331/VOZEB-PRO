import type { OneClickFilmExecutor, OneClickFilmStartInput, OneClickFilmTask, OneClickFilmStep, OneClickFilmTaskView } from "./types";
import { ONE_CLICK_FILM_SOURCE } from "./types";
const STEPS: Array<[OneClickFilmStep["key"], string]> = [
    ["script", "剧本"],
    ["assets", "资产"],
    ["storyboard", "分镜"],
    ["images", "分镜图"],
    ["videos", "分镜视频"],
    ["audio", "配音"],
    ["compose", "成片"],
];

/**
 * L「生成文本框架」跳过的步骤。
 *
 * 对应 L `startTextFrameworkPipeline`（其 title 写明「仅提取角色、场景、道具与生成分镜文本，
 * 不生成图片与视频」）。靠既有的 `skipped` 状态实现：`advanceOneClickFilmWorkflow` 已经会
 * 跳过 success/skipped 的步骤，所以不必另写一条推进路径。
 *
 * 标 skipped 而不是从 steps 里删掉：步骤列表要让用户看到"这几步被跳过了"，
 * 而且 view 的 progress 分母依赖完整步骤数。
 */
const TEXT_FRAMEWORK_SKIPPED: ReadonlySet<OneClickFilmStep["key"]> = new Set(["images", "videos", "audio", "compose"]);

export function createOneClickFilmWorkflow(input: OneClickFilmStartInput): OneClickFilmTask {
    const now = Date.now();
    return {
        id: `one-click-${crypto.randomUUID()}`,
        userId: input.userId,
        type: "render",
        taskKind: "one-click-film-workflow",
        source: ONE_CLICK_FILM_SOURCE,
        status: "pending",
        title: textFrameworkOnly(input) ? "生成文本框架" : "一键成片",
        clientRequestId: input.clientRequestId,
        projectId: input.projectId,
        createdAt: now,
        updatedAt: now,
        workflow: {
            source: ONE_CLICK_FILM_SOURCE,
            version: 1,
            projectId: input.projectId,
            sourceEpisodeId: input.sourceEpisodeId,
            episodeIds: input.episodeIds,
            options: input.options || {},
            inputSnapshot: input.inputSnapshot || {},
            steps: STEPS.map(([key, label]) => ({
                key,
                label,
                status: textFrameworkOnly(input) && TEXT_FRAMEWORK_SKIPPED.has(key) ? ("skipped" as const) : ("pending" as const),
                attempts: 0,
                childTaskIds: [],
                outputRefs: [],
            })),
            currentStepIndex: 0,
            childTaskIds: [],
            outputRefs: [],
            startedAt: now,
        },
    };
}
/** 是否只跑文本框架（L 的第二个入口）。模式放在 options 里，避免改动 StartInput 的既有形状。 */
function textFrameworkOnly(input: OneClickFilmStartInput) {
    return input.options?.mode === "text_framework";
}

export function oneClickFilmTaskView(task: OneClickFilmTask): OneClickFilmTaskView {
    const done = task.workflow.steps.filter((step) => step.status === "success" || step.status === "skipped").length;
    return {
        id: task.id,
        status: task.status,
        title: task.title,
        projectId: task.projectId,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        currentStep: task.workflow.steps[task.workflow.currentStepIndex]?.key,
        progress: Math.round((done / task.workflow.steps.length) * 100),
        steps: task.workflow.steps,
        childTaskIds: task.workflow.childTaskIds,
        outputRefs: task.workflow.outputRefs,
        error: task.error,
        paused: task.workflow.paused === true ? true : undefined,
    };
}
export async function advanceOneClickFilmWorkflow(task: OneClickFilmTask, executor: OneClickFilmExecutor, maxSteps = Infinity) {
    task.workflow.childTaskIds = [...new Set(task.workflow.childTaskIds)];
    if (task.status === "success" || task.status === "cancelled" || task.status === "error") return task;
    // L 的「暂停」只挡住"启动下一步"，已提交的子任务照常跑完，不撤单也不退款。
    if (task.workflow.paused) return task;
    let executedSteps = 0;
    for (let index = task.workflow.currentStepIndex; index < task.workflow.steps.length; index += 1) {
        const step = task.workflow.steps[index];
        if (step.status === "success" || step.status === "skipped") {
            task.workflow.currentStepIndex = index + 1;
            continue;
        }
        if (task.workflow.paused || executedSteps >= maxSteps) break;
        executedSteps += 1;
        step.status = "running";
        step.attempts += 1;
        task.status = "running";
        const result = await executor({ task, step });
        step.status = result.status === "success" ? "success" : "running";
        step.childTaskIds = result.childTaskIds || [];
        step.outputRefs = result.outputRefs || [];
        task.workflow.childTaskIds = [...new Set([...task.workflow.childTaskIds, ...step.childTaskIds])];
        task.workflow.outputRefs = dedupeOutputRefs([...task.workflow.outputRefs, ...step.outputRefs]);
        if (step.status === "running") break;
        task.workflow.currentStepIndex = index + 1;
    }
    if (task.workflow.currentStepIndex >= task.workflow.steps.length) {
        task.status = "success";
        task.workflow.finishedAt = Date.now();
    }
    task.updatedAt = Date.now();
    return task;
}
/** 暂停：只置标志位，不动步骤状态，父任务保持可继续。 */
export function pauseOneClickFilmWorkflow(task: OneClickFilmTask) {
    if (task.status === "success" || task.status === "error" || task.status === "cancelled") return task;
    task.workflow.paused = true;
    task.updatedAt = Date.now();
    return task;
}

/** 继续：清掉标志位即可，推进器下一轮会从 currentStepIndex 继续。 */
export function resumeOneClickFilmWorkflow(task: OneClickFilmTask) {
    if (!task.workflow.paused) return task;
    task.workflow.paused = undefined;
    task.updatedAt = Date.now();
    return task;
}

export function cancelOneClickFilmWorkflow(task: OneClickFilmTask) {
    if (task.status === "success" || task.status === "error" || task.status === "cancelled") return task;
    task.status = "cancelled";
    task.error = "用户取消一键成片";
    task.workflow.steps = task.workflow.steps.map((step) => (step.status === "running" ? { ...step, status: "cancelled" } : step));
    task.updatedAt = Date.now();
    return task;
}

function dedupeOutputRefs(refs: Array<Record<string, unknown>>) {
    const seen = new Set<string>();
    return refs.filter((ref) => {
        const key = String(ref.id || ref.url || ref.taskId || JSON.stringify(ref));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
