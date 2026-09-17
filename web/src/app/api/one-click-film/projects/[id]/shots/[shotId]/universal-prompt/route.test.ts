import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getDramaProjectForUser: vi.fn(),
    updateDramaProjectForUser: vi.fn(),
    generateOneClickUniversalPrompt: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.getDramaProjectForUser, updateDramaProjectForUser: mocks.updateDramaProjectForUser }));
vi.mock("@/lib/server/public-request-origin", () => ({ resolvePublicRequestOrigin: () => "http://app.example.com" }));
vi.mock("@/lib/server/one-click-film/universal-prompt-service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/one-click-film/universal-prompt-service")>("@/lib/server/one-click-film/universal-prompt-service");
    return { ...actual, generateOneClickUniversalPrompt: mocks.generateOneClickUniversalPrompt };
});

import { POST } from "./route";

const shot = { id: "shot-one", universalSegmentText: "", creationMode: "classic", duration: 5, sceneId: "", characterIds: [], propIds: [] };
const project = {
    id: "project-one",
    sourceHandoffId: "one-click-film:abc",
    updatedAt: "2026-09-01T00:00:00.000Z",
    style: "写实",
    ratio: "16:9",
    characters: [],
    scenes: [],
    props: [],
    episodes: [{ id: "episode-one", shots: [shot] }],
} as unknown as DramaProject;

describe("POST /api/one-click-film/projects/:id/shots/:shotId/universal-prompt", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getDramaProjectForUser.mockResolvedValue(project);
        mocks.generateOneClickUniversalPrompt.mockResolvedValue({
            text: "画面风格和类型: 真人写实\n生成一个由以下1个分镜组成的视频。\n环境、光影与陈设定性参考 @图片1。\n分镜1： 5秒: 测试",
            model: "text-model",
            channelId: "channel-one",
            upstreamModel: "text-model",
        });
        mocks.updateDramaProjectForUser.mockImplementation(async (_userId: string, _id: string, value: DramaProject) => value);
    });

    it("rejects projects that are not one-click-film", async () => {
        mocks.getDramaProjectForUser.mockResolvedValue({ ...project, sourceHandoffId: "drama-lab:abc" });
        const response = await POST(new Request("http://app.example.com/api/one-click-film/projects/project-one/shots/shot-one/universal-prompt", { method: "POST", body: JSON.stringify({ mode: "generate" }) }), {
            params: Promise.resolve({ id: "project-one", shotId: "shot-one" }),
        });
        expect(response.status).toBe(404);
    });

    it("generates and persists universal_segment_text onto the real shot", async () => {
        const response = await POST(new Request("http://app.example.com/api/one-click-film/projects/project-one/shots/shot-one/universal-prompt", { method: "POST", body: JSON.stringify({ mode: "generate" }) }), {
            params: Promise.resolve({ id: "project-one", shotId: "shot-one" }),
        });
        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.data.universalSegmentText).toContain("分镜1： 5秒");
        expect(mocks.updateDramaProjectForUser).toHaveBeenCalledWith(
            "user-one",
            "project-one",
            expect.objectContaining({ episodes: [expect.objectContaining({ shots: [expect.objectContaining({ id: "shot-one", creationMode: "universal", universalSegmentText: expect.stringContaining("分镜1") })] })] }),
        );
    });

    it("rejects polish mode without a draft", async () => {
        const response = await POST(new Request("http://app.example.com/api/one-click-film/projects/project-one/shots/shot-one/universal-prompt", { method: "POST", body: JSON.stringify({ mode: "polish" }) }), {
            params: Promise.resolve({ id: "project-one", shotId: "shot-one" }),
        });
        expect(response.status).toBe(400);
        expect(mocks.generateOneClickUniversalPrompt).not.toHaveBeenCalled();
    });
});
