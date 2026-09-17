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
export function createOneClickFilmWorkflow(input: OneClickFilmStartInput): OneClickFilmTask {
    const now = Date.now();
    return {
        id: `one-click-${crypto.randomUUID()}`,
        userId: input.userId,
        type: "render",
        taskKind: "one-click-film-workflow",
        source: ONE_CLICK_FILM_SOURCE,
        status: "pending",
        title: "一键成片",
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
            steps: STEPS.map(([key, label]) => ({ key, label, status: "pending", attempts: 0, childTaskIds: [], outputRefs: [] })),
            currentStepIndex: 0,
            childTaskIds: [],
            outputRefs: [],
            startedAt: now,
        },
    };
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
    };
}
export async function advanceOneClickFilmWorkflow(task: OneClickFilmTask, executor: OneClickFilmExecutor) {
    task.workflow.childTaskIds = [...new Set(task.workflow.childTaskIds)];
    if (task.status === "success" || task.status === "cancelled" || task.status === "error") return task;
    for (let index = task.workflow.currentStepIndex; index < task.workflow.steps.length; index += 1) {
        const step = task.workflow.steps[index];
        if (step.status === "success" || step.status === "skipped") {
            task.workflow.currentStepIndex = index + 1;
            continue;
        }
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
