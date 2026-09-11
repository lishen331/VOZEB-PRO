import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile, writeFile, access } from "node:fs/promises";

const mocks = vi.hoisted(() => ({
    resolveProject: vi.fn(),
    assertStage: vi.fn(),
    createTask: vi.fn(),
    getTask: vi.fn(),
    getByRequest: vi.fn(),
    updateTask: vi.fn(),
    transitionTask: vi.fn(),
}));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: vi.fn() }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveProject,
    assertDramaLabStageAllowed: mocks.assertStage,
}));
vi.mock("@/lib/server/generation-task-store", () => ({
    createStoredGenerationTask: mocks.createTask,
    getStoredGenerationTask: mocks.getTask,
    getStoredGenerationTaskByRequest: mocks.getByRequest,
    updateStoredGenerationTask: mocks.updateTask,
    transitionStoredGenerationTask: mocks.transitionTask,
}));

import { createDramaLabFinalVideoTask, getDramaLabFinalVideoTask, cancelDramaLabFinalVideoTask, retryDramaLabFinalVideoTask, executeDramaLabFinalVideoTask, type DramaLabFinalVideoTask } from "./drama-lab-final-video-service";

function project() {
    return {
        id: "project-one",
        title: "测试",
        summary: "",
        style: "写实",
        ratio: "9:16",
        status: "active",
        defaultVideoMode: "storyboard",
        createdAt: "2026-09-01",
        updatedAt: "2026-09-11T00:00:00Z",
        characters: [],
        scenes: [],
        props: [],
        clues: [],
        activeEpisodeId: "episode-one",
        sourceAssets: [],
        episodes: [
            {
                id: "episode-one",
                episodeNumber: 1,
                title: "第1集",
                script: "",
                outline: "",
                hook: "",
                nextPreview: "",
                sourceRange: "",
                reviewStatus: "draft",
                shots: [
                    {
                        id: "shot-two",
                        order: 2,
                        title: "",
                        description: "",
                        sourceText: "",
                        shotBoundary: "",
                        dialogue: "",
                        narration: "",
                        utterances: [],
                        imagePrompt: "",
                        videoPrompt: "",
                        cameraMotion: "",
                        duration: 3,
                        characterIds: [],
                        propIds: [],
                        clueIds: [],
                        videoUrl: "/video/two.mp4",
                        generationTaskId: "video-two",
                    },
                    {
                        id: "shot-one",
                        order: 1,
                        title: "",
                        description: "",
                        sourceText: "",
                        shotBoundary: "",
                        dialogue: "",
                        narration: "",
                        utterances: [],
                        imagePrompt: "",
                        videoPrompt: "",
                        cameraMotion: "",
                        duration: 2,
                        characterIds: [],
                        propIds: [],
                        clueIds: [],
                        videoUrl: "/video/one.mp4",
                        generationTaskId: "video-one",
                    },
                ],
            },
        ],
    };
}

