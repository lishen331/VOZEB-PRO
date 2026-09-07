import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    listWorkflows: vi.fn(),
    createWorkflow: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/runninghub-workflow-service", () => ({ listWorkflows: mocks.listWorkflows, createWorkflow: mocks.createWorkflow }));

import { GET, POST } from "./route";

describe("admin RunningHub workflow collection routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["upstream.manage"] });
        mocks.listWorkflows.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
        mocks.createWorkflow.mockResolvedValue({ workflowKey: "workflow-1", version: 1, enabled: false });
    });

    it("rejects a non-admin before reading workflow settings", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user", role: "user", status: "active", adminPermissions: [] });
        const response = await GET(new Request("http://localhost/api/admin/runninghub/workflows"));
        expect(response.status).toBe(403);
        expect(mocks.listWorkflows).not.toHaveBeenCalled();
    });

    it("passes list search and filters to the service", async () => {
        const response = await GET(new Request("http://localhost/api/admin/runninghub/workflows?search=图片&businessCode=storyboard-image&status=disabled&channelId=rh&page=2&pageSize=10"));
        expect(response.status).toBe(200);
        expect(mocks.listWorkflows).toHaveBeenCalledWith({ search: "图片", businessCode: "storyboard-image", status: "disabled", channelId: "rh", page: 2, pageSize: 10 });
        await expect(response.json()).resolves.toEqual({ code: 0, data: { items: [], total: 0, page: 2, pageSize: 10 }, msg: "ok" });
    });

    it("creates a disabled workflow through the service", async () => {
        const response = await POST(new Request("http://localhost/api/admin/runninghub/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channelId: "rh", businessCode: "script" }) }));
        expect(response.status).toBe(200);
        expect(mocks.createWorkflow).toHaveBeenCalledWith({ channelId: "rh", businessCode: "script" });
        await expect(response.json()).resolves.toEqual({ code: 0, data: { workflowKey: "workflow-1", version: 1, enabled: false }, msg: "ok" });
    });

    it("rejects non-object create bodies", async () => {
        const response = await POST(new Request("http://localhost/api/admin/runninghub/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: "[]" }));
        expect(response.status).toBe(400);
        expect(mocks.createWorkflow).not.toHaveBeenCalled();
    });

});
