import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    requirePracticeAccess: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    importScript: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));
vi.mock("@/lib/server/script-practice-service", () => ({
    createScriptProject: mocks.create,
    listScriptProjects: mocks.list,
    getScriptProjectDetail: mocks.get,
    updateScriptProject: mocks.update,
    deleteScriptProject: mocks.remove,
    importScriptProject: mocks.importScript,
}));

import { GET, POST } from "./route";
import { POST as importPost } from "./import/route";

const project = { id: "script-a", userId: "user-a", title: "夜班车", status: "draft", sourceType: "idea", createdAt: "2026-09-11T00:00:00.000Z", updatedAt: "2026-09-11T00:00:00.000Z" };

describe("practice scripts collection routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-a", role: "user" });
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-a", membershipId: "member-a", role: "student" });
        mocks.create.mockResolvedValue(project);
        mocks.list.mockResolvedValue({ items: [project], total: 1, page: 1, pageSize: 20 });
        mocks.importScript.mockResolvedValue({ preview: true, project });
    });

    it("requires authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await GET(new Request("http://localhost/api/practice/scripts"))).status).toBe(401);
        expect((await POST(new Request("http://localhost/api/practice/scripts", { method: "POST", body: "{}" }))).status).toBe(401);
    });
    it("requires infinite-practice access", async () => {
        mocks.requirePracticeAccess.mockRejectedValue(Object.assign(new Error("当前账号没有可用的学校身份"), { status: 403 }));
        expect((await GET(new Request("http://localhost/api/practice/scripts"))).status).toBe(403);
        expect((await POST(new Request("http://localhost/api/practice/scripts", { method: "POST", body: JSON.stringify({ title: "夜班车" }) }))).status).toBe(403);
    });
    it("passes the authenticated owner and bounded project input", async () => {
        const response = await POST(new Request("http://localhost/api/practice/scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: " 夜班车 ", sourceType: "idea", idea: "末班车上的乘客" }) }));
        expect(response.status).toBe(200);
        expect(mocks.create).toHaveBeenCalledWith("user-a", { title: "夜班车", sourceType: "idea", idea: "末班车上的乘客", schoolId: "school-a", mode: "short_story", projectParameters: {} });
        expect((await GET(new Request("http://localhost/api/practice/scripts?page=2&pageSize=10&keyword=悬疑"))).status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("user-a", { page: 2, pageSize: 10, keyword: "悬疑", status: undefined });
    });
});

describe("practice script import route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-a", role: "user" });
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-a", membershipId: "member-a", role: "student" });
        mocks.importScript.mockResolvedValue({ preview: true, format: "fountain", document: { blocks: [] } });
    });
    it("returns a preview before the import is committed", async () => {
        const response = await importPost(new Request("http://localhost/api/practice/scripts/import", { method: "POST", body: JSON.stringify({ title: "导入剧本", format: "fountain", content: "INT. ROOM - DAY" }) }));
        expect(response.status).toBe(200);
        expect(mocks.importScript).toHaveBeenCalledWith("user-a", { title: "导入剧本", format: "fountain", content: "INT. ROOM - DAY", confirm: false });
    });
    it("rejects unsupported formats", async () => {
        mocks.importScript.mockRejectedValue(Object.assign(new Error("不支持的剧本格式"), { status: 400 }));
        expect((await importPost(new Request("http://localhost/api/practice/scripts/import", { method: "POST", body: JSON.stringify({ title: "导入", format: "pdf", content: "x" }) }))).status).toBe(400);
    });
});
