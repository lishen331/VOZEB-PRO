import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Dynamic task doubles intentionally mirror several persisted task shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTask = Record<string, any>;

const mocks = vi.hoisted(() => ({
    tasks: new Map<string, AnyTask>(),
    projects: new Map<string, AnyTask>(),
    getDramaProject: vi.fn(),
    updateDramaProject: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    getDramaLabCollaborationForUser: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
    extractDramaLabAssets: vi.fn(),
    extractDramaLabStoryboards: vi.fn(),
    createStoredGenerationTask: vi.fn(),
    getStoredGenerationTask: vi.fn(),
    getStoredGenerationTaskByRequest: vi.fn(),
    linkStoredGenerationTask: vi.fn(),
    mutateStoredGenerationTask: vi.fn(),
    queryStoredGenerationTasks: vi.fn(),
    scheduleGenerationTask: vi.fn(),
    getImageTask: vi.fn(),
    getVideoTask: vi.fn(),
    runGenerationTaskRecoveryBatch: vi.fn(),
    reviewDramaLabWorkflowOutputs: vi.fn(),
    exportDramaLabProjectForUser: vi.fn(),
    writeDramaLabWorkflowExportArtifact: vi.fn(),
    readDramaLabWorkflowExportArtifact: vi.fn(),
}));

vi.mock("@/lib/server/drama-project-store", () => ({
    getDramaProject: mocks.getDramaProject,
    updateDramaProject: mocks.updateDramaProject,
}));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    getDramaLabCollaborationForUser: mocks.getDramaLabCollaborationForUser,
    assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed,
}));
vi.mock("@/lib/server/drama-lab-asset-extraction-service", () => ({
    extractDramaLabAssets: mocks.extractDramaLabAssets,
}));
vi.mock("@/lib/server/drama-lab-storyboard-extraction-service", () => ({
    extractDramaLabStoryboards: mocks.extractDramaLabStoryboards,
}));
vi.mock("@/lib/server/generation-task-store", () => ({
    createStoredGenerationTask: mocks.createStoredGenerationTask,
    getStoredGenerationTask: mocks.getStoredGenerationTask,
    getStoredGenerationTaskByRequest: mocks.getStoredGenerationTaskByRequest,
    linkStoredGenerationTask: mocks.linkStoredGenerationTask,
    mutateStoredGenerationTask: mocks.mutateStoredGenerationTask,
    queryStoredGenerationTasks: mocks.queryStoredGenerationTasks,
}));
vi.mock("@/lib/server/image-task-store", () => ({ getImageTask: mocks.getImageTask }));
vi.mock("@/lib/server/video-task-store", () => ({ getVideoTask: mocks.getVideoTask }));
vi.mock("@/lib/server/generation-task-recovery-service", () => ({ runGenerationTaskRecoveryBatch: mocks.runGenerationTaskRecoveryBatch }));
vi.mock("@/lib/server/generation-task-scheduler", () => ({ scheduleGenerationTask: mocks.scheduleGenerationTask }));
vi.mock("@/lib/server/drama-lab-workflow-review-service", () => ({ reviewDramaLabWorkflowOutputs: mocks.reviewDramaLabWorkflowOutputs }));
vi.mock("@/lib/server/drama-lab-project-archive", () => ({ exportDramaLabProjectForUser: mocks.exportDramaLabProjectForUser }));
vi.mock("@/lib/server/drama-lab-workflow-export-artifact", () => ({
    writeDramaLabWorkflowExportArtifact: mocks.writeDramaLabWorkflowExportArtifact,
    readDramaLabWorkflowExportArtifact: mocks.readDramaLabWorkflowExportArtifact,
}));

import { advanceDramaLabWorkflow, cancelDramaLabWorkflow, findActiveDramaLabWorkflow, getDramaLabWorkflowTask, resumeDramaLabWorkflow, startDramaLabWorkflow } from "./drama-lab-workflow-task-service";
import type { StartDramaLabWorkflowInput } from "./drama-lab-workflow-task-service";

