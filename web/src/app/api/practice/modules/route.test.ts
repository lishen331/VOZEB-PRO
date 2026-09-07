import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), getConfiguration: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/practice-module-service", () => ({ getPracticeModuleConfiguration: mocks.getConfiguration }));

import { GET } from "./route";

describe("/api/practice/modules", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "teacher-one", role: "user", status: "active" });
        mocks.getConfiguration.mockResolvedValue({ modules: [{ module: "character", mode: "workflow", available: true, models: [], inputSchema: [], outputType: "image" }], projects: { canvas: false, drama: false } });
    });

    it("returns the public capability envelope for a school member", async () => {
        const response = await GET(new Request("http://localhost/api/practice/modules"));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ code: 200, data: { modules: expect.any(Array), projects: { canvas: false, drama: false } }, msg: "ok" });
    });

    it("requires login and maps school access errors", async () => {
        mocks.currentUser.mockResolvedValue(null);
        expect((await GET(new Request("http://localhost/api/practice/modules"))).status).toBe(401);
        mocks.currentUser.mockResolvedValue({ id: "plain-user", role: "user", status: "active" });
        mocks.getConfiguration.mockRejectedValueOnce(Object.assign(new Error("当前账号不是老师或学生"), { status: 403 }));
        const denied = await GET(new Request("http://localhost/api/practice/modules"));
        expect(denied.status).toBe(403);
        expect(await denied.json()).toMatchObject({ code: 403, data: null });
    });
});
