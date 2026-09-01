import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getVideoTask: vi.fn(),
    ffmpegAvailable: vi.fn(),
    runFfmpeg: vi.fn(),
    runFfprobe: vi.fn(),
    downloadMediaToFile: vi.fn(),
    writeReferenceMediaFile: vi.fn(),
    getLocalMediaRegistration: vi.fn(),
    persistDramaLabShotUpdate: vi.fn(),
    mkdtemp: vi.fn(),
    rm: vi.fn(),
    stat: vi.fn(),
}));

vi.mock("@/lib/server/video-task-store", () => ({ getVideoTask: mocks.getVideoTask }));
vi.mock("@/lib/server/ffmpeg", () => ({
    ffmpegAvailable: mocks.ffmpegAvailable,
    runFfmpeg: mocks.runFfmpeg,
    runFfprobe: mocks.runFfprobe,
}));
vi.mock("@/lib/server/media-download", () => ({ downloadMediaToFile: mocks.downloadMediaToFile }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writeReferenceMediaFile: mocks.writeReferenceMediaFile }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: mocks.getLocalMediaRegistration }));
vi.mock("@/lib/server/drama-lab-shot-generation-service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/drama-lab-shot-generation-service")>("@/lib/server/drama-lab-shot-generation-service");
    return { ...actual, persistDramaLabShotUpdate: mocks.persistDramaLabShotUpdate };
});
vi.mock("node:fs/promises", () => ({ mkdtemp: mocks.mkdtemp, rm: mocks.rm, stat: mocks.stat }));

import type { DramaProject } from "@/lib/drama-project-contract";
import { acceptDramaLabFirstFrameCandidate, extractDramaLabTailFrame } from "./drama-lab-tail-frame-service";

const project: DramaProject = {
    id: "project-one",
    title: "Tail frame test",
    summary: "",
    style: "realistic",
    ratio: "9:16",
    status: "active",
    characters: [],
    scenes: [],
    props: [],
    clues: [],
    defaultVideoMode: "storyboard",
    episodes: [
        {
            id: "episode-one",
            title: "Episode one",
            script: "",
            outline: "",
            hook: "",
            nextPreview: "",
            sourceRange: "",
            reviewStatus: "draft",
            shots: [
                {
                    id: "shot-one",
                    order: 1,
                    title: "Shot one",
                    description: "First shot",
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
                    generationTaskId: "video-task-one",
                    generationStatus: "success",
                    videoHistory: [{ id: "history-one", taskId: "video-task-one", url: "/video.mp4", prompt: "", createdAt: "2026-08-31T00:00:00.000Z" }],
                },
                {
                    id: "shot-two",
                    order: 2,
                    title: "Shot two",
                    description: "Second shot",
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
                },
            ],
        },
    ],
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
};

function task(overrides: Record<string, unknown> = {}) {
    return {
        id: "video-task-one",
        userId: "user-one",
        status: "success",
        surface: "drama",
        projectId: "project-one",
        episodeId: "episode-one",
        shotId: "shot-one",
        result: { url: "/api/reference-assets/permanent/video.mp4" },
        ...overrides,
    };
}

function resetSuccessMocks() {
    vi.clearAllMocks();
    mocks.getVideoTask.mockResolvedValue(task());
    mocks.ffmpegAvailable.mockResolvedValue(true);
    mocks.mkdtemp.mockResolvedValue("C:/temp/tail-frame");
    mocks.rm.mockResolvedValue(undefined);
    mocks.stat.mockResolvedValue({ isFile: () => true, size: 42 });
    mocks.downloadMediaToFile.mockResolvedValue({ bytes: 100, mimeType: "video/mp4" });
    mocks.runFfmpeg.mockResolvedValue({ stdout: "", stderr: "" });
    mocks.runFfprobe.mockResolvedValue({ stdout: '{"streams":[{"width":720,"height":1280}]}' });
    mocks.writeReferenceMediaFile.mockResolvedValue({ token: "permanent/2026/09/01/images/tail.jpg", bytes: 42, mimeType: "image/jpeg" });
    mocks.getLocalMediaRegistration.mockImplementation(async (storageKey: string) => ({
        storageKey,
        scope: "reference",
        storageClass: "permanent",
        type: "image",
        ownerUserId: "user-one",
        source: "drama-lab-tail-frame",
        taskId: "video-task-one",
        projectId: "project-one",
        mimeType: "image/jpeg",
        bytes: 42,
        createdAt: "2026-09-01T00:00:00.000Z",
    }));
    mocks.persistDramaLabShotUpdate.mockImplementation(async ({ project: candidate, episodeId, shotId, patch }: { project: DramaProject; episodeId: string; shotId: string; patch: Partial<DramaProject["episodes"][number]["shots"][number]> }) => {
        return {
            ...candidate,
            episodes: candidate.episodes.map((episode) =>
                episode.id !== episodeId
                    ? episode
                    : {
                          ...episode,
                          shots: episode.shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)),
                      },
            ),
            updatedAt: "2026-09-01T00:00:01.000Z",
        };
    });
}