let project: AnyTask;

describe("drama lab workflow task service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tasks.clear();
        mocks.projects.clear();
        project = projectFixture();
        mocks.projects.set(project.id, project);

        mocks.getDramaProject.mockImplementation(async (projectId: string, userId: string) => {
            if (userId !== "user-one") return null;
            return mocks.projects.get(projectId) || null;
        });
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async (userId: string, projectId: string) => {
            const resolved = mocks.projects.get(projectId);
            if (userId !== "user-one" || !resolved) throw Object.assign(new Error("not found"), { status: 404 });
            return { project: resolved, ownerUserId: "user-one" };
        });
        mocks.getDramaLabCollaborationForUser.mockResolvedValue({ members: [{ userId: "user-one" }] });
        mocks.updateDramaProject.mockImplementation(async (_userId: string, next: AnyTask) => next);
        mocks.extractDramaLabAssets.mockResolvedValue({ assets: [] });
        mocks.extractDramaLabStoryboards.mockResolvedValue({ shots: [], truncated: false, recoveredCount: 0, duplicateCount: 0, continuationAttempts: 0 });
        mocks.runGenerationTaskRecoveryBatch.mockResolvedValue(undefined);

        mocks.createStoredGenerationTask.mockImplementation(async (type: string, task: AnyTask) => {
            const stored = structuredClone(task);
            mocks.tasks.set(`${type}:${task.id}`, stored);
            return structuredClone(stored);
        });
        mocks.getStoredGenerationTask.mockImplementation(async (type: string, id: string) => {
            const task = mocks.tasks.get(`${type}:${id}`);
            return task ? structuredClone(task) : null;
        });
        mocks.getStoredGenerationTaskByRequest.mockImplementation(async (type: string, userId: string, requestId: string) => {
            const task = [...mocks.tasks.entries()]
                .filter(([key]) => key.startsWith(`${type}:`))
                .map(([, value]) => value)
                .find((value) => value.userId === userId && value.clientRequestId === requestId);
            return task ? structuredClone(task) : null;
        });
        mocks.queryStoredGenerationTasks.mockImplementation(async (type: string, options: AnyTask) => {
            return [...mocks.tasks.entries()]
                .filter(([key]) => key.startsWith(`${type}:`))
                .map(([, value]) => value)
                .filter(
                    (value) =>
                        value.userId === options.userId && (!options.projectId || value.projectId === options.projectId) && (!options.surface || value.surface === options.surface) && (!options.statuses?.length || options.statuses.includes(value.status)),
                )
                .map((value) => structuredClone(value));
        });
        mocks.linkStoredGenerationTask.mockImplementation(async (type: string, id: string, context: AnyTask) => {
            const key = `${type}:${id}`;
            const current = mocks.tasks.get(key);
            if (!current) return;
            const next = { ...current, ...context, payload: { ...(current.payload || {}), ...context } };
            mocks.tasks.set(key, next);
        });
        mocks.mutateStoredGenerationTask.mockImplementation(async (type: string, id: string, _ttl: number, mutator: (current: AnyTask) => AnyTask | null) => {
            const key = `${type}:${id}`;
            const current = mocks.tasks.get(key);
            if (!current) return null;
            const next = mutator(structuredClone(current));
            if (!next) return null;
            mocks.tasks.set(key, structuredClone(next));
            return structuredClone(next);
        });

        mocks.getImageTask.mockResolvedValue(null);
        mocks.getVideoTask.mockResolvedValue(null);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ code: 0 }), { status: 200, headers: { "Content-Type": "application/json" } })),
        );
    });

    afterAll(() => vi.unstubAllGlobals());

    it("persists extraction constraints and rejects a conflicting active request", async () => {
        const first = await startDramaLabWorkflow(startInput({ options: { mode: "storyboard_extract", scope: "current", storyboardOptions: { shotCount: 12, totalDuration: 90.5 } } }));
        expect(first.workflow.options).toMatchObject({ storyboardOptions: { shotCount: 12, totalDuration: 90.5 } });
        const stored = await getDramaLabWorkflowTask(first.id, "user-one");
        expect(stored?.workflow.options).toMatchObject({ storyboardOptions: { shotCount: 12, totalDuration: 90.5 } });
        await expect(startDramaLabWorkflow(startInput({ requestId: "different", options: { mode: "storyboard_extract", scope: "current", storyboardOptions: { shotCount: 2 } } }))).rejects.toMatchObject({ status: 409 });
    });

    it("forwards stored constraints when advancing or resuming an extraction", async () => {
        const task = await startDramaLabWorkflow(startInput({ options: { mode: "storyboard_extract", scope: "current", storyboardOptions: { shotCount: 12, totalDuration: 90.5 } } }));
        await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id });
        expect(mocks.extractDramaLabStoryboards).toHaveBeenCalledWith(expect.objectContaining({ options: { shotCount: 12, totalDuration: 90.5 } }));
        const cancelled = await cancelDramaLabWorkflow(task, "user-one");
        expect(cancelled).not.toBeNull();
        const resumed = await resumeDramaLabWorkflow(cancelled!, "user-one");
        expect(resumed?.workflow.options.storyboardOptions).toEqual({ shotCount: 12, totalDuration: 90.5 });
    });

    it("is idempotent for the same client request id", async () => {
        const first = await startDramaLabWorkflow(startInput({ requestId: "request-one" }));
        const second = await startDramaLabWorkflow(startInput({ requestId: "request-one" }));

        expect(second.id).toBe(first.id);
        expect(mocks.createStoredGenerationTask).toHaveBeenCalledTimes(1);
        expect(mocks.getStoredGenerationTaskByRequest).toHaveBeenCalledTimes(2);
    });

    it("deduplicates a second active workflow for the same project", async () => {
        const first = await startDramaLabWorkflow(startInput({ requestId: "request-one" }));
        const second = await startDramaLabWorkflow(startInput({ requestId: "request-two" }));

        expect(second.id).toBe(first.id);
        expect(mocks.createStoredGenerationTask).toHaveBeenCalledTimes(1);
        expect(await findActiveDramaLabWorkflow("user-one", project.id)).toMatchObject({ id: first.id });
    });

    it("rejects reusing a request id for a different project", async () => {
        const first = await startDramaLabWorkflow(startInput({ requestId: "request-shared" }));
        const otherProject = { ...project, id: "project-two" };
        mocks.projects.set(otherProject.id, otherProject);

        await expect(startDramaLabWorkflow(startInput({ projectId: otherProject.id, requestId: "request-shared" }))).rejects.toMatchObject({ status: 409 });
        expect(first.id).toBeDefined();
        expect(mocks.createStoredGenerationTask).toHaveBeenCalledTimes(1);
    });

    it("repairs a persisted synthetic child when the parent snapshot missed it", async () => {
        const task = workflowTask({ status: "running", workflow: workflowState({ steps: [step("script", "running")] }) });
        mocks.tasks.set(`render:${task.id}`, task);
        const orphan = child("orphan-script", "render", "running");
        orphan.key = "script:episode-one";
        orphan.parentTaskId = task.id;
        mocks.tasks.set(`render:${orphan.id}`, { id: orphan.id, userId: "user-one", status: "running", surface: "drama", projectId: project.id, parentTaskId: task.id, workflowChild: { ...orphan } });

        const advanced = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id });

        expect(advanced).toMatchObject({ status: "success" });
        expect(mocks.createStoredGenerationTask).toHaveBeenCalledTimes(0);
        expect(mocks.tasks.get(`render:${task.id}`)?.workflow.children).toEqual(expect.arrayContaining([expect.objectContaining({ id: "orphan-script", key: "script:episode-one", status: "success" })]));
    });

    it("fails closed when reading or changing a workflow owned by another user/project", async () => {
        const task = workflowTask({ userId: "user-one", workflow: workflowState({ projectId: project.id }) });
        mocks.tasks.set(`render:${task.id}`, task);

        await expect(getDramaLabWorkflowTask(task.id, "user-two")).resolves.toBeNull();
        await expect(getDramaLabWorkflowTask(task.id, "user-one", "project-other")).resolves.toBeNull();
        await expect(cancelDramaLabWorkflow(task as never, "user-two")).resolves.toBeNull();
        await expect(resumeDramaLabWorkflow(task as never, "user-two")).resolves.toBeNull();
    });

    it("allows an active collaborator to read, cancel, and resume the owner's workflow", async () => {
        const task = workflowTask({
            userId: "user-one",
            status: "running",
            workflow: workflowState({ projectId: project.id, steps: [step("script", "running")] }),
        });
        mocks.tasks.set(`render:${task.id}`, task);
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async (userId: string, projectId: string) => {
            if (!["user-one", "member-two"].includes(userId) || projectId !== project.id) throw Object.assign(new Error("not found"), { status: 404 });
            return { project, ownerUserId: "user-one" };
        });

        await expect(getDramaLabWorkflowTask(task.id, "member-two", project.id)).resolves.toMatchObject({ id: task.id, userId: "user-one" });
        await expect(cancelDramaLabWorkflow(task as never, "member-two")).resolves.toMatchObject({ status: "cancelled" });

        const cancelled = mocks.tasks.get(`render:${task.id}`)!;
        await expect(resumeDramaLabWorkflow(cancelled as never, "member-two")).resolves.toMatchObject({ status: "pending" });
        expect(mocks.scheduleGenerationTask).toHaveBeenCalledWith("render", task.id, expect.objectContaining({ executionPhase: "created" }));
    });

    it("finds an active workflow created by the project owner for a collaborator", async () => {
        const task = workflowTask({ userId: "user-one", status: "running", workflow: workflowState({ projectId: project.id }) });
        mocks.tasks.set(`render:${task.id}`, task);
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async (userId: string, projectId: string) => {
            if (userId !== "member-two" || projectId !== project.id) throw Object.assign(new Error("not found"), { status: 404 });
            return { project, ownerUserId: "user-one" };
        });

        await expect(findActiveDramaLabWorkflow("member-two", project.id)).resolves.toMatchObject({ id: task.id, userId: "user-one" });
    });

    it("cancels pending children and resumes the cancelled workflow", async () => {
        const task = workflowTask({
            status: "running",
            userId: "user-one",
            workflow: workflowState({
                projectId: project.id,
                currentStepIndex: 1,
                steps: [step("script", "success"), step("assets", "running"), step("storyboard", "pending")],
                children: [child("image-task-one", "image", "running"), child("video-task-one", "video", "pending"), child("render-task-one", "render", "running")],
            }),
        });
        mocks.tasks.set(`render:${task.id}`, task);

        const cancelled = await cancelDramaLabWorkflow(task as never, "user-one", "http://workflow.test", "sid=one");
        expect(cancelled).toMatchObject({ status: "cancelled" });
        const fetchMock = vi.mocked(fetch);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls).toEqual(
            expect.arrayContaining([
                [expect.any(URL), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "cancelled" }), headers: expect.objectContaining({ cookie: "sid=one" }) })],
                [expect.any(URL), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "cancel" }), headers: expect.objectContaining({ cookie: "sid=one" }) })],
            ]),
        );
        expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining(["http://workflow.test/api/image-tasks/image-task-one", "http://workflow.test/api/video-tasks/video-task-one"]));

        const cancelledStored = mocks.tasks.get(`render:${task.id}`)!;
        expect(cancelledStored.workflow.steps.every((item: AnyTask) => item.status === "cancelled" || item.status === "success")).toBe(true);
        expect(cancelledStored.workflow.children.filter((item: AnyTask) => item.type !== "render").every((item: AnyTask) => item.status === "cancelled")).toBe(true);

        const resumed = await resumeDramaLabWorkflow(cancelledStored as never, "user-one");
        expect(resumed).toMatchObject({ status: "pending" });
        expect(resumed?.workflow.currentStepIndex).toBe(1);
        expect(resumed?.workflow.steps[1].status).toBe("pending");
        expect(mocks.scheduleGenerationTask).toHaveBeenCalledWith("render", task.id, expect.objectContaining({ executionPhase: "created", nextPollAt: expect.any(Number) }));
    });

    it("turns a strict-stage rejection into a resumable workflow error", async () => {
        const task = workflowTask({ status: "running", workflow: workflowState({ steps: [step("assets", "running")] }) });
        mocks.tasks.set(`render:${task.id}`, task);
        mocks.assertDramaLabStageAllowed.mockRejectedValueOnce(Object.assign(new Error("前置阶段尚未通过"), { status: 409 }));

        const result = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id });

        expect(result).toMatchObject({ status: "error", error: "前置阶段尚未通过" });
        expect(result?.workflow.steps[0]).toMatchObject({ status: "error", error: "前置阶段尚未通过" });
    });

    it("closes the synthetic storyboard child when extraction fails", async () => {
        const task = workflowTask({
            status: "running",
            workflow: workflowState({ currentStepIndex: 0, steps: [step("storyboard", "running")] }),
        });
        mocks.tasks.set(`render:${task.id}`, task);
        mocks.extractDramaLabStoryboards.mockRejectedValueOnce(new Error("upstream text channel rejected the request"));

        const result = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id });

        expect(result).toMatchObject({ status: "error", error: "upstream text channel rejected the request" });
        const child = result?.workflow.children.find((item) => item.key === "storyboard:episode-one");
        expect(child).toMatchObject({ status: "error", error: "upstream text channel rejected the request" });
        expect(mocks.tasks.get(`render:${child?.id}`)).toMatchObject({
            status: "error",
            workflowChild: expect.objectContaining({ status: "error", error: "upstream text channel rejected the request" }),
        });
    });

    it("uses a new storyboard request identity when a failed extraction resumes", async () => {
        const storyboard = step("storyboard", "error");
        storyboard.attempts = 1;
        const task = workflowTask({
            status: "error",
            workflow: workflowState({ currentStepIndex: 0, steps: [storyboard] }),
        });
        mocks.tasks.set(`render:${task.id}`, task);

        const resumed = await resumeDramaLabWorkflow(task as never, "user-one");
        await advanceDramaLabWorkflow({ userId: "user-one", taskId: resumed!.id });

        expect(mocks.extractDramaLabStoryboards).toHaveBeenCalledWith(expect.objectContaining({ requestId: `${task.id}:storyboard:episode-one:attempt:2` }));
    });

    it("aggregates an external child failure onto the parent step and task", async () => {
        const task = workflowTask({
            status: "running",
            workflow: workflowState({
                projectId: project.id,
                currentStepIndex: 0,
                steps: [step("video", "running")],
            }),
        });
        task.workflow.episodeIds = ["episode-one"];
        mocks.tasks.set(`render:${task.id}`, task);
        mocks.getVideoTask.mockResolvedValue({
            id: "video-task-one",
            userId: "user-one",
            surface: "drama",
            projectId: project.id,
            episodeId: "episode-one",
            shotId: "shot-one",
            status: "error",
            error: "upstream video failed",
            result: undefined,
        });

        // The shot points at the failed external task, so advancing the
        // parent must preserve the child error instead of reporting success.
        project.episodes[0].shots[0].generationTaskId = "video-task-one";
        const result = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id });

        expect(result).toMatchObject({ status: "error", error: "upstream video failed" });
        expect(result?.workflow.steps[0]).toMatchObject({ status: "error", error: "upstream video failed" });
        expect(result?.workflow.children).toEqual(expect.arrayContaining([expect.objectContaining({ id: "video-task-one", status: "error", error: "upstream video failed" })]));
    });

    it("keeps a pending video child active until the recovery worker settles it", async () => {
        const task = workflowTask({
            status: "running",
            workflow: workflowState({ currentStepIndex: 0, steps: [step("video", "running")] }),
        });
        mocks.tasks.set(`render:${task.id}`, task);
        project.episodes[0].shots[0].generationTaskId = "video-task-pending";
        mocks.getVideoTask.mockResolvedValue({
            id: "video-task-pending",
            userId: "user-one",
            surface: "drama",
            projectId: project.id,
            episodeId: "episode-one",
            shotId: "shot-one",
            status: "pending",
        });

        const result = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id, origin: "http://workflow.test" });

        expect(result).toMatchObject({ status: "running" });
        expect(result?.workflow.steps[0].status).toBe("running");
        expect(mocks.runGenerationTaskRecoveryBatch).toHaveBeenCalledWith(expect.objectContaining({ taskIds: ["video-task-pending"] }));
    });

    it("fails the workflow when a completed image cannot be written back to the shot", async () => {
        const task = workflowTask({
            status: "running",
            workflow: workflowState({
                currentStepIndex: 0,
                steps: [step("storyboard", "running")],
                inputSnapshot: {},
            }),
        });
        task.workflow.steps[0].inputSnapshot = { phase: "images", imageCursor: 0 };
        task.workflow.episodeIds = ["episode-one"];
        project.episodes[0].shots[0].storyboardTaskId = "image-task-one";
        mocks.tasks.set(`render:${task.id}`, task);
        mocks.getImageTask.mockResolvedValue({
            id: "image-task-one",
            userId: "user-one",
            surface: "drama",
            projectId: project.id,
            episodeId: "episode-one",
            shotId: "shot-one",
            status: "success",
            result: { url: "https://cdn.test/image.png" },
        });
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: 500, msg: "sync failed" }), { status: 500, headers: { "Content-Type": "application/json" } }));

        const result = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id, origin: "http://workflow.test" });

        expect(result).toMatchObject({ status: "error", error: "sync failed" });
        expect(result?.workflow.steps[0]).toMatchObject({ status: "error", error: "sync failed" });
        expect(result?.workflow.children).toEqual(expect.arrayContaining([expect.objectContaining({ id: "image-task-one", status: "running" })]));
    });

    it("persists a passed review and completes the review step", async () => {
        const task = workflowTask({
            status: "running",
            workflow: workflowState({ steps: [step("review", "running")] }),
        });
        mocks.tasks.set(`render:${task.id}`, task);
        const review = reviewFixture({ status: "passed", summary: "审核通过", score: 96 });
        mocks.reviewDramaLabWorkflowOutputs.mockResolvedValue({ review, taskIds: ["review-run-1"] });

        const result = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id });

        expect(result).toMatchObject({ status: "success" });
        expect(mocks.reviewDramaLabWorkflowOutputs).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one", episodeIds: ["episode-one"], project }));
        const stored = mocks.tasks.get(`render:${task.id}`)!;
        expect(stored.workflow.steps[0]).toMatchObject({ key: "review", status: "success" });
        expect(stored.workflow.children).toEqual(expect.arrayContaining([expect.objectContaining({ key: "review", status: "success", output: expect.objectContaining({ review, taskIds: ["review-run-1"] }) })]));
        expect(stored.workflow.outputRefs).toEqual(expect.arrayContaining([expect.objectContaining({ review })]));
    });

    it("marks needs_revision as an error and resumes with a fresh review", async () => {
        const task = workflowTask({
            status: "running",
            workflow: workflowState({ steps: [step("review", "running")] }),
        });
        mocks.tasks.set(`render:${task.id}`, task);
        const needsRevision = reviewFixture({ status: "needs_revision", summary: "请补充镜头连续性" });
        const passed = reviewFixture({ status: "passed", summary: "复审通过", score: 100 });
        mocks.reviewDramaLabWorkflowOutputs.mockResolvedValueOnce({ review: needsRevision, taskIds: ["review-run-1"] }).mockResolvedValueOnce({ review: passed, taskIds: ["review-run-2"] });

        const failed = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id });
        expect(failed).toMatchObject({ status: "error" });
        expect(failed?.error).toContain(needsRevision.summary);
        expect(failed?.workflow.steps[0]).toMatchObject({ status: "error" });
        expect(failed?.workflow.children).toEqual(expect.arrayContaining([expect.objectContaining({ key: "review", status: "error", error: needsRevision.summary, output: expect.objectContaining({ review: needsRevision }) })]));

        const resumed = await resumeDramaLabWorkflow(failed as never, "user-one");
        expect(resumed).toMatchObject({ status: "pending" });
        const completed = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id });
        expect(completed).toMatchObject({ status: "success" });
        expect(mocks.reviewDramaLabWorkflowOutputs).toHaveBeenCalledTimes(2);
        const stored = mocks.tasks.get(`render:${task.id}`)!;
        expect(stored.workflow.children).toEqual(expect.arrayContaining([expect.objectContaining({ key: "review", status: "success", output: expect.objectContaining({ review: passed, taskIds: ["review-run-2"] }) })]));
    });

    it("fails closed when the review service is unavailable", async () => {
        const task = workflowTask({
            status: "running",
            workflow: workflowState({ steps: [step("review", "running")] }),
        });
        mocks.tasks.set(`render:${task.id}`, task);
        const unavailable = reviewFixture({ status: "unavailable", mode: "unavailable", summary: "审核服务暂不可用" });
        mocks.reviewDramaLabWorkflowOutputs.mockResolvedValue({ review: unavailable, taskIds: [] });

        const result = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id });

        expect(result).toMatchObject({ status: "error", error: unavailable.summary });
        expect(result?.workflow.steps[0]).toMatchObject({ status: "error", error: unavailable.summary });
        expect(result?.workflow.children).toEqual(expect.arrayContaining([expect.objectContaining({ key: "review", status: "error", error: unavailable.summary })]));
        expect(result?.status).not.toBe("success");
    });

    it("writes an export artifact and reuses it on a repeated advance", async () => {
        const task = workflowTask({
            status: "running",
            workflow: workflowState({ steps: [step("export", "running")] }),
        });
        mocks.tasks.set(`render:${task.id}`, task);
        const exportData = new Uint8Array([80, 75, 3, 4]);
        const artifact = {
            artifactId: task.id,
            taskId: task.id,
            projectId: project.id,
            ownerUserId: "user-one",
            fileName: "project.zip",
            bytes: exportData.byteLength,
            mediaCount: 2,
            omittedMediaCount: 0,
            createdAt: new Date().toISOString(),
        };
        mocks.exportDramaLabProjectForUser.mockResolvedValue({ fileName: artifact.fileName, data: exportData, mediaCount: 2, omittedMediaCount: 0 });
        mocks.writeDramaLabWorkflowExportArtifact.mockResolvedValue(artifact);

        const first = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id });

        expect(first).toMatchObject({ status: "success" });
        expect(mocks.exportDramaLabProjectForUser).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one", projectId: project.id, projectOwnerUserId: "user-one", includeMedia: true }));
        expect(mocks.writeDramaLabWorkflowExportArtifact).toHaveBeenCalledWith(expect.objectContaining({ taskId: task.id, projectId: project.id, ownerUserId: "user-one", data: exportData }));
        const storedAfterFirst = mocks.tasks.get(`render:${task.id}`)!;
        expect(storedAfterFirst.workflow.outputRefs).toEqual(expect.arrayContaining([expect.objectContaining({ artifactId: task.id, downloadUrl: expect.stringContaining(task.id) })]));

        // Re-run the same step snapshot to exercise the artifact read path;
        // persisted child metadata must prevent a second ZIP export.
        storedAfterFirst.status = "running";
        storedAfterFirst.workflow.currentStepIndex = 0;
        storedAfterFirst.workflow.steps[0].status = "running";
        mocks.readDramaLabWorkflowExportArtifact.mockResolvedValue({ metadata: artifact, data: exportData });
        const second = await advanceDramaLabWorkflow({ userId: "user-one", taskId: task.id });

        expect(second).toMatchObject({ status: "success" });
        expect(mocks.readDramaLabWorkflowExportArtifact).toHaveBeenCalledWith(task.id);
        expect(mocks.exportDramaLabProjectForUser).toHaveBeenCalledTimes(1);
        expect(mocks.writeDramaLabWorkflowExportArtifact).toHaveBeenCalledTimes(1);
    });
});

