import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({
    getDramaProject: vi.fn(),
    createDramaLabCanvasProjectForUser: vi.fn(),
    getCanvasProject: vi.fn(),
    updateCanvasProject: vi.fn(),
}));

vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProject: mocks.getDramaProject }));
vi.mock("@/lib/server/canvas-project-service", () => ({ createDramaLabCanvasProjectForUser: mocks.createDramaLabCanvasProjectForUser }));
vi.mock("@/lib/server/canvas-project-store", () => ({ getCanvasProject: mocks.getCanvasProject, updateCanvasProject: mocks.updateCanvasProject }));

import { dramaLabEpisodeCanvasSourceHandoffId, getOrCreateDramaLabEpisodeCanvasForUser, projectEpisodeToCanvas } from "./drama-lab-episode-canvas-service";

describe("drama lab episode canvas service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.createDramaLabCanvasProjectForUser.mockImplementation(async (_userId: string, value: { sourceHandoffId?: string; project?: unknown }) => ({
            id: "canvas-episode-one",
            sourceHandoffId: value.sourceHandoffId,
            createdAt: "2026-08-25T00:00:00.000Z",
            updatedAt: "2026-08-25T00:00:00.000Z",
            ...(value.project || {}),
        }));
        mocks.updateCanvasProject.mockImplementation(async (_userId: string, project: unknown) => project);
    });

    it("creates one isolated CanvasProject per owned project episode and projects real relationships", async () => {
        mocks.getDramaProject.mockResolvedValue(projectFixture());

        const result = await getOrCreateDramaLabEpisodeCanvasForUser("user-one", "drama-one", "episode-one");

        expect(result).toMatchObject({ project: { id: "canvas-episode-one" } });

        expect(mocks.getDramaProject).toHaveBeenCalledWith("drama-one", "user-one");
        expect(mocks.createDramaLabCanvasProjectForUser).toHaveBeenCalledWith(
            "user-one",
            expect.objectContaining({
                title: "我的短剧 · 第一集",
                sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one",
                project: expect.objectContaining({ sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one" }),
            }),
        );

        const input = mocks.createDramaLabCanvasProjectForUser.mock.calls[0][1] as {
            project: {
                nodes: Array<{ id: string; metadata?: Record<string, unknown> }>;
                connections: Array<{ id: string; fromNodeId: string; toNodeId: string }>;
            };
        };
        const nodes = input.project.nodes;
        expect(nodes.map((node) => node.id)).toEqual(
            expect.arrayContaining([
                "dl:drama-one:episode:episode-one:episode",
                "dl:drama-one:episode:episode-one:script",
                "dl:drama-one:episode:episode-one:character:character-one",
                "dl:drama-one:episode:episode-one:scene:scene-one",
                "dl:drama-one:episode:episode-one:prop:prop-one",
                "dl:drama-one:episode:episode-one:shot:shot-one",
                "dl:drama-one:episode:episode-one:shot:shot-one:image",
                "dl:drama-one:episode:episode-one:shot:shot-one:video",
            ]),
        );

        const shotNode = nodes.find((node) => node.id.endsWith(":shot:shot-one"));
        expect(shotNode?.metadata).toMatchObject({ projectionOwned: true, dramaProjectId: "drama-one", episodeId: "episode-one", shotId: "shot-one", sourceEntityId: "shot-one" });
        expect(input.project.connections).toEqual(
            expect.arrayContaining([
                { id: expect.any(String), fromNodeId: "dl:drama-one:episode:episode-one:episode", toNodeId: "dl:drama-one:episode:episode-one:script" },
                { id: expect.any(String), fromNodeId: "dl:drama-one:episode:episode-one:script", toNodeId: "dl:drama-one:episode:episode-one:shot:shot-one" },
                { id: expect.any(String), fromNodeId: expect.stringContaining(":character:character-one"), toNodeId: expect.stringContaining(":shot:shot-one") },
                { id: expect.any(String), fromNodeId: expect.stringContaining(":scene:scene-one"), toNodeId: expect.stringContaining(":shot:shot-one") },
                { id: expect.any(String), fromNodeId: expect.stringContaining(":prop:prop-one"), toNodeId: expect.stringContaining(":shot:shot-one") },
                { id: expect.any(String), fromNodeId: "dl:drama-one:episode:episode-one:shot:shot-one", toNodeId: "dl:drama-one:episode:episode-one:shot:shot-one:image" },
                { id: expect.any(String), fromNodeId: "dl:drama-one:episode:episode-one:shot:shot-one", toNodeId: "dl:drama-one:episode:episode-one:shot:shot-one:video" },
            ]),
        );
        expect(input.project.connections).toHaveLength(7);
        expect(input.project.connections.some((edge) => edge.fromNodeId.includes("character-ghost") || edge.fromNodeId.includes("prop-ghost"))).toBe(false);
    });

    it("rejects a missing project or an episode that belongs to another project", async () => {
        mocks.getDramaProject.mockResolvedValueOnce(null);
        await expect(getOrCreateDramaLabEpisodeCanvasForUser("user-one", "missing", "episode-one")).rejects.toMatchObject({ status: 404 });

        mocks.getDramaProject.mockResolvedValueOnce({ ...projectFixture(), episodes: [{ ...projectFixture().episodes[0], id: "different-episode" }] });
        await expect(getOrCreateDramaLabEpisodeCanvasForUser("user-one", "drama-one", "episode-one")).rejects.toMatchObject({ status: 404 });
        expect(mocks.createDramaLabCanvasProjectForUser).not.toHaveBeenCalled();
    });

    it("uses the exact project and episode handoff key", () => {
        expect(dramaLabEpisodeCanvasSourceHandoffId("drama-one", "episode-one")).toBe("drama-lab-canvas:drama-one:episode:episode-one");
    });

    it("rejects overlong identity components instead of truncating them into the same binding", async () => {
        await expect(getOrCreateDramaLabEpisodeCanvasForUser("user-one", "x".repeat(161), "episode-one")).rejects.toMatchObject({ status: 400 });
        expect(mocks.getDramaProject).not.toHaveBeenCalled();
    });

    it("refreshes system projections without replacing free nodes, user links, or system-node layout", async () => {
        mocks.getDramaProject.mockResolvedValue(projectFixture());
        const prefix = "dl:drama-one:episode:episode-one";
        mocks.createDramaLabCanvasProjectForUser.mockResolvedValue({
            id: "canvas-episode-one",
            sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one",
            title: "旧标题",
            createdAt: "2026-08-25T00:00:00.000Z",
            updatedAt: "2026-08-25T00:00:00.000Z",
            nodes: [
                {
                    id: `${prefix}:script`,
                    type: "text",
                    title: "旧剧本",
                    position: { x: 777, y: 888 },
                    width: 500,
                    height: 360,
                    metadata: { dramaProjectId: "drama-one", episodeId: "episode-one", sourceEntityType: "script", sourceEntityId: "episode-one", content: "旧内容" },
                },
                {
                    id: `${prefix}:shot:deleted`,
                    type: "text",
                    title: "已删除分镜",
                    position: { x: 0, y: 0 },
                    width: 300,
                    height: 200,
                    metadata: { dramaProjectId: "drama-one", episodeId: "episode-one", sourceEntityType: "shot", sourceEntityId: "deleted" },
                },
                { id: "free-note", type: "text", title: "自由节点", position: { x: 10, y: 20 }, width: 300, height: 200, metadata: { content: "保留" } },
                { id: `${prefix}:custom:note`, type: "text", title: "前缀相同的自由节点", position: { x: 30, y: 40 }, width: 300, height: 200, metadata: { content: "仍需保留" } },
            ],
            connections: [
                { id: "free-edge", fromNodeId: "free-note", toNodeId: `${prefix}:script` },
                { id: `${prefix}:edge:user`, fromNodeId: `${prefix}:custom:note`, toNodeId: `${prefix}:script` },
            ],
            chatSessions: [],
            activeChatId: null,
            backgroundMode: "lines",
            showImageInfo: false,
            viewport: { x: 9, y: 8, k: 0.6 },
        });

        const result = await getOrCreateDramaLabEpisodeCanvasForUser("user-one", "drama-one", "episode-one");

        expect(mocks.updateCanvasProject).toHaveBeenCalledTimes(1);
        const saved = mocks.updateCanvasProject.mock.calls[0][1];
        expect(saved.nodes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: "free-note" }),
                expect.objectContaining({ id: `${prefix}:custom:note` }),
                expect.objectContaining({ id: `${prefix}:script`, position: { x: 777, y: 888 }, width: 500, height: 360 }),
            ]),
        );
        expect(saved.nodes.some((node: { id: string }) => node.id === `${prefix}:shot:deleted`)).toBe(false);
        expect(saved.connections).toContainEqual({ id: "free-edge", fromNodeId: "free-note", toNodeId: `${prefix}:script` });
        expect(saved.connections).toContainEqual({ id: `${prefix}:edge:user`, fromNodeId: `${prefix}:custom:note`, toNodeId: `${prefix}:script` });
        expect(saved.viewport).toEqual({ x: 9, y: 8, k: 0.6 });
        expect(result.project).toBe(saved);
    });

    it("focuses a requested real shot and rejects a foreign shot id", async () => {
        mocks.getDramaProject.mockResolvedValue(projectFixture());

        const result = await getOrCreateDramaLabEpisodeCanvasForUser("user-one", "drama-one", "episode-one", "shot-one");
        expect(result.project.viewport).toEqual({ x: -520, y: 250, k: 0.72 });
        expect(result.binding).toMatchObject({ shotId: "shot-one" });

        await expect(getOrCreateDramaLabEpisodeCanvasForUser("user-one", "drama-one", "episode-one", "shot-foreign")).rejects.toMatchObject({ status: 404 });
    });

    it("keeps distinct frame-role nodes when several roles reuse the same media URL", () => {
        const fixture = projectFixture();
        const shot = fixture.episodes[0].shots[0];
        shot.storyboardImageUrl = "/api/reference-assets/shared.png";
        shot.frames = {
            first: { prompt: "首帧", status: "success", url: "/api/reference-assets/shared.png" },
            key: { prompt: "关键帧", status: "success", url: "/api/reference-assets/shared.png" },
            last: { prompt: "尾帧", status: "success", url: "/api/reference-assets/shared.png" },
        };

        const projection = projectEpisodeToCanvas(fixture, fixture.episodes[0]);
        const ids = projection.nodes.map((node) => node.id);
        expect(ids).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/:shot:shot-one:image$/),
                expect.stringMatching(/:shot:shot-one:frame:first$/),
                expect.stringMatching(/:shot:shot-one:frame:key$/),
                expect.stringMatching(/:shot:shot-one:frame:last$/),
            ]),
        );
    });

    it("reapplies the projection once to the latest canvas after a concurrent sync conflict", async () => {
        const dramaProject = projectFixture();
        mocks.getDramaProject.mockResolvedValue(dramaProject);
        const projection = projectEpisodeToCanvas(dramaProject, dramaProject.episodes[0]);
        const initial = {
            id: "canvas-episode-one",
            sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one",
            title: "旧标题",
            createdAt: "2026-08-25T00:00:00.000Z",
            updatedAt: "2026-08-25T00:00:00.000Z",
            nodes: projection.nodes,
            connections: projection.connections,
            viewport: projection.viewport,
            chatSessions: [],
            activeChatId: null,
            backgroundMode: "lines" as const,
            showImageInfo: false,
        };
        const latest = {
            ...initial,
            updatedAt: "2026-08-25T00:00:01.000Z",
            nodes: [...initial.nodes, { id: "free-concurrent", type: "text", title: "并发自由节点", position: { x: 30, y: 40 }, width: 300, height: 200 }],
        };
        mocks.createDramaLabCanvasProjectForUser.mockResolvedValue(initial);
        mocks.getCanvasProject.mockResolvedValue(latest);
        mocks.updateCanvasProject.mockRejectedValueOnce(Object.assign(new Error("conflict"), { status: 409 })).mockImplementationOnce(async (_userId: string, project: unknown) => project);

        const result = await getOrCreateDramaLabEpisodeCanvasForUser("user-one", "drama-one", "episode-one");

        expect(mocks.getCanvasProject).toHaveBeenCalledWith(initial.id, "user-one");
        expect(mocks.updateCanvasProject).toHaveBeenCalledTimes(2);
        expect(mocks.updateCanvasProject).toHaveBeenLastCalledWith("user-one", expect.objectContaining({ nodes: expect.arrayContaining([expect.objectContaining({ id: "free-concurrent" })]) }), latest.updatedAt);
        expect(result.project.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "free-concurrent" })]));
    });
});

