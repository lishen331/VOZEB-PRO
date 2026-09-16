import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), requirePracticeAccess: vi.fn(), getDetail: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));
vi.mock("@/lib/server/script-practice-service", () => ({ getScriptProjectDetail: mocks.getDetail, updateScriptProject: mocks.update, deleteScriptProject: mocks.remove }));
import { DELETE, GET, PATCH } from "./route";
const context = { params: Promise.resolve({ id: "script-a" }) };
describe("practice script project route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-a", role: "user" });
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-a", membershipId: "member-a", role: "student" });
        mocks.getDetail.mockResolvedValue({ project: { id: "script-a", userId: "user-a" }, document: null });
        mocks.update.mockResolvedValue({ id: "script-a" });
        mocks.remove.mockResolvedValue({ deleted: true });
    });
    it("does not expose a project to a non-owner", async () => {
        mocks.getDetail.mockRejectedValue(Object.assign(new Error("剧本项目不存在"), { status: 404 }));
        expect((await GET(new Request("http://localhost/api/practice/scripts/script-a"), context)).status).toBe(404);
    });
    it("updates and deletes through the authenticated owner", async () => {
        expect((await PATCH(new Request("http://localhost/api/practice/scripts/script-a", { method: "PATCH", body: JSON.stringify({ title: "新标题" }) }), context)).status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith("user-a", "script-a", { title: "新标题" });
        expect((await DELETE(new Request("http://localhost/api/practice/scripts/script-a", { method: "DELETE" }), context)).status).toBe(200);
        expect(mocks.remove).toHaveBeenCalledWith("user-a", "script-a");
    });
});