function reviewFixture(overrides: Partial<AnyTask> = {}): AnyTask {
    return {
        mode: "visual",
        status: "passed",
        score: 100,
        summary: "ok",
        issues: [],
        retryTaskIds: [],
        ...overrides,
    };
}

function startInput(overrides: Partial<AnyTask> = {}) {
    return {
        userId: "user-one",
        projectId: project.id,
        sourceEpisodeId: "episode-one",
        requestId: "request-one",
        options: { mode: "assets", scope: "current" },
        ...overrides,
    } as unknown as StartDramaLabWorkflowInput;
}

function workflowTask(overrides: Partial<AnyTask> = {}): AnyTask {
    const now = Date.now();
    return {
        id: overrides.id || `workflow-${Math.random().toString(36).slice(2)}`,
        userId: "user-one",
        status: "pending",
        createdAt: now,
        updatedAt: now,
        title: "workflow",
        surface: "drama",
        projectId: project.id,
        episodeId: "episode-one",
        clientRequestId: "request",
        workflow: workflowState({}),
        ...overrides,
    };
}

function workflowState(overrides: Partial<AnyTask> = {}): AnyTask {
    return {
        version: 1,
        projectId: project.id,
        sourceEpisodeId: "episode-one",
        episodeIds: ["episode-one"],
        options: { mode: "video", scope: "current", ratio: "9:16", duration: "5", language: "中文", visualStyle: "", autoExport: false },
        steps: [step("script", "pending")],
        children: [],
        currentStepIndex: 0,
        inputSnapshot: {},
        outputRefs: [],
        startedAt: Date.now(),
        ...overrides,
    };
}