describe("drama lab final video task snapshot", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resolveProject.mockResolvedValue({ project: project(), ownerUserId: "owner-one" });
        mocks.assertStage.mockResolvedValue(undefined);
        mocks.createTask.mockImplementation(async (_type: string, task: unknown) => task);
        mocks.getByRequest.mockResolvedValue(null);
    });

    it("builds an immutable server snapshot in shot order without trusting client media", async () => {
        const task = await createDramaLabFinalVideoTask({ userId: "member-one", projectId: "project-one", episodeId: "episode-one", clientRequestId: "req-one" });
        expect(task.taskKind).toBe("drama_lab_final_video");
        expect(task.inputSnapshot.ownerUserId).toBe("owner-one");
        expect(task.inputSnapshot.shotIds).toEqual(["shot-one", "shot-two"]);
        expect(task.inputSnapshot.shots.map((shot) => shot.videoUrl)).toEqual(["/video/one.mp4", "/video/two.mp4"]);
        expect(task.inputSnapshot.inputHash).toMatch(/^[a-f0-9]{64}$/);
        expect(mocks.assertStage).toHaveBeenCalledWith("member-one", "project-one", "final_export", { episodeId: "episode-one", resourceType: "episode", resourceId: "episode-one" });
    });

    it("rejects a shot without a server-side video", async () => {
        const value = project();
        value.episodes[0].shots[1].videoUrl = "";
        mocks.resolveProject.mockResolvedValue({ project: value, ownerUserId: "owner-one" });
        await expect(createDramaLabFinalVideoTask({ userId: "member-one", projectId: "project-one", episodeId: "episode-one" })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("shot-one") });
        expect(mocks.createTask).not.toHaveBeenCalled();
    });

    it("reuses an idempotent request before reading a new project snapshot", async () => {
        const existing = await createDramaLabFinalVideoTask({ userId: "member-one", projectId: "project-one", episodeId: "episode-one", clientRequestId: "same-request" });
        mocks.createTask.mockClear();
        mocks.getByRequest.mockResolvedValue(existing);
        const result = await createDramaLabFinalVideoTask({ userId: "member-one", projectId: "project-one", episodeId: "episode-one", clientRequestId: "same-request" });
        expect(result).toEqual(existing);
        expect(mocks.createTask).not.toHaveBeenCalled();
    });
});

const coordinates = { userId: "member-one", projectId: "project-one", episodeId: "episode-one" };
let stored: Map<string, DramaLabFinalVideoTask>;
async function seed(status: DramaLabFinalVideoTask["status"] = "pending") {
    const task = await createDramaLabFinalVideoTask({ ...coordinates, clientRequestId: "original-request" });
    task.status = status;
    stored.set(task.id, structuredClone(task));
    return task;
}
function statefulMocks() {
    stored = new Map();
    mocks.resolveProject.mockResolvedValue({ project: project(), ownerUserId: "owner-one" });
    mocks.assertStage.mockResolvedValue(undefined);
    mocks.createTask.mockImplementation(async (_type: string, task: DramaLabFinalVideoTask) => {
        const duplicate = [...stored.values()].find((item) => item.userId === task.userId && item.clientRequestId === task.clientRequestId && (item.attemptNo || 1) === (task.attemptNo || 1));
        if (duplicate) return structuredClone(duplicate);
        stored.set(task.id, structuredClone(task));
        return structuredClone(task);
    });
    mocks.getByRequest.mockImplementation(async (_type: string, userId: string, requestId: string, attemptNo = 1) =>
        structuredClone([...stored.values()].find((item) => item.userId === userId && item.clientRequestId === requestId && (item.attemptNo || 1) === attemptNo) || null),
    );
    mocks.getTask.mockImplementation(async (_type: string, id: string) => structuredClone(stored.get(id) || null));
    mocks.transitionTask.mockImplementation(async (_type: string, id: string, userId: string, allowed: string[], patch: Partial<DramaLabFinalVideoTask>) => {
        const task = stored.get(id);
        if (!task || task.userId !== userId || !allowed.includes(task.status)) return null;
        const next = { ...task, ...structuredClone(patch), updatedAt: Date.now() };
        stored.set(id, next);
        return structuredClone(next);
    });
}

