import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "owner" })) }));
import { createCanvasProject, getCanvasProject, updateCanvasProjectMutationPatch } from "./canvas-project-store";
import { writeJsonDataFile, readJsonDataFile } from "./data-adapter";
import { recoverCanvasProjectForUser } from "./canvas-agent-recovery-service";
import { POST } from "@/app/api/canvas/projects/[id]/recover-agent-results/route";
import { CanvasNodeType } from "@/app/(user)/canvas/types";
import type { CanvasProject } from "@/lib/canvas-project-contract";
let dir = "";
const now = "2026-09-08T00:00:00.000Z";
const p: CanvasProject = {
    id: "canvas",
    title: "Fixture",
    nodes: [{ id: "original", type: CanvasNodeType.Text, title: "Original", position: { x: 0, y: 0 }, width: 340, height: 240, metadata: { content: "original" } }],
    connections: [],
    chatSessions: [],
    activeChatId: null,
    viewport: { x: 0, y: 0, k: 1 },
    backgroundMode: "lines",
    showImageInfo: false,
    createdAt: now,
    updatedAt: now,
};
async function seed() {
    await createCanvasProject("owner", p);
    const r = {
        id: "run",
        projectId: "canvas",
        userId: "owner",
        surface: "canvas",
        status: "completed",
        createdAt: 1,
        updatedAt: 2,
        conversationId: "conversation",
        inputMessageId: "i",
        assistantMessageId: "a",
        prompt: "New text",
        tasks: [{ id: "text", type: "text", title: "Result", status: "completed", prompt: "Write", count: 1, attempts: 1, dependencies: [], result: { content: "final" } }],
        assetIds: [],
        snapshot: { nodes: [] },
    };
    await writeJsonDataFile("generation-tasks.json", [{ id: r.id, userId: r.userId, type: "agent", status: "success", surface: "canvas", projectId: "canvas", createdAt: 1, updatedAt: 2, expiresAt: Date.now() + 60000, payload: r }]);
    await writeJsonDataFile("creative-runtime.json", { version: 1, nextEventId: 2, conversations: [], messages: [], assets: [], events: [{ id: "1", runId: "run", type: "run.completed", data: { reply: "Saved final text" }, createdAt: 2 }] });
}
describe("Canvas recovery real file persistence", () => {
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "canvas-recovery-test-"));
        vi.stubEnv("VOZEB_PRO_DATA_DIR", dir);
        vi.stubEnv("VOZEB_PRO_DATABASE_PROVIDER", "file");
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await rm(dir, { recursive: true, force: true });
    });
    it("reopens after offline completion, persists nodes and messages exactly once", async () => {
        await seed();
        const res = await POST(new Request("http://localhost/api/canvas/projects/canvas/recover-agent-results", { method: "POST" }), { params: Promise.resolve({ id: "canvas" }) });
        const first = (await res.json()).data.project;
        expect(res.status).toBe(200);
        expect(first.nodes).toHaveLength(2);
        expect(first).not.toHaveProperty("__canvasAgentReceipts");
        expect(first.chatSessions[0].messages.at(-1).text).toBe("Saved final text");
        const again = await recoverCanvasProjectForUser("owner", "canvas");
        expect(again).toEqual(first);
        expect(await getCanvasProject("canvas", "other")).toBeNull();
        expect(await recoverCanvasProjectForUser("other", "canvas")).toBeNull();
        await updateCanvasProjectMutationPatch("owner", "canvas", { mutationId: "delete-result", baseUpdatedAt: first.updatedAt, nodeDeletes: ["output-run-0-0"] });
        expect((await recoverCanvasProjectForUser("owner", "canvas"))?.nodes).toHaveLength(1);
    });
    it("serializes simultaneous recoveries so a result and its receipt cannot diverge", async () => {
        await seed();
        const [a, b] = await Promise.all([recoverCanvasProjectForUser("owner", "canvas"), recoverCanvasProjectForUser("owner", "canvas")]);
        expect(a?.nodes).toHaveLength(2);
        expect(b?.nodes).toHaveLength(2);
        expect(a?.updatedAt).toBe(b?.updatedAt);
        const raw = await readJsonDataFile<{ projects: Array<{ project: Record<string, unknown> }> }>("canvas-projects.json", { projects: [] });
        expect(raw.projects[0].project.__canvasAgentReceipts).toBeTruthy();
    });
});
