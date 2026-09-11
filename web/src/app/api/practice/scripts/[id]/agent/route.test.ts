import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), requirePracticeAccess: vi.fn(), repositories: vi.fn(), propose: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));
vi.mock("@/lib/server/database/repositories", () => ({ createPostgresRepositories: mocks.repositories }));
vi.mock("@/lib/server/script-practice-agent-service", () => ({ createScriptAgentService: () => ({ propose: mocks.propose }) }));
import { POST } from "./route";
describe("practice script agent route", () => {
    it("rejects an empty selection", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
        mocks.requirePracticeAccess.mockResolvedValue({});
        expect((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ operation: "rewrite_selection", baseVersionId: "v1", targetBlockIds: [] }) }), { params: Promise.resolve({ id: "p" }) })).status).toBe(400);
        expect(mocks.propose).not.toHaveBeenCalled();
    });
});
