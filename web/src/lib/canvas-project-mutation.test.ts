import { describe, expect, it } from "vitest";

import type { CanvasProject } from "./canvas-project-contract";
import { applyCanvasProjectMutation, createCanvasProjectMutation, hasCanvasProjectMutationChanges, rebaseCanvasProjectMutation } from "./canvas-project-mutation";

function project(): CanvasProject {
    return {
        id: "canvas-one",
        title: "画布",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        nodes: [
            { id: "node-a", type: "text" as CanvasProject["nodes"][number]["type"], title: "A", position: { x: 0, y: 0 }, width: 100, height: 100 },
            { id: "node-b", type: "text" as CanvasProject["nodes"][number]["type"], title: "B", position: { x: 140, y: 0 }, width: 100, height: 100 },
        ],
        connections: [{ id: "edge-a", fromNodeId: "node-a", toNodeId: "node-b" }],
        chatSessions: [{ id: "session-a", title: "会话", messages: [], createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }],
        activeChatId: "session-a",
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
    };
}

describe("canvas project mutations", () => {
    it("sends only changed entities and scalar fields", () => {
        const previous = project();
        const next = {
            ...previous,
            title: "新标题",
            nodes: [
                { ...previous.nodes[0], title: "更新后的 A" },
                { id: "node-c", type: previous.nodes[0].type, title: "C", position: { x: 280, y: 0 }, width: 100, height: 100 },
            ],
            connections: [],
            updatedAt: "2026-08-01T00:00:00.001Z",
        };
        const mutation = createCanvasProjectMutation(previous, next, "mutation-one");
        expect(mutation).toMatchObject({ mutationId: "mutation-one", baseUpdatedAt: previous.updatedAt, title: "新标题", nodeDeletes: ["node-b"], connectionDeletes: ["edge-a"] });
        expect(mutation.nodeUpserts?.map((node) => node.id)).toEqual(["node-a", "node-c"]);
        expect(mutation).not.toHaveProperty("chatSessionUpserts");
    });

    it("applies updates in stable order and keeps unrelated data", () => {
        const previous = project();
        const mutation = createCanvasProjectMutation(previous, { ...previous, nodes: [{ ...previous.nodes[0], title: "更新" }], connections: [], updatedAt: "2026-08-01T00:00:00.001Z" }, "mutation-two");
        const applied = applyCanvasProjectMutation(previous, mutation, "2026-08-01T00:00:00.002Z");
        expect(applied.nodes.map((node) => node.id)).toEqual(["node-a"]);
        expect(applied.nodes[0].title).toBe("更新");
        expect(applied.connections).toEqual([]);
        expect(applied.chatSessions).toEqual(previous.chatSessions);
        expect(applied.updatedAt).toBe("2026-08-01T00:00:00.002Z");
    });

    it("rebases a mutation onto the latest snapshot without dropping remote nodes", () => {
        const latest = { ...project(), updatedAt: "2026-08-01T00:00:00.010Z", nodes: [...project().nodes, { id: "remote-node", type: "text" as CanvasProject["nodes"][number]["type"], title: "远端", position: { x: 400, y: 0 }, width: 100, height: 100 }] };
        const stale = project();
        const local = { ...stale, nodes: [...stale.nodes, { id: "local-node", type: "text" as CanvasProject["nodes"][number]["type"], title: "本地", position: { x: 280, y: 0 }, width: 100, height: 100 }], updatedAt: "2026-08-01T00:00:00.011Z" };
        const mutation = createCanvasProjectMutation(stale, local, "mutation-rebase");
        const rebased = rebaseCanvasProjectMutation(latest, mutation);
        const merged = applyCanvasProjectMutation(latest, rebased);
        expect(rebased.baseUpdatedAt).toBe(latest.updatedAt);
        expect(merged.nodes.map((node) => node.id)).toEqual(["node-a", "node-b", "remote-node", "local-node"]);
        expect(rebased.mutationId).toBe("mutation-rebase");
    });

    it("recognizes a mutation with no changed fields as a no-op", () => {
        const current = project();
        const mutation = createCanvasProjectMutation(current, { ...current, updatedAt: "2026-08-01T00:00:00.001Z" }, "mutation-empty");
        expect(mutation).toEqual({ mutationId: "mutation-empty", baseUpdatedAt: current.updatedAt });
        expect(hasCanvasProjectMutationChanges(mutation)).toBe(false);
    });
});
