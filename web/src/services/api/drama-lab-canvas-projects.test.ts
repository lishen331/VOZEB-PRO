import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteDramaLabCanvasAssistantConversations, getDramaLabCanvasProject, listCanvasProjectSummaries, saveDramaLabCanvasProjectMutation } from "./drama-lab-canvas-projects";

describe("drama lab canvas project api", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("uses only the dedicated drama-lab endpoints for detail mutations", async () => {
        const project = { id: "canvas-one", sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one" };
        const ack = { projectId: "canvas-one", updatedAt: "2026-08-25T00:00:00.001Z", mutationId: "mutation-one" };
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(Response.json({ code: 0, data: { project }, msg: "OK" }))
            .mockResolvedValueOnce(Response.json({ code: 0, data: { ack }, msg: "OK" }))
            .mockResolvedValueOnce(Response.json({ code: 0, data: { deleted: 1, chatSessions: [], activeChatId: null }, msg: "OK" }));
        vi.stubGlobal("fetch", fetchMock);

        await getDramaLabCanvasProject("canvas-one");
        await saveDramaLabCanvasProjectMutation("canvas-one", { mutationId: "mutation-one", baseUpdatedAt: "2026-08-25T00:00:00.000Z" });
        await deleteDramaLabCanvasAssistantConversations("canvas-one", ["conversation-one"]);

        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            "/api/drama-lab/canvas-projects/canvas-one",
            "/api/drama-lab/canvas-projects/canvas-one",
            "/api/drama-lab/canvas-projects/canvas-one/assistant-conversations",
        ]);
        expect(fetchMock.mock.calls.every(([url]) => !String(url).startsWith("/api/canvas/projects"))).toBe(true);
    });

    it("loads runtime summaries from the dedicated drama-lab collection", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ code: 0, data: { projects: [], total: 0, page: 1, pageSize: 12 }, msg: "OK" }));
        vi.stubGlobal("fetch", fetchMock);

        await listCanvasProjectSummaries({ page: 1, pageSize: 12 });

        expect(fetchMock).toHaveBeenCalledWith("/api/drama-lab/canvas-projects?page=1&pageSize=12", { cache: "no-store" });
    });
});
