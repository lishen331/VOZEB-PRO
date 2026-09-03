import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getWorkflow: vi.fn(),
    updateWorkflow: vi.fn(),
    setWorkflowEnabled: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/runninghub-workflow-service", () => ({ getWorkflow: mocks.getWorkflow, updateWorkflow: mocks.updateWorkflow, setWorkflowEnabled: mocks.setWorkflowEnabled }));

import { GET, PUT } from "./route";

const context = { params: Promise.resolve({ workflowKey: "workflow-1" }) };

describe("admin RunningHub workflow item routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["upstream.manage"] });
        mocks.getWorkflow.mockResolvedValue({ workflowKey: "workflow-1", version: 1, enabled: false });
        mocks.updateWorkflow.mockResolvedValue({ workflowKey: "workflow-1", version: 1, enabled: false });
        mocks.setWorkflowEnabled.mockResolvedValue({ workflowKey: "workflow-1", version: 1, enabled: true });
    });

    it("returns a workflow detail with the standard response envelope", async () => {
        const response = await GET(new Request("http://localhost/api/admin/runninghub/workflows/workflow-1"), context);
        expect(response.status).toBe(200);
        expect(mocks.getWorkflow).toHaveBeenCalledWith("workflow-1");
        await expect(response.json()).resolves.toEqual({ code: 0, data: { workflowKey: "workflow-1", version: 1, enabled: false }, msg: "ok" });
    });

    it("uses the activation operation for enabled-only updates", async () => {
        const response = await PUT(new Request("http://localhost/api/admin/runninghub/workflows/workflow-1", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: true }) }), context);
        expect(response.status).toBe(200);
        expect(mocks.setWorkflowEnabled).toHaveBeenCalledWith("workflow-1", true);
        expect(mocks.updateWorkflow).not.toHaveBeenCalled();
    });

    it("updates disabled versions through the service", async () => {
        const response = await PUT(new Request("http://localhost/api/admin/runninghub/workflows/workflow-1", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflowName: "新名称" }) }), context);
        expect(response.status).toBe(200);
        expect(mocks.updateWorkflow).toHaveBeenCalledWith("workflow-1", { workflowName: "新名称" });
    });
});
