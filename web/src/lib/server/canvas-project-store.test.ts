import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasProject } from "@/lib/canvas-project-contract";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), files: new Map<string, unknown>(), provider: "file", postgresQuery: vi.fn() }));

vi.mock("@/lib/server/database", () => ({ ensurePostgresSchema: vi.fn(), getDatabaseProvider: vi.fn(() => mocks.provider), postgresQuery: mocks.postgresQuery, withPostgresTransaction: mocks.transaction }));
vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(mocks.files.has(name) ? mocks.files.get(name) : fallback)),
    withJsonDataFileLock: vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback()),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => mocks.files.set(name, structuredClone(value))),
}));

import {
    mutateCanvasProjectForRecovery,
    createCanvasProject,
    getCanvasProject,
    getLatestCanvasProjectOverview,
    listCanvasProjectPage,
    listCanvasProjects,
    listCanvasProjectSummaries,
    updateCanvasProject,
    updateCanvasProjectMutation,
    updateCanvasProjectMutationPatch,
} from "./canvas-project-store";

describe("canvas project file provider", () => {
    beforeEach(() => {
        mocks.files.clear();
        mocks.provider = "file";
        mocks.postgresQuery.mockReset();
    });

    it("atomically persists recovered outputs with hidden server receipts", async () => {
        await createCanvasProject("user-one", project("one", "Canvas"));
        const initial = await getCanvasProject("one", "user-one");
        const recovered = await mutateCanvasProjectForRecovery("user-one", "one", async (current) => ({ ...current, title: "Recovered", __canvasAgentReceipts: { run: "hash" } }));
        expect(recovered?.title).toBe("Recovered");
        expect(recovered?.updatedAt).not.toBe(initial?.updatedAt);
        expect(recovered).not.toHaveProperty("__canvasAgentReceipts");
        const before = structuredClone(mocks.files.get("canvas-projects.json"));
        await expect(
            mutateCanvasProjectForRecovery("user-one", "one", async () => {
                throw new Error("save failed");
            }),
        ).rejects.toThrow("save failed");
        expect(mocks.files.get("canvas-projects.json")).toEqual(before);
        expect(await mutateCanvasProjectForRecovery("other", "one", async (p) => ({ ...p, title: "forged" }))).toBeNull();
        const unchanged = await mutateCanvasProjectForRecovery("user-one", "one", async (p) => p);
        expect(unchanged?.updatedAt).toBe(recovered?.updatedAt);
        await updateCanvasProject("user-one", { ...recovered!, title: "Manual edit", updatedAt: new Date(Date.now() + 1000).toISOString() }, recovered!.updatedAt);
        await mutateCanvasProjectForRecovery("user-one", "one", async (p) => {
            expect(p.__canvasAgentReceipts).toEqual({ run: "hash" });
            return p;
        });
    });
    it("locks the PostgreSQL project before recovering and commits receipts with content", async () => {
        mocks.provider = "postgres";
        const query = vi
            .fn()
            .mockResolvedValueOnce({ rows: [{ project_json: project("one", "Canvas"), execution_profile: "production" }] })
            .mockResolvedValue({ rows: [], rowCount: 1 });
        mocks.transaction.mockImplementation(async (work) => work({ query }));
        const recovered = await mutateCanvasProjectForRecovery("user-one", "one", async (p) => ({ ...p, title: "Recovered", __canvasAgentReceipts: { run: "hash" } }));
        expect(query.mock.calls[0][0]).toContain("FOR UPDATE");
        expect(query.mock.calls[0][1]).toEqual(["one", "user-one"]);
        expect(query.mock.calls[1][0]).toContain("UPDATE canvas_projects");
        expect(JSON.parse(query.mock.calls[1][1][2])).toMatchObject({ title: "Recovered", __canvasAgentReceipts: { run: "hash" } });
        expect(recovered).not.toHaveProperty("__canvasAgentReceipts");
    });

    it("does not accept forged recovery receipts on create, full save or compact save", async () => {
        await createCanvasProject("user-one", { ...project("one", "Canvas"), __canvasAgentReceipts: { forged: "hash" } } as CanvasProject);
        await mutateCanvasProjectForRecovery("user-one", "one", async (current) => {
            expect(current.__canvasAgentReceipts).toBeUndefined();
            return { ...current, __canvasAgentReceipts: { real: "hash" } };
        });
        const saved = await getCanvasProject("one", "user-one");
        await updateCanvasProjectMutation("user-one", { ...saved!, updatedAt: new Date(Date.now() + 1000).toISOString(), __canvasAgentReceipts: { forged: "value" } } as CanvasProject, saved!.updatedAt, "full-save");
        const latest = await getCanvasProject("one", "user-one");
        await updateCanvasProjectMutationPatch("user-one", "one", { mutationId: "compact", baseUpdatedAt: latest!.updatedAt, title: "Manual" });
        await mutateCanvasProjectForRecovery("user-one", "one", async (current) => {
            expect(current.__canvasAgentReceipts).toEqual({ real: "hash" });
            return current;
        });
    });

    it("persists the complete project snapshot and isolates users", async () => {
        await createCanvasProject("user-one", project("one", "项目一"));
        await createCanvasProject("user-two", project("two", "项目二"));

        expect(await listCanvasProjects("user-one")).toMatchObject([{ id: "one", creativeConversationId: "conversation-one" }]);
        expect(await getCanvasProject("two", "user-one")).toBeNull();
        await expect(updateCanvasProject("user-one", project("two", "越权修改"), project("two", "").updatedAt)).rejects.toMatchObject({ status: 404 });

        const stored = await getCanvasProject("one", "user-one");
        const updated = { ...project("one", "已更新"), nodes: [{ id: "node-one" }] as CanvasProject["nodes"], updatedAt: new Date(Date.now() + 1000).toISOString() };
        await updateCanvasProject("user-one", updated, stored?.updatedAt || "");
        expect(await getCanvasProject("one", "user-one")).toMatchObject({ title: "已更新", nodes: [{ id: "node-one" }] });
    });

    it("keeps drama episode canvases out of the ordinary Canvas project list", async () => {
        await createCanvasProject("user-one", project("ordinary", "普通画布"));
        await createCanvasProject("user-one", { ...project("episode", "短剧画布"), sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one" });

        await expect(listCanvasProjects("user-one")).resolves.toMatchObject([{ id: "ordinary" }]);
        await expect(listCanvasProjectSummaries("user-one", { page: 1, pageSize: 12 })).resolves.toMatchObject({ projects: [{ id: "ordinary" }], total: 1 });
        await expect(listCanvasProjectSummaries("user-one", { page: 1, pageSize: 12, includeDramaLab: true, dramaLabOnly: true })).resolves.toMatchObject({ projects: [{ id: "episode" }], total: 1 });
        await expect(listCanvasProjectPage("user-one", { page: 1, pageSize: 12, includeDramaLab: true })).resolves.toMatchObject({ items: [{ id: "episode" }, { id: "ordinary" }], total: 2 });
        await expect(getCanvasProject("episode", "user-one")).resolves.toMatchObject({ id: "episode" });
    });

    it("rejects a stale file-provider snapshot instead of overwriting a newer save", async () => {
        const initial = project("one", "初始项目");
        await createCanvasProject("user-one", initial);
        const first = { ...initial, title: "第一个页面", updatedAt: new Date(Date.parse(initial.updatedAt) + 1_000).toISOString() };
        const stale = { ...initial, title: "旧页面", updatedAt: new Date(Date.parse(initial.updatedAt) + 2_000).toISOString() };

        await updateCanvasProject("user-one", first, initial.updatedAt);
        await expect(updateCanvasProject("user-one", stale, initial.updatedAt)).rejects.toMatchObject({ status: 409 });
        await expect(getCanvasProject("one", "user-one")).resolves.toMatchObject({ title: "第一个页面" });
    });

    it("uses the expected version in the PostgreSQL conditional update", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ id: "one" }] });
        const updated = project("one", "已更新");

        await updateCanvasProject("user-one", updated, "2026-08-01T00:00:00.000Z");

        const [statement, params] = mocks.postgresQuery.mock.calls[0] as [string, unknown[]];
        expect(statement).toContain("project_json->>'updatedAt' = $6");
        expect(params[5]).toBe("2026-08-01T00:00:00.000Z");
    });

    it("applies a compact PostgreSQL mutation in one conditional update", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ id: "one", updated_at: "2026-08-01T00:00:00.001Z" }] });

        await expect(
            updateCanvasProjectMutationPatch("user-one", "one", {
                mutationId: "mutation-one",
                baseUpdatedAt: "2026-08-01T00:00:00.000Z",
                title: "紧凑更新",
                nodeUpserts: [{ id: "node-one", type: "text" } as CanvasProject["nodes"][number]],
                nodeDeletes: ["node-old"],
            }),
        ).resolves.toMatchObject({ projectId: "one", mutationId: "mutation-one" });

        const [statement, params] = mocks.postgresQuery.mock.calls[0] as [string, unknown[]];
        expect(statement).toContain("jsonb_array_elements");
        expect(statement).toContain("COALESCE((");
        expect(statement).toContain("existing.item->>'id' = incoming.item->>'id'");
        expect(statement).toContain("to_jsonb($7::text)");
        expect(statement).toContain("p.project_json->>'updatedAt' = $4");
        expect(statement).not.toContain("project_json = $4::jsonb");
        expect(params).toContain("mutation-one");
        expect(params).toContain("2026-08-01T00:00:00.000Z");
    });

    it("replays a file mutation without overwriting the first acknowledgement", async () => {
        const initial = project("one", "初始项目");
        await createCanvasProject("user-one", initial);
        const first = { ...initial, title: "第一次", updatedAt: "2026-08-01T00:00:00.001Z" };
        const replay = { ...initial, title: "不应覆盖", updatedAt: "2026-08-01T00:00:00.002Z" };

        await expect(updateCanvasProjectMutation("user-one", first, initial.updatedAt, "mutation-one")).resolves.toMatchObject({ title: "第一次" });
        await expect(updateCanvasProjectMutation("user-one", replay, initial.updatedAt, "mutation-one")).resolves.toMatchObject({ title: "第一次" });
        await expect(getCanvasProject("one", "user-one")).resolves.toMatchObject({ title: "第一次" });
    });

    it("round-trips Canvas video first and last frame metadata through compact project saves", async () => {
        const initial = project("video-frames", "首尾帧项目");
        await createCanvasProject("user-one", initial);
        const firstSource = "permanent/canvas/first-frame.webp";
        const lastSource = "permanent/canvas/last-frame.webp";

        await updateCanvasProjectMutationPatch("user-one", initial.id, {
            mutationId: "video-frame-mutation",
            baseUpdatedAt: initial.updatedAt,
            nodeUpserts: [
                {
                    id: "video-output",
                    type: "video",
                    title: "首尾帧视频",
                    position: { x: 40, y: 80 },
                    width: 320,
                    height: 180,
                    metadata: {
                        videoReferenceMode: "first_last",
                        videoFirstFrame: { nodeId: "first-image", title: "首帧", source: firstSource, storageKey: firstSource, previewUrl: `/api/reference-assets/${firstSource}` },
                        videoLastFrame: { nodeId: "last-image", title: "尾帧", source: lastSource, storageKey: lastSource, previewUrl: `/api/reference-assets/${lastSource}` },
                        videoReferences: [
                            { type: "image", role: "first_frame", id: "first-image", name: "first.webp", mimeType: "image/webp", source: firstSource, storageKey: firstSource },
                            { type: "image", role: "last_frame", id: "last-image", name: "last.webp", mimeType: "image/webp", source: lastSource, storageKey: lastSource },
                        ],
                    },
                } as CanvasProject["nodes"][number],
            ],
        });

        await expect(getCanvasProject(initial.id, "user-one")).resolves.toMatchObject({
            nodes: [
                {
                    id: "video-output",
                    metadata: {
                        videoReferenceMode: "first_last",
                        videoFirstFrame: { nodeId: "first-image", storageKey: firstSource },
                        videoLastFrame: { nodeId: "last-image", storageKey: lastSource },
                        videoReferences: [
                            { role: "first_frame", source: firstSource },
                            { role: "last_frame", source: lastSource },
                        ],
                    },
                },
            ],
        });
    });

    it("returns file-provider summaries without changing stored project details", async () => {
        await createCanvasProject("user-one", { ...project("one", "项目一"), nodes: [{ id: "node-one" }] as CanvasProject["nodes"] });

        await expect(listCanvasProjectSummaries("user-one", { page: 1, pageSize: 12 })).resolves.toMatchObject({ projects: [{ id: "one", title: "项目一", nodeCount: 1, connectionCount: 0 }], total: 1 });
        await expect(getCanvasProject("one", "user-one")).resolves.toMatchObject({ nodes: [{ id: "node-one" }] });
    });

    it("projects only Canvas list summary fields in PostgreSQL", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({
            rows: [
                {
                    id: "canvas-one",
                    title: "画布一",
                    source_handoff_id: "handoff-one",
                    creative_conversation_id: "conversation-one",
                    node_count: 8,
                    connection_count: 3,
                    total_count: 21,
                    created_at: "2026-07-20T00:00:00.000Z",
                    updated_at: "2026-07-22T00:00:00.000Z",
                },
            ],
        });

        await expect(listCanvasProjectSummaries("user-one", { page: 2, pageSize: 12 })).resolves.toMatchObject({ projects: [{ id: "canvas-one", nodeCount: 8, connectionCount: 3 }], total: 21, page: 2, pageSize: 12 });
        const [statement, params] = mocks.postgresQuery.mock.calls[0] as [string, unknown[]];
        expect(statement).toContain("jsonb_array_length");
        expect(statement).not.toMatch(/SELECT\s+project_json\s+FROM/i);
        expect(statement).toContain("LIMIT $2 OFFSET $3");
        expect(params).toEqual(["user-one", 12, 12]);
    });

    it("paginates complete PostgreSQL Canvas snapshots for explicit user export", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({ rows: [{ project_json: project("canvas-one", "画布一"), total_count: 3 }] });

        await expect(listCanvasProjectPage("user-one", { page: 2, pageSize: 2 })).resolves.toMatchObject({ items: [{ id: "canvas-one" }], total: 3, page: 2, pageSize: 2 });

        const [statement, params] = mocks.postgresQuery.mock.calls[0] as [string, unknown[]];
        expect(statement).toContain("WHERE user_id = $1");
        expect(statement).toContain("ORDER BY updated_at DESC, id ASC");
        expect(statement).toContain("LIMIT $2 OFFSET $3");
        expect(params).toEqual(["user-one", 2, 2]);
    });

    it("includes drama episode canvases only when a PostgreSQL export explicitly requests them", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({ rows: [{ project_json: project("canvas-one", "画布一"), total_count: 1 }] });

        await listCanvasProjectPage("user-one", { page: 1, pageSize: 100, includeDramaLab: true });

        const [statement] = mocks.postgresQuery.mock.calls[0] as [string, unknown[]];
        expect(statement).toContain("WHERE user_id = $1");
        expect(statement).not.toContain("NOT LIKE 'drama-lab-canvas:%'");
    });

    it("lists only drama episode canvas summaries for the dedicated runtime", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({ rows: [] });

        await listCanvasProjectSummaries("user-one", { page: 1, pageSize: 12, includeDramaLab: true, dramaLabOnly: true });

        const [statement] = mocks.postgresQuery.mock.calls[0] as [string, unknown[]];
        expect(statement).toContain("LIKE 'drama-lab-canvas:%'");
        expect(statement).not.toContain("NOT LIKE 'drama-lab-canvas:%'");
    });

    it("prevents the unbounded Canvas reader from querying PostgreSQL", async () => {
        mocks.provider = "postgres";

        await expect(listCanvasProjects("user-one")).rejects.toThrow("paginated project query");
        expect(mocks.postgresQuery).not.toHaveBeenCalled();
    });

    it("returns only the latest file-provider project summary", async () => {
        const older = { ...project("older", "旧项目"), updatedAt: "2026-07-20T00:00:00.000Z" };
        const latest = {
            ...project("latest", "最近项目"),
            updatedAt: "2026-07-22T00:00:00.000Z",
            nodes: [{ id: "image", type: "image", metadata: { status: "success", serverUrl: "/api/media/latest.webp" } }] as CanvasProject["nodes"],
            connections: [{ id: "edge" }] as CanvasProject["connections"],
        };
        await createCanvasProject("user-one", older);
        await createCanvasProject("user-one", latest);

        await expect(getLatestCanvasProjectOverview("user-one")).resolves.toMatchObject({ id: "latest", nodeCount: 1, connectionCount: 1, previews: [{ kind: "image", url: "/api/media/latest.webp" }] });
    });

    it("uses one bounded PostgreSQL projection instead of returning project_json", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({
            rows: [{ id: "latest", title: "最近项目", updated_at: "2026-07-22T00:00:00.000Z", node_count: 9, connection_count: 4, previews: [{ kind: "image", url: "/api/media/cover.webp" }] }],
            rowCount: 1,
        });

        await expect(getLatestCanvasProjectOverview("user-one")).resolves.toMatchObject({ id: "latest", nodeCount: 9, connectionCount: 4 });
        const [statement, params] = mocks.postgresQuery.mock.calls[0] as [string, unknown[]];
        expect(statement).toContain("jsonb_array_length");
        expect(statement).toContain("LIMIT 1");
        expect(statement).not.toMatch(/SELECT\s+project_json/i);
        expect(params).toEqual(["user-one"]);
    });
});

function project(id: string, title: string): CanvasProject {
    const now = new Date().toISOString();
    return {
        id,
        title,
        sourceHandoffId: `handoff-${id}`,
        creativeConversationId: `conversation-${id}`,
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
        createdAt: now,
        updatedAt: now,
    };
}
