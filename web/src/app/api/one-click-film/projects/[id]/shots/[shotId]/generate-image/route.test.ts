import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getAuthSettings: vi.fn(),
    getDramaProjectForUser: vi.fn(),
    prepareImage: vi.fn(),
    persist: vi.fn(),
    fetchInternalApi: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.getDramaProjectForUser }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi, resolveInternalOrigin: (o: string) => o }));
vi.mock("@/lib/server/public-request-origin", () => ({ resolvePublicRequestOrigin: () => "http://internal" }));
vi.mock("@/lib/server/maintenance-auth", () => ({ maintenanceWorkerContextHeaders: () => null, requestRuntimeCredential: () => "session=1" }));
vi.mock("@/lib/server/drama-lab-shot-generation-service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/drama-lab-shot-generation-service")>("@/lib/server/drama-lab-shot-generation-service");
    return { ...actual, prepareDramaLabStoryboardImage: mocks.prepareImage, persistDramaLabShotUpdate: mocks.persist };
});

import { POST } from "./route";

const project = {
    id: "project-one",
    title: "商单短剧",
    sourceHandoffId: "one-click-film:abc",
    ratio: "9:16",
    creativeConversationId: "conv-1",
    episodes: [{ id: "episode-one", shots: [{ id: "shot-one" }] }],
} as unknown as DramaProject;

const params = Promise.resolve({ id: "project-one", shotId: "shot-one" });
const post = (query = "?episodeId=episode-one") => POST(new Request(`http://app.example.com/api/one-click-film/projects/project-one/shots/shot-one/generate-image${query}`, { method: "POST" }), { params });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
    mocks.getAuthSettings.mockResolvedValue({ defaultModels: { imageModel: "image-1" } });
    mocks.getDramaProjectForUser.mockResolvedValue(project);
    mocks.prepareImage.mockResolvedValue({
        prompt: "最终分镜图提示词",
        references: [{ id: "scene-ref", url: "/api/reference-assets/scene.png", label: "场景主图" }],
        templateKey: "key_frame_prompt",
        shot: { id: "shot-one", title: "镜头一", storyboardAttempt: 1 },
    });
    mocks.persist.mockResolvedValue(undefined);
    mocks.fetchInternalApi.mockResolvedValue({ ok: true, status: 200, json: async () => ({ task: { id: "image-task-1", status: "running" } }) });
});

describe("POST /api/one-click-film/.../generate-image", () => {
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
        expect(url).toBe("http://internal/api/image-tasks");
        const body = JSON.parse(String(init.body)) as { context: Record<string, unknown>; kind: string; prompt: string };

        expect(body.context.featureModule).toBe("one-click-film");
        expect(JSON.stringify(body.context)).not.toContain("drama-lab");
        expect(body.prompt).toBe("最终分镜图提示词");
        expect(init.headers["X-VOZEB-PRO-Client-Request-Id"]).toBe("one-click-film-storyboard:project-one:episode-one:shot-one:attempt-2");
    });

    it("uses edit when references exist and generation when they do not", async () => {
        await post();
        expect(JSON.parse(String((mocks.fetchInternalApi.mock.calls[0][1] as RequestInit).body)).kind).toBe("edit");

        mocks.fetchInternalApi.mockClear();
        mocks.prepareImage.mockResolvedValue({ prompt: "p", references: [], templateKey: "k", shot: { id: "shot-one", title: "镜头一" } });
        await post();
        expect(JSON.parse(String((mocks.fetchInternalApi.mock.calls[0][1] as RequestInit).body)).kind).toBe("generation");
    });

    it("persists the running task binding for refresh recovery", async () => {
        await post();
        expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({ storyboardStatus: "running", storyboardTaskId: "image-task-1", storyboardAttempt: 2 }) }));
    });

    it("surfaces a missing default image model as 503", async () => {
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: {} });
        const response = await post();
        expect(response.status).toBe(503);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });
});
