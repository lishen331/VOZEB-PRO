import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    currentUser: vi.fn(),
    createSession: vi.fn(),
    listSessions: vi.fn(),
    fetchInternalApi: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/practice-session-service", () => ({ createPracticeSessionForUser: mocks.createSession, listPracticeSessionsForUser: mocks.listSessions }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi, resolveInternalOrigin: () => "http://internal.test" }));
vi.mock("@/lib/server/generation-execution-policy", () => ({ trustedPracticeTaskHeaders: () => ({ "x-practice": "trusted" }) }));

import { GET, POST } from "./route";

describe("/api/practice/sessions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "teacher-one", role: "user", status: "active" });
        mocks.createSession.mockResolvedValue({ id: "session-one", module: "storyboard-image", status: "running", input: { prompt: "雨夜车站" } });
        mocks.listSessions.mockResolvedValue({ sessions: [], total: 0, page: 1, pageSize: 12 });
    });

    it("requires login before reading or dispatching a practice task", async () => {
        mocks.currentUser.mockResolvedValue(null);
        expect((await GET(new Request("http://localhost/api/practice/sessions"))).status).toBe(401);
        expect((await POST(new Request("http://localhost/api/practice/sessions", { method: "POST", body: "{}" }))).status).toBe(401);
        expect(mocks.createSession).not.toHaveBeenCalled();
    });

    it("accepts only user content, public references and stable project identity", async () => {
        const response = await POST(
            new Request("http://localhost/api/practice/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    module: "storyboard-image",
                    title: "镜头练习",
                    input: { prompt: "雨夜车站", provider: "forged-provider", model: "forged-model", pointsCost: 999 },
                    references: [{ type: "asset", id: "asset-one" }],
                    clientRequestId: "request-one",
                    projectId: "canvas-one",
                    projectKind: "canvas",
                    executionProfile: "production",
                    channelId: "private-channel",
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.createSession).toHaveBeenCalledWith(
            expect.objectContaining({ id: "teacher-one" }),
            {
                module: "storyboard-image",
                title: "镜头练习",
                input: { prompt: "雨夜车站" },
                references: [{ type: "asset", id: "asset-one" }],
                clientRequestId: "request-one",
                projectId: "canvas-one",
                projectKind: "canvas",
            },
            expect.objectContaining({ dispatch: expect.any(Function) }),
        );
        expect(JSON.stringify(await response.json())).not.toMatch(/provider|model|pointsCost|executionProfile|channelId|taskRefs/);
    });

    it("passes bounded query inputs to the ownership-aware service", async () => {
        const response = await GET(new Request("http://localhost/api/practice/sessions?module=music&page=3&pageSize=4"));
        expect(response.status).toBe(200);
        expect(mocks.listSessions).toHaveBeenCalledWith(expect.objectContaining({ id: "teacher-one" }), { module: "music", page: "3", pageSize: "4" });
        expect(await response.json()).toEqual({ code: 0, data: { sessions: [], total: 0, page: 1, pageSize: 12 }, msg: "OK" });
    });

    it("pins IP references in the dispatched generation task context", async () => {
        const reference = { type: "ip" as const, id: "ip-one", versionId: "version-one", itemIds: ["item-one"] };
        mocks.fetchInternalApi.mockResolvedValue(new Response(JSON.stringify({ task: { id: "task-one", type: "image" } }), { status: 200 }));
        mocks.createSession.mockImplementation(async (_user, _input, deps) => {
            await deps.dispatch({
                sessionId: "session-one",
                userId: "teacher-one",
                module: "storyboard-image",
                input: { prompt: "雨夜车站" },
                references: [reference],
                executionProfile: "open-source-practice",
                capability: "image",
                logicalModelId: "practice-image",
                clientRequestId: "request-ip",
                projectKind: "canvas",
            });
            return { id: "session-one", module: "storyboard-image", status: "running", input: { prompt: "雨夜车站", references: [reference] } };
        });

        const response = await POST(
            new Request("http://localhost/api/practice/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ module: "storyboard-image", input: { prompt: "雨夜车站" }, references: [reference], clientRequestId: "request-ip" }),
            }),
        );

        expect(response.status).toBe(200);
        const [, init] = mocks.fetchInternalApi.mock.calls[0];
        expect(JSON.parse(String(init.body))).toMatchObject({
            context: { executionProfile: "open-source-practice", projectId: "session-one", clientRequestId: "request-ip", ipReferences: [reference] },
        });
        expect(JSON.parse(String(init.body)).references).toEqual([]);
    });

    it("converts stable uploaded references and forwards declared workflow inputs", async () => {
        mocks.fetchInternalApi.mockResolvedValue(new Response(JSON.stringify({ task: { id: "task-one", type: "video" } }), { status: 200 }));
        mocks.createSession.mockImplementation(async (_user, _input, deps) => {
            await deps.dispatch({
                sessionId: "session-one",
                userId: "teacher-one",
                module: "storyboard-video",
                input: { prompt: "镜头推进", seed: 12 },
                references: [{ type: "asset", id: "permanent/2026/09/02/images/reference.png" }],
                executionProfile: "open-source-practice",
                capability: "video",
                logicalModelId: "practice-video",
                clientRequestId: "request-video",
                projectKind: "canvas",
            });
            return { id: "session-one", module: "storyboard-video", status: "running", input: { prompt: "镜头推进" } };
        });

        const response = await POST(new Request("http://localhost/api/practice/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module: "storyboard-video", input: { prompt: "镜头推进", seed: 12 }, clientRequestId: "request-video" }) }));
        expect(response.status).toBe(200);
        const [, init] = mocks.fetchInternalApi.mock.calls[0];
        expect(JSON.parse(String(init.body))).toMatchObject({ seed: 12, prompt: "镜头推进", references: [{ type: "image", url: "/api/reference-assets/permanent/2026/09/02/images/reference.png" }] });
    });
});
