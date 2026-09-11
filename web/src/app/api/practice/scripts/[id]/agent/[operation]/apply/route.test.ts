import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), requirePracticeAccess: vi.fn(), repositories: vi.fn(), apply: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));
vi.mock("@/lib/server/database/repositories", () => ({ createPostgresRepositories: mocks.repositories }));
vi.mock("@/lib/server/script-practice-stage-service", () => ({ applyScriptPatch: mocks.apply }));
import { POST } from "./route";
describe("practice script patch apply route", () => {
    it("rejects an invalid operation before applying", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
        mocks.requirePracticeAccess.mockResolvedValue({});
        expect(
            (
                await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ baseVersionId: "v1", currentVersionId: "v1", proposedAfter: "x", targetBlockIds: ["b1"] }) }), {
                    params: Promise.resolve({ id: "p", operation: "generate_outline" }),
                })
            ).status,
        ).toBe(400);
        expect(mocks.apply).not.toHaveBeenCalled();
    });
});
