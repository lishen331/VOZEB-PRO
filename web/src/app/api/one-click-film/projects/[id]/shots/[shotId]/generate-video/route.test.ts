import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getAuthSettings: vi.fn(),
    getDramaProjectForUser: vi.fn(),
    prepareVideo: vi.fn(),
    persist: vi.fn(),
    fetchInternalApi: vi.fn(),
    getVideoTask: vi.fn(),
    capability: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.getDramaProjectForUser }));
vi.mock("@/lib/server/video-task-store", () => ({ getVideoTask: mocks.getVideoTask }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi, resolveInternalOrigin: (o: string) => o }));
vi.mock("@/lib/server/public-request-origin", () => ({ resolvePublicRequestOrigin: () => "http://internal" }));
vi.mock("@/lib/server/maintenance-auth", () => ({ maintenanceWorkerContextHeaders: () => null, requestRuntimeCredential: () => "session=1" }));
vi.mock("@/lib/server/one-click-film/video-capability", () => ({ resolveOneClickVideoCapability: mocks.capability }));
vi.mock("@/lib/server/drama-lab-shot-generation-service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/drama-lab-shot-generation-service")>("@/lib/server/drama-lab-shot-generation-service");
    return { ...actual, prepareDramaLabStoryboardVideo: mocks.prepareVideo, persistDramaLabShotUpdate: mocks.persist };
});

import { POST } from "./route";

const project = { id: "project-one", sourceHandoffId: "one-click-film:abc", ratio: "9:16", creativeConversationId: "conv-1", episodes: [{ id: "episode-one", shots: [{ id: "shot-one" }] }] } as unknown as DramaProject;
const params = Promise.resolve({ id: "project-one", shotId: "shot-one" });
const post = (query = "?episodeId=episode-one") => POST(new Request(`http://app.example.com/api/one-click-film/projects/project-one/shots/shot-one/generate-video${query}`, { method: "POST" }), { params });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
    mocks.getAuthSettings.mockResolvedValue({ defaultModels: { videoModel: "video-1" }, logicalModels: [], systemChannels: [] });
    mocks.getDramaProjectForUser.mockResolvedValue(project);
    mocks.capability.mockReturnValue({ candidates: [], supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: true, maxReferenceImages: 4 });
    mocks.prepareVideo.mockReturnValue({
        prompt: "最终视频提示词",
        visiblePrompt: "动态要求",
        references: [
            { role: "first_frame", url: "https://cdn/first.png" },
            { role: "last_frame", url: "https://cdn/last.png" },
            { role: "reference", url: "https://cdn/key.png" },
        ],
        parentTaskId: "key-task",
        frameSnapshot: { capturedAt: "t", references: [] },
        shot: { id: "shot-one", duration: 5, creationMode: "classic", generationAttempt: 1 },
    });
    mocks.persist.mockResolvedValue(undefined);
    mocks.fetchInternalApi.mockResolvedValue({ ok: true, status: 200, json: async () => ({ task: { id: "video-task-1", status: "running" } }) });
});

describe("POST /api/one-click-film/.../generate-video", () => {
    it("requires login and an episodeId", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await post()).status).toBe(401);
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        expect((await post("")).status).toBe(400);
    });

    it("rejects a project outside one-click-film", async () => {
        mocks.getDramaProjectForUser.mockResolvedValue({ ...project, sourceHandoffId: "drama-lab:abc" });
        expect((await post()).status).toBe(404);
    });

    it("attributes usage to one-click-film, never to the teaching workshop", async () => {
        const response = await post();
        expect(response.status).toBe(200);

        const [url, init] = mocks.fetchInternalApi.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
        expect(url).toBe("http://internal/api/video-generation-tasks");
        const body = JSON.parse(String(init.body)) as { context: Record<string, unknown>; references: Array<{ role: string }> };

        // 这是本次修复的核心断言：商单用量不得记到教学版账上。
        expect(body.context.featureModule).toBe("one-click-film");
        expect(JSON.stringify(body.context)).not.toContain("drama-lab");
        // 帧顺序仍须与 L 等价。
        expect(body.references.map((item) => item.role)).toEqual(["first_frame", "last_frame", "reference"]);
        expect(init.headers["X-VOZEB-PRO-Client-Request-Id"]).toBe("one-click-film-video:project-one:episode-one:shot-one:attempt-2");
    });

    it("keeps the shot running until sync writes back the result url", async () => {
        await post();
        expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({ generationStatus: "running", generationTaskId: "video-task-1", generationAttempt: 2 }) }));
    });

    it("refuses to resubmit a shot whose task is still active", async () => {
        mocks.prepareVideo.mockReturnValue({
            ...mocks.prepareVideo(),
            shot: { id: "shot-one", duration: 5, creationMode: "classic", generationTaskId: "video-task-1", generationStatus: "running" },
        });
        mocks.getVideoTask.mockResolvedValue({ userId: "user-one", status: "running" });
        const response = await post();
        expect(response.status).toBe(409);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("refuses to resubmit a task that needs review", async () => {
        mocks.prepareVideo.mockReturnValue({
            ...mocks.prepareVideo(),
            shot: { id: "shot-one", duration: 5, creationMode: "classic", generationTaskId: "video-task-1", generationNeedsReview: true },
        });
        mocks.getVideoTask.mockResolvedValue({ userId: "user-one", status: "success" });
        const response = await post();
        expect(response.status).toBe(409);
        expect((await response.json()).msg).toContain("不会重新提交");
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });
});
