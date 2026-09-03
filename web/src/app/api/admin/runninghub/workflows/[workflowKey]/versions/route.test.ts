import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    copyWorkflowVersion: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/runninghub-workflow-service", () => ({ copyWorkflowVersion: mocks.copyWorkflowVersion }));

import { POST } from "./route";

describe("admin RunningHub workflow version route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["upstream.manage"] });
        mocks.copyWorkflowVersion.mockResolvedValue({ workflowKey: "workflow-1-v2", version: 2, enabled: true });
    });

    it("copies a version and forwards activation as one service operation", async () => {
        const response = await POST(
            new Request("http://localhost/api/admin/runninghub/workflows/workflow-1/versions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config: { workflowName: "v2" }, activateVersion: true }) }),
            { params: Promise.resolve({ workflowKey: "workflow-1" }) },
        );
        expect(response.status).toBe(200);
        expect(mocks.copyWorkflowVersion).toHaveBeenCalledWith("workflow-1", { config: { workflowName: "v2" }, activateVersion: true });
        await expect(response.json()).resolves.toEqual({ code: 0, data: { workflowKey: "workflow-1-v2", version: 2, enabled: true }, msg: "ok" });
    });

    it("rejects a non-admin before copying", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await POST(new Request("http://localhost/api/admin/runninghub/workflows/workflow-1/versions", { method: "POST", body: "{}" }), { params: Promise.resolve({ workflowKey: "workflow-1" }) });
        expect(response.status).toBe(401);
        expect(mocks.copyWorkflowVersion).not.toHaveBeenCalled();
    });
});
