import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u" })) }));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: vi.fn(async () => ({ episodeId: "e1", storyOutline: "outline" })) }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.get, updateDramaProjectForUser: mocks.save }));
vi.mock("@/lib/server/drama-project-store", () => ({
    updateDramaProject: mocks.save,
    DramaProjectStoreError: class extends Error {
        status = 409;
    },
}));
vi.mock("@/lib/server/one-click-film/story-generation-service", () => ({
    generateOneClickStory: mocks.generate,
    DramaLabScriptGenerationError: class extends Error {
        constructor(
            message: string,
            readonly status = 502,
        ) {
            super(message);
        }
    },
}));
vi.mock("@/lib/server/internal-origin", () => ({ resolveInternalOrigin: vi.fn(() => "http://localhost") }));
vi.mock("@/lib/server/public-request-origin", () => ({ resolvePublicRequestOrigin: vi.fn(() => "http://localhost") }));
import { POST } from "./route";
const base = {
    id: "p",
    sourceHandoffId: "one-click-film:p",
    activeEpisodeId: "e1",
    summary: "outline",
    updatedAt: "2026-09-18T01:00:00Z",
    episodes: [
        { id: "e1", script: "old" },
        { id: "e2", script: "second" },
    ],
};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue({ episodes: [{ episode: 1, title: "生成标题", content: "generated" }], templateKey: "story" });
    mocks.save.mockImplementation(async (_user, project) => project);
});
describe("generated script persistence", () => {
    it("merges into the fresh project without reverting active episode or other edits", async () => {
        const fresh = { ...base, activeEpisodeId: "e2", title: "new title", updatedAt: "2026-09-18T02:00:00Z", episodes: [base.episodes[0], { id: "e2", script: "edited second" }] };
        mocks.get.mockResolvedValueOnce(base).mockResolvedValue(fresh);
        const response = await POST(new Request("http://localhost/api", { method: "POST" }), { params: Promise.resolve({ id: "p" }) });
        expect(response.status).toBe(200);
        expect(mocks.save).toHaveBeenCalledWith("u", expect.objectContaining({ activeEpisodeId: "e2", title: "new title", episodes: [expect.objectContaining({ id: "e1", script: "generated" }), { id: "e2", script: "edited second" }] }), fresh.updatedAt);
    });
    it("appends additional generated episodes without touching existing shots", async () => {
        const project = { ...base, episodes: [{ ...base.episodes[0], shots: [{ id: "shot" }] }, base.episodes[1]] };
        mocks.get.mockResolvedValue(project);
        mocks.generate.mockResolvedValue({
            episodes: [
                { episode: 1, title: "一", content: "one" },
                { episode: 2, title: "二", content: "two" },
            ],
            templateKey: "story",
        });
        const response = await POST(new Request("http://localhost/api", { method: "POST" }), { params: Promise.resolve({ id: "p" }) });
        expect(response.status).toBe(200);
        const saved = mocks.save.mock.calls[0][1];
        expect(saved.episodes).toHaveLength(3);
        expect(saved.episodes[0].shots).toEqual([{ id: "shot" }]);
        expect(saved.episodes[1]).toEqual(base.episodes[1]);
        expect(saved.episodes[2]).toMatchObject({ script: "two", title: "二", shots: [], episodeNumber: 3 });
    });
    it("rejects replacing a script edited while the model was generating", async () => {
        mocks.get.mockResolvedValueOnce(base).mockResolvedValue({ ...base, episodes: [{ id: "e1", script: "manual revision" }, base.episodes[1]] });
        const response = await POST(new Request("http://localhost/api", { method: "POST" }), { params: Promise.resolve({ id: "p" }) });
        expect(response.status).toBe(409);
        expect(mocks.save).not.toHaveBeenCalled();
    });
    it("does not resurrect a deleted target episode", async () => {
        mocks.get.mockResolvedValueOnce(base).mockResolvedValue({ ...base, episodes: [base.episodes[1]] });
        const response = await POST(new Request("http://localhost/api", { method: "POST" }), { params: Promise.resolve({ id: "p" }) });
        expect(response.status).toBe(409);
        expect(mocks.save).not.toHaveBeenCalled();
    });
});