describe("final video access, attempts and terminal protection", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        statefulMocks();
    });

    it("rejects request reuse with another project or episode", async () => {
        await seed();
        const other = project();
        other.id = "project-two";
        mocks.resolveProject.mockResolvedValue({ project: other, ownerUserId: "owner-one" });
        await expect(createDramaLabFinalVideoTask({ ...coordinates, projectId: other.id, clientRequestId: "original-request" })).rejects.toMatchObject({ status: 409 });
    });
    it("rejects changed media under the same request key", async () => {
        await seed();
        const changed = project();
        changed.episodes[0].shots[0].videoUrl = "/video/new.mp4";
        mocks.resolveProject.mockResolvedValue({ project: changed, ownerUserId: "owner-one" });
        await expect(createDramaLabFinalVideoTask({ ...coordinates, clientRequestId: "original-request" })).rejects.toMatchObject({ status: 409 });
    });
    it("checks the record returned by the atomic insert for collisions", async () => {
        const old = await seed();
        old.projectId = "foreign";
        mocks.getByRequest.mockResolvedValue(null);
        mocks.createTask.mockResolvedValue(old);
        await expect(createDramaLabFinalVideoTask({ ...coordinates, clientRequestId: "new-request" })).rejects.toMatchObject({ status: 409 });
    });
    it("rejects mismatched episode coordinates even inside the same project", async () => {
        const task = await seed();
        await expect(getDramaLabFinalVideoTask({ ...coordinates, episodeId: "other", taskId: task.id })).rejects.toMatchObject({ status: 404 });
        await expect(cancelDramaLabFinalVideoTask({ ...coordinates, episodeId: "other", taskId: task.id })).rejects.toMatchObject({ status: 404 });
    });
    it("checks membership every time and redacts media, credentials and raw error details", async () => {
        const task = await seed("error");
        task.error = "secret-cookie upstream https://remote/?token=secret";
        stored.set(task.id, task);
        const view = await getDramaLabFinalVideoTask({ ...coordinates, taskId: task.id });
        const json = JSON.stringify(view);
        expect(json).not.toContain("owner-one");
        expect(json).not.toContain("/video/");
        expect(json).not.toContain("secret");
        expect(view).not.toHaveProperty("inputSnapshot");
        mocks.resolveProject.mockRejectedValue(Object.assign(new Error("removed"), { status: 403 }));
        await expect(getDramaLabFinalVideoTask({ ...coordinates, taskId: task.id })).rejects.toMatchObject({ status: 403 });
    });
    it.each(["pending", "running"] as const)("cancels %s atomically", async (status) => {
        const task = await seed(status);
        expect((await cancelDramaLabFinalVideoTask({ ...coordinates, taskId: task.id })).status).toBe("cancelled");
        expect(stored.get(task.id)?.status).toBe("cancelled");
        expect(mocks.transitionTask).toHaveBeenCalled();
    });
    it("cannot overwrite a completed task if cancellation loses a race", async () => {
        const task = await seed("running");
        mocks.transitionTask.mockImplementation(async () => {
            stored.set(task.id, { ...task, status: "success" });
            return null;
        });
        await expect(cancelDramaLabFinalVideoTask({ ...coordinates, taskId: task.id })).rejects.toMatchObject({ status: 409 });
        expect(stored.get(task.id)?.status).toBe("success");
    });
    it.each(["error", "cancelled", "needs_review"] as const)("retries %s into a new idempotent attempt without touching original", async (status) => {
        const task = await seed(status);
        const before = structuredClone(task);
        const retryInput = { ...coordinates, taskId: task.id, clientRequestId: "retry-request" };
        const first = await retryDramaLabFinalVideoTask(retryInput);
        const second = await retryDramaLabFinalVideoTask(retryInput);
        expect(first.id).not.toBe(task.id);
        expect(second.id).toBe(first.id);
        expect(first.attemptNo).toBe(2);
        expect(stored.get(task.id)).toEqual(before);
        expect(stored.get(first.id)?.inputSnapshot).toEqual(before.inputSnapshot);
        expect(mocks.assertStage).toHaveBeenLastCalledWith(coordinates.userId, coordinates.projectId, "final_export", { episodeId: coordinates.episodeId, resourceType: "episode", resourceId: coordinates.episodeId });
    });
    it.each(["pending", "running", "success"] as const)("refuses to retry %s", async (status) => {
        const task = await seed(status);
        await expect(retryDramaLabFinalVideoTask({ ...coordinates, taskId: task.id, clientRequestId: "retry" })).rejects.toMatchObject({ status: 409 });
    });
    it("preserves mute in the snapshot and isolates it from later project mutation", async () => {
        const value = project();
        Object.assign(value.episodes[0].shots[0], { audioMode: "mute", audioUrl: "private-audio" });
        mocks.resolveProject.mockResolvedValue({ project: value, ownerUserId: "owner-one" });
        const task = await seed();
        value.episodes[0].shots[0].videoUrl = "changed";
        expect(task.inputSnapshot.shots[1].audioMode).toBe("mute");
        expect(task.inputSnapshot.shots[1].audioUrl).toBeUndefined();
        expect(task.inputSnapshot.shots[1].videoUrl).not.toBe("changed");
    });
});

