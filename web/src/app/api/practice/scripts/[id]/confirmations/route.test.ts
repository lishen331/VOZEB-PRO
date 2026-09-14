import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), tenant: vi.fn(), query: vi.fn(), confirm: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/practice-tenant-scope", () => ({ requirePracticeTenant: mocks.tenant }));
vi.mock("@/lib/server/database/postgres", () => ({ postgresQuery: { query: mocks.query }, withPostgresTransaction: async (handler: (tx: unknown) => Promise<unknown>) => handler({ query: mocks.query }) }));
vi.mock("@/lib/server/database/script-agent-repository", () => ({
    ScriptAgentRepository: class {
        confirmArtifactAndGetNext = mocks.confirm;
    },
}));
vi.mock("@/lib/server/script-agent-run-service", () => ({
    ScriptAgentRunService: class {
        create = mocks.create;
    },
}));
import { POST } from "./route";
describe("script confirmation progression", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
        mocks.tenant.mockResolvedValue({ schoolId: "school-a", ownerUserId: "user-a" });
        mocks.confirm.mockResolvedValue({ confirmation: { id: "confirmation-a" }, nextRunType: "short_story" });
        mocks.create.mockResolvedValue({ id: "run-next", runType: "short_story" });
    });
    it("confirms and creates the next run in the same transaction", async () => {
        const response = await POST(new Request("http://localhost/api/practice/scripts/p/confirmations", { method: "POST", body: JSON.stringify({ artifactId: "artifact-a", stageKey: "creative_positioning", chatSessionId: "session-a" }) }), {
            params: Promise.resolve({ id: "project-a" }),
        });
        expect(response.status).toBe(200);
        expect(mocks.confirm).toHaveBeenCalled();
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ schoolId: "school-a", ownerUserId: "user-a" }), expect.objectContaining({ projectId: "project-a", runType: "short_story", chatSessionId: "session-a" }));
        expect(await response.json()).toMatchObject({ data: { nextRun: { id: "run-next" } } });
    });
    it("does not create a next run when the artifact is not confirmable", async () => {
        mocks.confirm.mockResolvedValue(null);
        const response = await POST(new Request("http://localhost/api/practice/scripts/p/confirmations", { method: "POST", body: JSON.stringify({ artifactId: "missing", stageKey: "creative_positioning" }) }), {
            params: Promise.resolve({ id: "project-a" }),
        });
        expect(response.status).toBe(409);
        expect(mocks.create).not.toHaveBeenCalled();
    });
});