function projectFixture(): DramaProject {
    return {
        id: "drama-one",
        title: "我的短剧",
        summary: "梗概",
        style: "电影感",
        ratio: "9:16",
        status: "active" as const,
        characters: [
            { id: "character-one", name: "小雨", description: "主角", references: [{ id: "character-ref", url: "/character.png", source: "upload" as const, label: "主参考图", createdAt: "2026-08-25T00:00:00.000Z" }], primaryReferenceId: "character-ref" },
        ],
        scenes: [{ id: "scene-one", name: "咖啡店", description: "室内", referenceImageUrl: "/scene.png" }],
        props: [{ id: "prop-one", name: "手机", description: "黑色手机", referenceImageUrl: "/prop.png" }],
        clues: [],
        defaultVideoMode: "storyboard" as const,
        episodes: [
            {
                id: "episode-one",
                episodeNumber: 1,
                title: "第一集",
                script: "小雨走进咖啡店。",
                outline: "",
                hook: "",
                nextPreview: "",
                sourceRange: "",
                reviewStatus: "draft" as const,
                shots: [
                    {
                        id: "shot-one",
                        order: 1,
                        title: "走进咖啡店",
                        description: "小雨推门进入。",
                        sourceText: "",
                        shotBoundary: "",
                        dialogue: "",
                        narration: "",
                        utterances: [],
                        imagePrompt: "",
                        videoPrompt: "",
                        cameraMotion: "",
                        duration: 4,
                        characterIds: ["character-one", "character-ghost"],
                        propIds: ["prop-one", "prop-ghost"],
                        clueIds: [],
                        sceneId: "scene-one",
                        storyboardImageUrl: "/shot.png",
                        videoUrl: "https://cdn.example/shot.mp4",
                    },
                ],
            },
        ],
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:00:00.000Z",
    };
}
