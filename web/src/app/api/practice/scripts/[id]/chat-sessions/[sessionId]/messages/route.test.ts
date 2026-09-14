import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), tenant: vi.fn(), session: vi.fn(), save: vi.fn(), artifacts: vi.fn(), confirm: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBodyResult: async (request: Request) => ({ ok: true, data: await request.json() }) }));
vi.mock("@/lib/server/practice-tenant-scope", () => ({ requirePracticeTenant: mocks.tenant }));
vi.mock("@/lib/server/database/postgres", () => ({ postgresQuery: { query: vi.fn() } }));
vi.mock("@/lib/server/database/script-agent-repository", () => ({
    ScriptAgentRepository: class {
        getChatSession = mocks.session;
        saveChatMessage = mocks.save;
        listLatestArtifacts = mocks.artifacts;
    },
}));
vi.mock("@/lib/server/script-agent-confirmation-service", () => ({ confirmScriptArtifactAndStartNext: mocks.confirm }));
vi.mock("@/lib/server/script-agent-run-service", () => ({
    ScriptAgentRunService: class {
        create = mocks.create;
    },
}));
import { POST } from "./route";
describe("script chat natural confirmation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
        mocks.tenant.mockResolvedValue({ schoolId: "school-a", ownerUserId: "user-a" });
        mocks.session.mockResolvedValue({ id: "session-a" });
        mocks.save.mockResolvedValue({ id: "message-a" });
        mocks.artifacts.mockResolvedValue([{ id: "artifact-a", artifact_type: "creative_positioning", status: "awaiting_review", source_run_id: "run-plan" }]);
        mocks.confirm.mockResolvedValue({ confirmation: { id: "confirmation-a" }, nextRunType: "short_story", nextRun: { id: "run-next", status: "planning", runType: "short_story" } });
    });
    it("returns the next run under nextRun instead of flattening it", async () => {
        const response = await POST(new Request("http://localhost/api/practice/scripts/project-a/chat-sessions/session-a/messages", { method: "POST", body: JSON.stringify({ content: "是的", clientRequestId: "request-a" }) }), {
            params: Promise.resolve({ id: "project-a", sessionId: "session-a" }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ data: { id: "run-next", confirmation: { id: "confirmation-a" }, nextRun: { id: "run-next", runType: "short_story" } } });
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it("recognizes confirmation embedded in a natural sentence", async () => {
        const response = await POST(
            new Request("http://localhost/api/practice/scripts/project-a/chat-sessions/session-a/messages", { method: "POST", body: JSON.stringify({ content: "我觉得很可以，就按你的想法来。我认同了你的想法", clientRequestId: "request-b" }) }),
            {
                params: Promise.resolve({ id: "project-a", sessionId: "session-a" }),
            },
        );
        expect(response.status).toBe(200);
        expect(mocks.confirm).toHaveBeenCalledOnce();
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it("does not treat ordinary creative language as confirmation", async () => {
        const response = await POST(new Request("http://localhost/api/practice/scripts/project-a/chat-sessions/session-a/messages", { method: "POST", body: JSON.stringify({ content: "我想重点介绍好玩的游乐设施", clientRequestId: "request-d" }) }), {
            params: Promise.resolve({ id: "project-a", sessionId: "session-a" }),
        });
        expect(response.status).toBe(200);
        expect(mocks.confirm).not.toHaveBeenCalled();
        expect(mocks.create).toHaveBeenCalledOnce();
    });
    it("does not treat a revision request as confirmation", async () => {
        const response = await POST(new Request("http://localhost/api/practice/scripts/project-a/chat-sessions/session-a/messages", { method: "POST", body: JSON.stringify({ content: "我不认同，请改成突出刺激体验", clientRequestId: "request-c" }) }), {
            params: Promise.resolve({ id: "project-a", sessionId: "session-a" }),
        });
        expect(response.status).toBe(200);
        expect(mocks.confirm).not.toHaveBeenCalled();
        expect(mocks.create).toHaveBeenCalledOnce();
    });
});
