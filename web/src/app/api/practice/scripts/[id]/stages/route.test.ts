import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), requirePracticeAccess: vi.fn(), repository: vi.fn(), generate: vi.fn(), confirm: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));
vi.mock("@/lib/server/database/script-practice-repository", () => ({ createScriptPracticeRepository: mocks.repository }));
vi.mock("@/lib/server/script-practice-stage-service", () => ({ createScriptStageService: () => ({ generate: mocks.generate }), confirmScriptStage: mocks.confirm }));
import { POST } from "./route";
describe("practice script stages route", () => {
    it("validates the stage operation", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "u" });
        mocks.requirePracticeAccess.mockResolvedValue({});
        expect((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ operation: "create_image_task" }) }), { params: Promise.resolve({ id: "p" }) })).status).toBe(400);
        expect(mocks.generate).not.toHaveBeenCalled();
    });
    it("confirms through the owner-scoped service", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "u" });
        mocks.requirePracticeAccess.mockResolvedValue({});
        mocks.repository.mockReturnValue({});
        mocks.confirm.mockResolvedValue({ status: "confirmed" });
        expect((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ confirm: true, stage: "synopsis" }) }), { params: Promise.resolve({ id: "p" }) })).status).toBe(200);
        expect(mocks.confirm).toHaveBeenCalledWith({}, "u", "p", "synopsis");
    });
});