describe("drama lab tail frame extraction", () => {
    it("rejects a shot without a generation task", async () => {
        const inputProject = { ...project, episodes: [{ ...project.episodes[0], shots: [{ ...project.episodes[0].shots[0], generationTaskId: undefined }] }] };
        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project: inputProject, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 409 });
    });

    it("rejects missing or foreign video tasks", async () => {
        resetSuccessMocks();
        mocks.getVideoTask.mockResolvedValueOnce(null);
        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 409 });

        mocks.getVideoTask.mockResolvedValueOnce(task({ userId: "other-user" }));
        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 409 });
    });

    it("rejects a completed task that belongs to another drama shot", async () => {
        resetSuccessMocks();
        mocks.getVideoTask.mockResolvedValue(task({ projectId: "another-project", episodeId: "episode-other", shotId: "shot-other" }));

        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.downloadMediaToFile).not.toHaveBeenCalled();
    });

    it("rejects a video task that has not succeeded", async () => {
        resetSuccessMocks();
        mocks.getVideoTask.mockResolvedValue(task({ status: "running" }));
        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 409 });
    });

    it("returns a clear unavailable error when ffmpeg is not installed", async () => {
        resetSuccessMocks();
        mocks.ffmpegAvailable.mockResolvedValue(false);
        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 503 });
        expect(mocks.downloadMediaToFile).not.toHaveBeenCalled();
    });

    it("does not persist a partial result when download or extraction fails", async () => {
        resetSuccessMocks();
        mocks.downloadMediaToFile.mockRejectedValue(new Error("download failed"));
        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 502 });
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();

        resetSuccessMocks();
        mocks.runFfmpeg.mockRejectedValue(new Error("extract failed"));
        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 502 });
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
    });

    it("persists the extracted tail and a candidate for the next shot", async () => {
        resetSuccessMocks();
        const result = await extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "session=one", project, episodeId: "episode-one", shotId: "shot-one" });

        expect(mocks.downloadMediaToFile).toHaveBeenCalledWith("/api/reference-assets/permanent/video.mp4", expect.stringContaining("source-video"), expect.objectContaining({ origin: "http://localhost:3000", cookie: "session=one" }));
        expect(mocks.runFfmpeg).toHaveBeenCalledWith(expect.arrayContaining(["-sseof", "-1", "-frames:v", "1"]), expect.objectContaining({ cwd: "C:/temp/tail-frame" }));
        expect(mocks.writeReferenceMediaFile).toHaveBeenCalledWith(expect.stringContaining("tail-frame.jpg"), "image", "image/jpeg", true, expect.objectContaining({ ownerUserId: "user-one", source: "drama-lab-tail-frame", taskId: "video-task-one", projectId: "project-one" }));
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledTimes(2);
        expect(mocks.persistDramaLabShotUpdate.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ retryOnConflict: false }));
        expect(mocks.persistDramaLabShotUpdate.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ retryOnConflict: false }));
        expect(result.frame).toMatchObject({ url: "/api/reference-assets/permanent/2026/09/01/images/tail.jpg", source: "video_tail", sourceVideoTaskId: "video-task-one", sourceShotId: "shot-one", sourceVideoHistoryId: "history-one", width: 720, height: 1280 });
        expect(result.nextShot).toMatchObject({ id: "shot-two", candidate: { sourceVideoTaskId: "video-task-one", sourceShotId: "shot-one", sourceVideoHistoryId: "history-one", url: "/api/reference-assets/permanent/2026/09/01/images/tail.jpg" } });
    });

    it("only persists the current tail when there is no next shot", async () => {
        resetSuccessMocks();
        const lastShotProject = { ...project, episodes: [{ ...project.episodes[0], shots: [project.episodes[0].shots[1]] }] };
        lastShotProject.episodes[0].shots[0].generationTaskId = "video-task-one";
        lastShotProject.episodes[0].shots[0].videoHistory = [{ id: "history-one", taskId: "video-task-one", url: "/video.mp4", prompt: "", createdAt: "2026-08-31T00:00:00.000Z" }];
        mocks.getVideoTask.mockResolvedValue(task({ shotId: "shot-two" }));
        const result = await extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project: lastShotProject, episodeId: "episode-one", shotId: "shot-two" });
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledOnce();
        expect(result.nextShot).toBeNull();
    });

    it("is idempotent for the same source task and never overwrites another candidate", async () => {
        resetSuccessMocks();
        const existingCandidate = {
            id: "existing-candidate",
            frameType: "first" as const,
            url: "/api/reference-assets/permanent/existing.jpg",
            storageKey: "permanent/existing.jpg",
            source: "video_tail" as const,
            sourceVideoTaskId: "video-task-one",
            sourceShotId: "shot-one",
            sourceVideoHistoryId: "history-one",
            createdAt: "2026-09-01T00:00:00.000Z",
            projectUpdatedAt: project.updatedAt,
        };
        const inputProject = { ...project, episodes: [{ ...project.episodes[0], shots: [project.episodes[0].shots[0], { ...project.episodes[0].shots[1], firstFrameCandidate: existingCandidate }] }] };
        const result = await extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project: inputProject, episodeId: "episode-one", shotId: "shot-one" });
        expect(result.nextShot?.candidate).toEqual(existingCandidate);
        expect(mocks.downloadMediaToFile).not.toHaveBeenCalled();
        expect(mocks.writeReferenceMediaFile).not.toHaveBeenCalled();
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();

        resetSuccessMocks();
        const differentCandidate = { ...existingCandidate, sourceVideoTaskId: "older-task", id: "older-candidate" };
        const projectWithDifferentCandidate = { ...project, episodes: [{ ...project.episodes[0], shots: [project.episodes[0].shots[0], { ...project.episodes[0].shots[1], firstFrameCandidate: differentCandidate }] }] };
        await extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project: projectWithDifferentCandidate, episodeId: "episode-one", shotId: "shot-one" });
        const candidatePatchCalls = mocks.persistDramaLabShotUpdate.mock.calls.filter((call) => call[0]?.patch?.firstFrameCandidate?.sourceVideoTaskId === "video-task-one");
        expect(candidatePatchCalls).toHaveLength(0);
    });

    it("does not reuse a tail frame when its media registration is missing or mismatched", async () => {
        resetSuccessMocks();
        const persistedTail = {
            prompt: "tail prompt",
            description: "persisted tail",
            status: "success" as const,
            taskId: "video-task-one",
            url: "/api/reference-assets/permanent/unregistered-tail.jpg",
            storageKey: "permanent/unregistered-tail.jpg",
            source: "video_tail" as const,
            sourceVideoTaskId: "video-task-one",
            sourceShotId: "shot-one",
            sourceVideoHistoryId: "history-one",
            locked: true,
        };
        mocks.getLocalMediaRegistration.mockResolvedValueOnce(null);
        const inputProject = {
            ...project,
            episodes: [{ ...project.episodes[0], shots: [{ ...project.episodes[0].shots[0], frames: { last: persistedTail } }, project.episodes[0].shots[1]] }],
        };
        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project: inputProject, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 409, message: expect.stringContaining("尾帧已锁定") });
        expect(mocks.downloadMediaToFile).not.toHaveBeenCalled();

        resetSuccessMocks();
        mocks.getLocalMediaRegistration.mockResolvedValueOnce({
            storageKey: "permanent/unregistered-tail.jpg",
            scope: "reference",
            storageClass: "permanent",
            type: "image",
            ownerUserId: "other-user",
            source: "drama-lab-tail-frame",
            taskId: "video-task-one",
            projectId: "project-one",
            mimeType: "image/jpeg",
            bytes: 42,
            createdAt: "2026-09-01T00:00:00.000Z",
        });
        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project: inputProject, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.downloadMediaToFile).not.toHaveBeenCalled();
    });

    it("rejects a tail frame whose URL does not resolve to its registered storage key", async () => {
        resetSuccessMocks();
        const persistedTail = {
            prompt: "tail prompt",
            status: "success" as const,
            taskId: "video-task-one",
            url: "/api/reference-assets/permanent/different-tail.jpg",
            storageKey: "permanent/registered-tail.jpg",
            source: "video_tail" as const,
            sourceVideoTaskId: "video-task-one",
            sourceShotId: "shot-one",
            sourceVideoHistoryId: "history-one",
            locked: true,
        };
        const inputProject = {
            ...project,
            episodes: [{ ...project.episodes[0], shots: [{ ...project.episodes[0].shots[0], frames: { last: persistedTail } }, project.episodes[0].shots[1]] }],
        };

        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project: inputProject, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.downloadMediaToFile).not.toHaveBeenCalled();
    });

    it("rejects a candidate backed by generation-scope media", async () => {
        resetSuccessMocks();
        mocks.getLocalMediaRegistration.mockResolvedValue({
            storageKey: "permanent/tail.jpg",
            scope: "generation",
            storageClass: "permanent",
            type: "image",
            ownerUserId: "user-one",
            source: "drama-lab-tail-frame",
            taskId: "video-task-one",
            projectId: "project-one",
            mimeType: "image/jpeg",
            bytes: 42,
            createdAt: "2026-09-01T00:00:00.000Z",
        });
        const candidateProject = {
            ...project,
            episodes: [
                {
                    ...project.episodes[0],
                    shots: [
                        project.episodes[0].shots[0],
                        {
                            ...project.episodes[0].shots[1],
                            firstFrameCandidate: {
                                id: "candidate-one",
                                frameType: "first" as const,
                                url: "/api/reference-assets/permanent/tail.jpg",
                                storageKey: "permanent/tail.jpg",
                                source: "video_tail" as const,
                                sourceVideoTaskId: "video-task-one",
                                sourceShotId: "shot-one",
                                sourceVideoHistoryId: "history-one",
                                createdAt: "2026-09-01T00:00:00.000Z",
                                projectUpdatedAt: project.updatedAt,
                            },
                        },
                    ],
                },
            ],
        };

        await expect(
            acceptDramaLabFirstFrameCandidate({ userId: "user-one", project: candidateProject, episodeId: "episode-one", shotId: "shot-two", candidateId: "candidate-one" }),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("does not allow replacing a locked first frame even when replacement is requested", async () => {
        resetSuccessMocks();
        const candidateProject = {
            ...project,
            episodes: [
                {
                    ...project.episodes[0],
                    shots: [
                        project.episodes[0].shots[0],
                        {
                            ...project.episodes[0].shots[1],
                            frames: { first: { prompt: "locked", status: "success" as const, url: "/api/reference-assets/permanent/current.jpg", storageKey: "permanent/current.jpg", locked: true } },
                            firstFrameCandidate: {
                                id: "candidate-one",
                                frameType: "first" as const,
                                url: "/api/reference-assets/permanent/tail.jpg",
                                storageKey: "permanent/tail.jpg",
                                source: "video_tail" as const,
                                sourceVideoTaskId: "video-task-one",
                                sourceShotId: "shot-one",
                                sourceVideoHistoryId: "history-one",
                                createdAt: "2026-09-01T00:00:00.000Z",
                                projectUpdatedAt: project.updatedAt,
                            },
                        },
                    ],
                },
            ],
        };

        await expect(
            acceptDramaLabFirstFrameCandidate({ userId: "user-one", project: candidateProject, episodeId: "episode-one", shotId: "shot-two", candidateId: "candidate-one", replaceExisting: true }),
        ).rejects.toMatchObject({ status: 409 });
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();
    });

    it("reuses an already persisted tail and only creates the missing next-shot candidate", async () => {
        resetSuccessMocks();
        const persistedTail = {
            prompt: "tail prompt",
            description: "persisted tail",
            status: "success" as const,
            taskId: "video-task-one",
            url: "/api/reference-assets/permanent/existing-tail.jpg",
            storageKey: "permanent/existing-tail.jpg",
            width: 720,
            height: 1280,
            source: "video_tail" as const,
            sourceVideoTaskId: "video-task-one",
            sourceShotId: "shot-one",
            sourceVideoHistoryId: "history-one",
            locked: true,
        };
        const inputProject = {
            ...project,
            episodes: [
                {
                    ...project.episodes[0],
                    shots: [{ ...project.episodes[0].shots[0], frames: { last: persistedTail } }, project.episodes[0].shots[1]],
                },
            ],
        };

        const result = await extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project: inputProject, episodeId: "episode-one", shotId: "shot-one" });

        expect(result.frame).toEqual(persistedTail);
        expect(result.nextShot?.candidate).toMatchObject({
            url: persistedTail.url,
            storageKey: persistedTail.storageKey,
            sourceVideoTaskId: "video-task-one",
            sourceShotId: "shot-one",
            sourceVideoHistoryId: "history-one",
        });
        expect(mocks.downloadMediaToFile).not.toHaveBeenCalled();
        expect(mocks.runFfmpeg).not.toHaveBeenCalled();
        expect(mocks.writeReferenceMediaFile).not.toHaveBeenCalled();
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledOnce();
        expect(mocks.persistDramaLabShotUpdate.mock.calls[0][0].patch).toEqual({ firstFrameCandidate: expect.objectContaining({ url: persistedTail.url }) });
        expect(mocks.getLocalMediaRegistration).toHaveBeenCalledWith(persistedTail.storageKey);
    });

    it("persists the extracted tail without retrying a stale frames patch after conflict", async () => {
        resetSuccessMocks();
        const conflict = Object.assign(new Error("短剧项目已在其他页面更新，请刷新后重试"), { status: 409 });
        mocks.persistDramaLabShotUpdate.mockRejectedValueOnce(conflict);

        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.persistDramaLabShotUpdate).toHaveBeenCalledOnce();
        expect(mocks.persistDramaLabShotUpdate.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ retryOnConflict: false }));
    });

    it("does not overwrite a locked tail from another source task", async () => {
        resetSuccessMocks();
        const lockedTailProject = {
            ...project,
            episodes: [
                {
                    ...project.episodes[0],
                    shots: [
                        {
                            ...project.episodes[0].shots[0],
                            frames: {
                                last: {
                                    prompt: "manually selected tail",
                                    status: "success" as const,
                                    taskId: "older-video-task",
                                    url: "/api/reference-assets/permanent/locked-tail.jpg",
                                    storageKey: "permanent/locked-tail.jpg",
                                    source: "uploaded" as const,
                                    locked: true,
                                },
                            },
                        },
                        project.episodes[0].shots[1],
                    ],
                },
            ],
        };

        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project: lockedTailProject, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 409, message: expect.stringContaining("尾帧已锁定") });
        expect(mocks.downloadMediaToFile).not.toHaveBeenCalled();
        expect(mocks.writeReferenceMediaFile).not.toHaveBeenCalled();
        expect(mocks.persistDramaLabShotUpdate).not.toHaveBeenCalled();

        const lockedSameTask = {
            ...lockedTailProject,
            episodes: [{ ...lockedTailProject.episodes[0], shots: [{ ...lockedTailProject.episodes[0].shots[0], frames: { last: { ...lockedTailProject.episodes[0].shots[0].frames!.last, prompt: lockedTailProject.episodes[0].shots[0].frames!.last?.prompt || "", status: "success" as const, sourceVideoTaskId: "video-task-one", storageKey: undefined } } }, lockedTailProject.episodes[0].shots[1]] }],
        };
        await expect(extractDramaLabTailFrame({ userId: "user-one", origin: "http://localhost:3000", cookie: "", project: lockedSameTask, episodeId: "episode-one", shotId: "shot-one" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.downloadMediaToFile).not.toHaveBeenCalled();
    });
});
