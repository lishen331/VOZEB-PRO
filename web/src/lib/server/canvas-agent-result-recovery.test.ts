import { describe, expect, it } from "vitest";
import type { CanvasProject } from "@/lib/canvas-project-contract";
import type { AgentRun } from "./agent-run-store";
import { CanvasNodeType } from "@/app/(user)/canvas/types";
import { recoverCanvasAgentResults } from "./canvas-agent-result-recovery";

function project(): CanvasProject {
    return {
        id: "canvas",
        title: "Canvas",
        nodes: [{ id: "original", type: CanvasNodeType.Text, title: "Original", position: { x: 20, y: 30 }, width: 340, height: 240, metadata: { content: "old" } }],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 1, y: 2, k: 1 },
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
    };
}
function run(patch: Partial<AgentRun> = {}): AgentRun {
    return {
        id: "run",
        userId: "owner",
        projectId: "canvas",
        surface: "canvas",
        conversationId: "conversation",
        clientRequestId: "request",
        inputMessageId: "user-message",
        assistantMessageId: "assistant-message",
        prompt: "Write result",
        status: "completed",
        createdAt: 1,
        updatedAt: 2,
        referencedAssetIds: [],
        assetIds: [],
        reviewed: true,
        snapshot: { nodes: [{ id: "original", type: "text", metadata: { content: "old" } }] },
        tasks: [{ id: "text", title: "Result", type: "text", prompt: "Write", count: 1, dependencies: [], status: "completed", attempts: 1, result: { content: "new" } }],
        ...patch,
    };
}
describe("Canvas durable result recovery", () => {
    it("does not overwrite a target converted to another node type while generation runs", () => {
        const r = run();
        r.tasks[0].targetNodeId = "original";
        const p = project();
        p.nodes[0].type = CanvasNodeType.Image;
        const next = recoverCanvasAgentResults(p, [r], "owner");
        expect(next.nodes[0].type).toBe(CanvasNodeType.Image);
        expect(next.nodes[0].metadata?.content).toBe("old");
        expect(next.chatSessions[0].messages.at(-1)?.text).toContain("未覆盖");
    });

    it("settles an existing task placeholder without inventing a new task node", () => {
        const r = run();
        const p = project();
        p.nodes.push({ ...p.nodes[0], id: "task-run-0", type: CanvasNodeType.Task, metadata: { agentRunId: "run", agentTaskStatus: "running" } });
        const next = recoverCanvasAgentResults(p, [r], "owner");
        expect(next.nodes.find((n) => n.id === "task-run-0")?.metadata?.agentTaskStatus).toBe("completed");
        expect(next.nodes.filter((n) => n.type === CanvasNodeType.Task)).toHaveLength(1);
    });

    it("does not restore outputs deliberately deleted after live delivery before first recovery", () => {
        const p = project();
        p.chatSessions = [
            {
                id: "s",
                conversationId: "conversation",
                title: "Chat",
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
                messages: [{ id: "answer", runId: "run", role: "assistant", text: "Completed", detail: { nodeIds: ["output-run-0-0"], taskType: "text" } }],
            },
        ];
        const next = recoverCanvasAgentResults(p, [run()], "owner");
        expect(next.nodes).toEqual(p.nodes);
    });
    it("does not resurrect deleted successful children when a sibling retries", () => {
        const r = run({ status: "partial_success" });
        r.tasks = [
            {
                id: "image",
                title: "Image",
                type: "image",
                prompt: "Draw",
                count: 2,
                dependencies: [],
                attempts: 1,
                status: "failed",
                error: "quota",
                childTasks: [
                    { id: "ok", status: "completed", attempt: 1, result: { url: "/api/reference-assets/ok.png" } },
                    { id: "bad", status: "failed", attempt: 1, error: "quota" },
                ],
            },
        ];
        const recovered = recoverCanvasAgentResults(project(), [r], "owner");
        const p = { ...recovered, nodes: recovered.nodes.filter((n) => n.id !== "output-run-0-0") };
        const retry = structuredClone(r);
        retry.status = "completed";
        retry.tasks[0].status = "completed";
        retry.tasks[0].attempts = 2;
        retry.tasks[0].result = { results: [{ url: "/api/reference-assets/ok.png" }, { url: "/api/reference-assets/new.png" }] };
        retry.tasks[0].childTasks![1] = { id: "bad", status: "completed", attempt: 2, result: { url: "/api/reference-assets/new.png" } };
        const next = recoverCanvasAgentResults(p, [retry], "owner");
        expect(next.nodes.some((n) => n.id === "output-run-0-0")).toBe(false);
        expect(next.nodes.find((n) => n.id === "output-run-0-1")?.metadata?.content).toBe("/api/reference-assets/new.png");
    });

    it("retains completed child results even when their parent was cancelled", () => {
        const r = run({ status: "cancelled" });
        r.tasks = [
            {
                id: "images",
                title: "Images",
                type: "image",
                prompt: "private instructions",
                count: 2,
                dependencies: [],
                attempts: 1,
                status: "cancelled",
                childTasks: [
                    { id: "ok", status: "completed", attempt: 1, result: { url: "/api/reference-assets/ok.png" } },
                    { id: "cancel", status: "cancelled", attempt: 1 },
                ],
            },
        ];
        const p = recoverCanvasAgentResults(project(), [r], "owner");
        expect(p.nodes.find((n) => n.id === "output-run-0-0")?.metadata?.content).toBe("/api/reference-assets/ok.png");
        expect(p.nodes.some((n) => n.metadata?.prompt === "private instructions")).toBe(false);
    });
    it("does not mark a failed text edit's original content as a generated result", () => {
        const r = run({ status: "failed" });
        r.tasks = [{ ...r.tasks[0], targetNodeId: "original", status: "failed", error: "quota", result: undefined }];
        const p = project();
        const next = recoverCanvasAgentResults(p, [r], "owner");
        expect(next.nodes).toEqual(p.nodes);
    });
    it("records collisions instead of adopting a node with the same generated id", () => {
        const p = project();
        p.nodes.push({ ...p.nodes[0], id: "output-run-0-0", metadata: { content: "my manual node" } });
        const next = recoverCanvasAgentResults(p, [run()], "owner");
        expect(next.nodes.find((n) => n.id === "output-run-0-0")?.metadata?.content).toBe("my manual node");
        expect(next.chatSessions[0].messages.at(-1)?.text).toContain("未覆盖");
    });

    it("keeps the latest existing final answer when a conversation event is missing", () => {
        const p = project();
        p.chatSessions = [{ id: "s", conversationId: "conversation", title: "Chat", createdAt: p.createdAt, updatedAt: p.updatedAt, messages: [{ id: "a", runId: "run", role: "assistant", text: "The cat is red." }] }];
        const next = recoverCanvasAgentResults(p, [run({ tasks: [] })], "owner");
        expect(next.chatSessions[0].messages[0].text).toBe("The cat is red.");
    });
    it("retains each missing user turn in a shared recovered conversation", () => {
        const first = run();
        const second = run({ id: "run-two", inputMessageId: "i2", assistantMessageId: "a2", prompt: "Second request", createdAt: 3, updatedAt: 4 });
        const next = recoverCanvasAgentResults(project(), [first, second], "owner");
        expect(next.chatSessions).toHaveLength(1);
        expect(next.chatSessions[0].messages.filter((m) => m.role === "user").map((m) => m.text)).toEqual(["Write result", "Second request"]);
    });
    it("does not reapply a successful sibling when another task retries", () => {
        const first = run({ status: "partial_success" });
        first.tasks.push({ ...first.tasks[0], id: "failed", status: "failed", result: undefined, error: "upstream", attempts: 1 });
        const p = recoverCanvasAgentResults(project(), [first], "owner");
        const edited = { ...p, nodes: p.nodes.filter((n) => n.id !== "output-run-0-0") };
        const retried = structuredClone(first);
        retried.status = "completed";
        retried.tasks[1] = { ...retried.tasks[1], status: "completed", attempts: 2, result: { content: "second result" } };
        const next = recoverCanvasAgentResults(edited, [retried], "owner");
        expect(next.nodes.some((n) => n.id === "output-run-0-0")).toBe(false);
        expect(next.nodes.find((n) => n.id === "output-run-1-0")?.metadata?.content).toBe("second result");
    });

    it("recovers a completed text result and its conversation without a live browser", () => {
        const r = run();
        const recovered = recoverCanvasAgentResults(project(), [r], "owner");
        expect(recovered.nodes.find((n) => n.id === "output-run-0-0")?.metadata?.content).toBe("new");
        expect(recovered.nodes[0].metadata?.content).toBe("old");
        expect(recovered.chatSessions[0].conversationId).toBe("conversation");
        expect(recovered.chatSessions[0].messages.some((m) => m.runId === "run" && m.role === "assistant" && m.text.includes("new"))).toBe(true);
        expect(recovered.viewport).toEqual(project().viewport);
        expect(recoverCanvasAgentResults(recovered, [r], "owner")).toBe(recovered);
    });
    it("never recreates a result manually deleted after recovery", () => {
        const r = run();
        const recovered = recoverCanvasAgentResults(project(), [r], "owner");
        const deleted = { ...recovered, nodes: recovered.nodes.filter((n) => n.id !== "output-run-0-0") };
        expect(recoverCanvasAgentResults(deleted, [r], "owner")).toBe(deleted);
    });
    it("edits unchanged targets in place and preserves user layout", () => {
        const r = run();
        r.tasks[0].targetNodeId = "original";
        const next = recoverCanvasAgentResults(project(), [r], "owner");
        expect(next.nodes).toHaveLength(1);
        expect(next.nodes[0].metadata?.content).toBe("new");
        expect(next.nodes[0].position).toEqual({ x: 20, y: 30 });
    });
    it("preserves concurrent user text and saves the generated alternative on conflict", () => {
        const r = run();
        r.tasks[0].targetNodeId = "original";
        const p = project();
        p.nodes[0].metadata = { content: "user edited" };
        const next = recoverCanvasAgentResults(p, [r], "owner");
        expect(next.nodes[0].metadata?.content).toBe("user edited");
        expect(next.nodes.find((n) => n.id === "recovered-run-text-0")?.metadata?.content).toBe("new");
        expect(next.chatSessions[0].messages.at(-1)?.text).toContain("未覆盖");
    });
    it("does not resurrect a deleted target", () => {
        const r = run();
        r.tasks[0].targetNodeId = "original";
        const next = recoverCanvasAgentResults({ ...project(), nodes: [] }, [r], "owner");
        expect(next.nodes.some((n) => n.id === "original")).toBe(false);
        expect(next.nodes[0].metadata?.content).toBe("new");
    });
    it("does not overwrite an existing result edited after live delivery", () => {
        const r = run();
        const p = project();
        p.nodes.push({ ...p.nodes[0], id: "output-run-0-0", metadata: { content: "manual correction", agentRunId: "run" } });
        const next = recoverCanvasAgentResults(p, [r], "owner");
        expect(next.nodes.find((n) => n.id === "output-run-0-0")?.metadata?.content).toBe("manual correction");
    });
    it("keeps successful siblings of a partial media run and binds real sources", () => {
        const r = run({ status: "partial_success" });
        r.tasks = [
            {
                id: "image",
                title: "Image",
                type: "image",
                prompt: "Draw",
                count: 2,
                dependencies: [],
                attempts: 1,
                status: "failed",
                error: "failed",
                references: [{ nodeId: "original", type: "image", url: "/source.png" }],
                childTasks: [
                    { id: "ok", status: "completed", attempt: 1, result: { url: "/api/reference-assets/result.png", width: 640, height: 480 } },
                    { id: "bad", status: "failed", attempt: 1, error: "quota" },
                ],
            },
        ];
        const next = recoverCanvasAgentResults(project(), [r], "owner");
        expect(next.nodes.find((n) => n.id === "output-run-0-0")?.metadata).toMatchObject({ content: "/api/reference-assets/result.png", status: "success" });
        expect(next.nodes.find((n) => n.id === "output-run-0-1")?.metadata?.status).toBe("error");
        expect(next.connections.some((c) => c.fromNodeId === "original" && c.toNodeId === "output-run-0-0")).toBe(true);
        expect(next.chatSessions[0].messages.at(-1)?.text).toContain("部分");
    });
    it("updates conversation by run identity without creating duplicate sessions", () => {
        const p = project();
        p.activeChatId = "local-session";
        p.chatSessions = [
            {
                id: "local-session",
                conversationId: "conversation",
                title: "Existing",
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
                messages: [
                    { id: "local-input", role: "user", text: "Write result" },
                    { id: "local-reply", role: "assistant", runId: "run", text: "Received" },
                ],
            },
        ];
        const next = recoverCanvasAgentResults(p, [run()], "owner");
        expect(next.chatSessions).toHaveLength(1);
        expect(next.chatSessions[0].messages).toHaveLength(2);
        expect(next.chatSessions[0].messages[1]).toMatchObject({ id: "local-reply", runId: "run" });
        expect(next.activeChatId).toBe("local-session");
    });
    it("ignores active, non-Canvas, wrong-project and wrong-owner runs", () => {
        const p = project();
        expect(recoverCanvasAgentResults(p, [run({ status: "running" }), run({ surface: "chat" }), run({ projectId: "other" }), run({ userId: "other" })], "owner")).toBe(p);
    });
    it("ignores background review changes after delivery", () => {
        const r = run();
        const p = recoverCanvasAgentResults(project(), [r], "owner");
        expect(recoverCanvasAgentResults(p, [{ ...r, updatedAt: 300, reviewed: false }], "owner")).toBe(p);
    });
    it("does not claim failed or cancelled work as generated success", () => {
        for (const status of ["failed", "cancelled"] as const) {
            const r = run({ status, tasks: [] });
            const next = recoverCanvasAgentResults(project(), [r], "owner");
            expect(next.nodes).toHaveLength(1);
            expect(next.chatSessions[0].messages.at(-1)?.text).not.toContain("已完成");
        }
    });
});
