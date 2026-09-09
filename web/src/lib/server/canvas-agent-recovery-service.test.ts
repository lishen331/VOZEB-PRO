import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn(), list: vi.fn(), events: vi.fn() }));
vi.mock("./canvas-project-store", () => ({ getCanvasProjectForRecovery: mocks.get, mutateCanvasProjectForRecovery: mocks.mutate }));
vi.mock("./generation-task-store", () => ({ listStoredGenerationTaskRecords: mocks.list }));
vi.mock("./creative-runtime-store", () => ({ CREATIVE_RUN_EVENT_BATCH_SIZE: 500, listCreativeRunEvents: mocks.events }));
import { recoverCanvasProjectForUser } from "./canvas-agent-recovery-service";
const project = { id: "canvas", title: "Canvas", nodes: [], connections: [], chatSessions: [], viewport: { x: 0, y: 0, k: 1 }, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
describe("Canvas recovery service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.get.mockResolvedValue(project);
        mocks.mutate.mockImplementation(async (_u, _id, fn) => fn(project));
        mocks.list.mockResolvedValue({ items: [], total: 0 });
        mocks.events.mockResolvedValue([]);
    });
    it("scopes reads by owner, project and Canvas surface and drains all pages", async () => {
        mocks.list.mockResolvedValueOnce({ items: [], total: 101 }).mockResolvedValueOnce({ items: [], total: 101 });
        await recoverCanvasProjectForUser("owner", "canvas");
        expect(mocks.list).toHaveBeenCalledTimes(2);
        expect(mocks.list).toHaveBeenNthCalledWith(1, expect.objectContaining({ userId: "owner", projectId: "canvas", surface: "canvas", type: "agent", page: 1, pageSize: 100, includeAll: false }));
        expect(mocks.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2 }));
    });
    it("uses durable final conversation replies instead of a fabricated summary", async () => {
        const run = { id: "r", surface: "canvas", projectId: "canvas", userId: "owner", conversationId: "c", inputMessageId: "i", assistantMessageId: "a", status: "completed", tasks: [], prompt: "What color?", createdAt: 1, updatedAt: 2 };
        mocks.list.mockResolvedValue({ items: [{ payload: run }], total: 1 });
        mocks.events.mockResolvedValue([{ id: "1", type: "run.completed", data: { reply: "Red" } }]);
        const result = await recoverCanvasProjectForUser("owner", "canvas");
        expect(result?.chatSessions[0].messages.at(-1)?.text).toBe("Red");
    });
    it("does not reread events for results with a persisted receipt", async () => {
        const run = { id: "r", userId: "owner", surface: "canvas", projectId: "canvas", status: "completed", tasks: [] };
        const { canvasAgentResultFingerprint } = await import("./canvas-agent-result-recovery");
        mocks.get.mockResolvedValue({ ...project, __canvasAgentReceipts: { r: canvasAgentResultFingerprint(run as never) } });
        mocks.list.mockResolvedValue({ items: [{ payload: run }], total: 1 });
        await recoverCanvasProjectForUser("owner", "canvas");
        expect(mocks.events).not.toHaveBeenCalled();
    });
    it("does not load other projects or any tasks after a failed ownership lookup", async () => {
        mocks.get.mockResolvedValue(null);
        expect(await recoverCanvasProjectForUser("other", "canvas")).toBeNull();
        expect(mocks.list).not.toHaveBeenCalled();
    });
});