function step(key: string, status: string): AnyTask {
    return { key, status, label: key, target: key, outputRefs: [], childTaskIds: [], attempts: 0 };
}

function child(id: string, type: string, status: string): AnyTask {
    return { id, type, key: `${type}:episode-one:shot-one`, episodeId: "episode-one", shotId: "shot-one", status, createdAt: Date.now(), updatedAt: Date.now() };
}

function projectFixture(): AnyTask {
    return {
        id: "project-one",
        title: "Test project",
        summary: "",
        style: "realistic",
        ratio: "9:16",
        status: "active",
        defaultVideoMode: "storyboard",
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
        characters: [],
        scenes: [],
        props: [],
        clues: [],
        activeEpisodeId: "episode-one",
        episodes: [
            {
                id: "episode-one",
                episodeNumber: 1,
                title: "Episode 1",
                script: "A short script",
                outline: "",
                hook: "",
                nextPreview: "",
                sourceRange: "",
                reviewStatus: "draft",
                shots: [
                    {
                        id: "shot-one",
                        order: 1,
                        title: "Shot 1",
                        description: "A shot",
                        sourceText: "",
                        shotBoundary: "",
                        dialogue: "",
                        narration: "",
                        utterances: [],
                        imagePrompt: "",
                        videoPrompt: "",
                        cameraMotion: "",
                        duration: 5,
                        characterIds: [],
                        propIds: [],
                        clueIds: [],
                        generationStatus: "idle",
                    },
                ],
            },
        ],
    };
}
