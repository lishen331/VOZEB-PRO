import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    currentUser: vi.fn(),
    createProject: vi.fn(),
    listProjects: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/practice-project-service", () => ({ createPracticeProject: mocks.createProject, listPracticeProjects: mocks.listProjects }));

import { GET, POST } from "./route";

describe("/api/practice/projects", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "student-one", role: "user", status: "active" });
        mocks.createProject.mockResolvedValue({ kind: "canvas", project: { id: "canvas-one", executionProfile: "open-source-practice" } });
        mocks.listProjects.mockResolvedValue({ kind: "canvas", projects: [{ id: "canvas-one" }], total: 1, page: 2, pageSize: 6 });
    });

    it("requires login for reads and writes", async () => {
        mocks.currentUser.mockResolvedValue(null);
        expect((await GET(new Request("http://localhost/api/practice/projects?kind=canvas"))).status).toBe(401);
        expect((await POST(new Request("http://localhost/api/practice/projects", { method: "POST", body: "{}" }))).status).toBe(401);
        expect(mocks.createProject).not.toHaveBeenCalled();
    });

    it("forwards only project kind, title and public source", async () => {
        const response = await POST(
            new Request("http://localhost/api/practice/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    kind: "canvas",
                    title: "镜头练习",
                    source: { type: "blank" },
                    executionProfile: "production",
                    provider: "forged-provider",
                    model: "forged-model",
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.createProject).toHaveBeenCalledWith(expect.objectContaining({ id: "student-one" }), { kind: "canvas", title: "镜头练习", source: { type: "blank" } });
        expect(JSON.stringify(mocks.createProject.mock.calls[0])).not.toMatch(/provider|model|executionProfile/);
    });

    it("keeps list pagination and service errors in the shared response contract", async () => {
        const response = await GET(new Request("http://localhost/api/practice/projects?kind=canvas&page=2&pageSize=6"));
        expect(response.status).toBe(200);
        expect(mocks.listProjects).toHaveBeenCalledWith(expect.objectContaining({ id: "student-one" }), { kind: "canvas", page: "2", pageSize: "6" });
        expect(await response.json()).toMatchObject({ code: 0, data: { total: 1, page: 2, pageSize: 6 } });

        mocks.listProjects.mockRejectedValueOnce(Object.assign(new Error("无权使用无限练习"), { status: 403 }));
        const denied = await GET(new Request("http://localhost/api/practice/projects?kind=canvas"));
        expect(denied.status).toBe(403);
        expect(await denied.json()).toMatchObject({ code: 403, data: null });
    });
});