describe("final video fixture execution", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        statefulMocks();
    });
    function engine() {
        return {
            download: vi.fn(async (_url: string, target: string) => {
                await writeFile(target, new Uint8Array([1, 2]));
                return { bytes: 2, mimeType: "video/mp4" };
            }),
            ffmpeg: vi.fn(async (_args: string[], _options?: { cwd?: string }) => ({ stdout: "", stderr: "" })),
            ffprobe: vi.fn(async () => ({ stdout: JSON.stringify({ streams: [{ codec_type: "video", width: 720, height: 1280 }] }), stderr: "" })),
            writeArtifact: vi.fn(async () => ({ token: "permanent/result.mp4", bytes: 2, mimeType: "video/mp4", storage: "local" as const })),
        };
    }
    it("executes in persisted order, writes real concat newlines and keeps stable MP4 output", async () => {
        const task = await seed();
        const deps = engine();
        let workdir = "";
        deps.ffmpeg.mockImplementation(async (_args, options) => {
            workdir = options?.cwd || "";
            const text = await readFile(`${workdir}/inputs.txt`, "utf8");
            expect(text.split("\n")).toHaveLength(2);
            expect(text).not.toContain("\\n");
            return { stdout: "", stderr: "" };
        });
        const result = await executeDramaLabFinalVideoTask(task.id, deps);
        expect(result?.status).toBe("success");
        expect(result?.result?.mimeType).toBe("video/mp4");
        expect(deps.download.mock.calls.map(([url]) => url)).toEqual(["/video/one.mp4", "/video/two.mp4"]);
        await expect(access(workdir)).rejects.toBeDefined();
        const again = await executeDramaLabFinalVideoTask(task.id, deps);
        expect(again?.result).toEqual(result?.result);
        expect(deps.ffmpeg).toHaveBeenCalledTimes(1);
    });
    it("does not execute a pending task cancelled before dispatch", async () => {
        const task = await seed();
        await cancelDramaLabFinalVideoTask({ ...coordinates, taskId: task.id });
        const deps = engine();
        expect((await executeDramaLabFinalVideoTask(task.id, deps))?.status).toBe("cancelled");
        expect(deps.download).not.toHaveBeenCalled();
    });
    it("preserves cancellation while FFmpeg was running and never publishes", async () => {
        const task = await seed();
        const deps = engine();
        deps.ffmpeg.mockImplementation(async () => {
            await cancelDramaLabFinalVideoTask({ ...coordinates, taskId: task.id });
            return { stdout: "", stderr: "" };
        });
        expect((await executeDramaLabFinalVideoTask(task.id, deps))?.status).toBe("cancelled");
        expect(deps.writeArtifact).not.toHaveBeenCalled();
        expect(stored.get(task.id)?.status).toBe("cancelled");
    });
    it("prevents a late artifact completion from changing cancelled to success", async () => {
        const task = await seed();
        const deps = engine();
        deps.writeArtifact.mockImplementation(async () => {
            await cancelDramaLabFinalVideoTask({ ...coordinates, taskId: task.id });
            return { token: "late.mp4", bytes: 2, mimeType: "video/mp4", storage: "local" };
        });
        expect((await executeDramaLabFinalVideoTask(task.id, deps))?.status).toBe("cancelled");
        expect(stored.get(task.id)?.result).toBeUndefined();
    });
    it("persists FFmpeg errors and rejects a nonvideo probe", async () => {
        const task = await seed();
        const deps = engine();
        deps.ffmpeg.mockRejectedValue(new Error("fixture failure"));
        expect((await executeDramaLabFinalVideoTask(task.id, deps))?.status).toBe("error");
        expect(deps.writeArtifact).not.toHaveBeenCalled();
    });
});
