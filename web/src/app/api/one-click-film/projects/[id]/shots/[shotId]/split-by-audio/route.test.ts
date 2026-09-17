import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getDramaProjectForUser: vi.fn(), applyDetailed: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.getDramaProjectForUser }));
vi.mock("@/lib/server/drama-lab-audio-split-service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/drama-lab-audio-split-service")>("@/lib/server/drama-lab-audio-split-service");
    return { ...actual, applyDramaAudioSplitDetailed: mocks.applyDetailed };
});

import { POST } from "./route";

const shot = {
    id: "shot-one",
    duration: 8,
    utterances: [
        { type: "dialogue", speaker: "甲", text: "第一句台词" },
        { type: "dialogue", speaker: "乙", text: "第二句台词" },
    ],
    dialogueAudio: { status: "success", url: "https://cdn/a.mp3", durationMs: 8000 },
};

const project = {
    id: "project-one",
    sourceHandoffId: "one-click-film:abc",
    updatedAt: "2026-09-01T00:00:00.000Z",
    characters: [],
    scenes: [],
    props: [],
    episodes: [{ id: "episode-one", shots: [shot] }],
} as unknown as DramaProject;

const url = "http://app.example.com/api/one-click-film/projects/project-one/shots/shot-one/split-by-audio?episodeId=episode-one";
const params = Promise.resolve({ id: "project-one", shotId: "shot-one" });
const post = (body: unknown, target = url) => POST(new Request(target, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
    mocks.getDramaProjectForUser.mockResolvedValue(project);
});

describe("POST /api/one-click-film/projects/:id/shots/:shotId/split-by-audio", () => {
    it("requires login", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await post({ action: "preview" })).status).toBe(401);
    });

    it("rejects a project that does not belong to one-click-film", async () => {
        mocks.getDramaProjectForUser.mockResolvedValue({ ...project, sourceHandoffId: "drama-lab:abc" });
        const response = await post({ action: "preview" });
        expect(response.status).toBe(404);
        expect((await response.json()).msg).toBe("一键成片项目不存在");
    });

    it("requires episodeId", async () => {
        const response = await post({ action: "preview" }, "http://app.example.com/api/one-click-film/projects/project-one/shots/shot-one/split-by-audio");
        expect(response.status).toBe(400);
    });

    it("previews a plan without mutating the project", async () => {
        const response = await post({ action: "preview" });
        expect(response.status).toBe(200);
        const payload = (await response.json()) as { data: { plan: { segments: unknown[] }; sourceUpdatedAt: string } };
        expect(payload.data.sourceUpdatedAt).toBe("2026-09-01T00:00:00.000Z");
        expect(payload.data.plan.segments.length).toBeGreaterThan(0);
        expect(mocks.applyDetailed).not.toHaveBeenCalled();
    });

    it("applies the plan append-only and reports created shots", async () => {
        mocks.applyDetailed.mockResolvedValue({ project, sourceShotId: "shot-one", createdShots: [{ id: "shot-one-a1" }], skippedSegmentIndexes: [], preservedShotIds: ["shot-one"] });
        const response = await post({ action: "apply" });
        expect(response.status).toBe(200);
        const payload = (await response.json()) as { data: { createdShots: unknown[]; preservedShotIds: string[] }; msg: string };
        expect(payload.data.createdShots).toHaveLength(1);
        expect(payload.data.preservedShotIds).toEqual(["shot-one"]);
        expect(payload.msg).toContain("已追加 1 条音频拆镜候选");
        expect(mocks.applyDetailed).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one", episodeId: "episode-one", shotId: "shot-one", expectedUpdatedAt: "2026-09-01T00:00:00.000Z" }));
    });
});
