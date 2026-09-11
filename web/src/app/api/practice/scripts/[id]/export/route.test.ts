import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), requirePracticeAccess: vi.fn(), repositories: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));
vi.mock("@/lib/server/database/repositories", () => ({ createPostgresRepositories: mocks.repositories }));
vi.mock("@/lib/server/script-practice-service", () => ({ getScriptProjectDetail: mocks.detail }));
import { GET } from "./route";
describe("practice script export route", () => {
    it("rejects unsupported formats without reading the document", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
        mocks.requirePracticeAccess.mockResolvedValue({});
        expect((await GET(new Request("http://localhost/api/practice/scripts/p/export?format=pdf"), { params: Promise.resolve({ id: "p" }) })).status).toBe(400);
        expect(mocks.detail).not.toHaveBeenCalled();
    });
});
