import { describe, expect, it, vi } from "vitest";
import { persistCanvasAgentResult } from "./canvas-agent-result-save";
import type { CanvasAgentSnapshot } from "./canvas-agent-ops";
const snapshot: CanvasAgentSnapshot = { projectId: "p", title: "P", nodes: [], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
describe("Canvas Agent save acknowledgement", () => {
    it.each(["error", "conflict", "saving"] as const)("never reports %s as saved or reloads the project", async (status) => {
        const store = { updateProject: vi.fn(), flushProjectSave: vi.fn(async () => {}), saveStateByProject: { p: { status } } };
        const result = await persistCanvasAgentResult(snapshot, [], null, () => store);
        expect(result.status).toBe(status);
        expect(store.updateProject).toHaveBeenCalledWith("p", { nodes: [], connections: [], chatSessions: [], activeChatId: null });
        expect(store.flushProjectSave).toHaveBeenCalledTimes(1);
    });
    it("waits for actual acknowledgement, rather than a fulfilled flush alone", async () => {
        let release!: () => void;
        const store = {
            updateProject: vi.fn(),
            flushProjectSave: vi.fn(
                () =>
                    new Promise<void>((resolve) => {
                        release = () => {
                            store.saveStateByProject.p.status = "saved";
                            resolve();
                        };
                    }),
            ),
            saveStateByProject: { p: { status: "saving" as "saving" | "saved" } },
        };
        const saved = vi.fn();
        const pending = persistCanvasAgentResult(snapshot, [], null, () => store).then(saved);
        expect(saved).not.toHaveBeenCalled();
        release();
        await pending;
        expect(saved).toHaveBeenCalledWith({ status: "saved" });
    });
});
