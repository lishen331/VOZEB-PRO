import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/server/generation-task-store", () => ({ createStoredGenerationTask: mocks.create, getStoredGenerationTask: mocks.get, updateStoredGenerationTask: mocks.update }));

import { createAdminWorkflowTest, getAdminWorkflowTest, updateAdminWorkflowTest } from "./admin-workflow-test-store";

describe("admin workflow test store", () => {
    beforeEach(() => vi.clearAllMocks());

    it("stores isolated admin origin without school context", async () => {
        const record = await createAdminWorkflowTest({ userId: "admin-1", workflowKey: "wf", workflowVersion: 2, upstreamWorkflowId: "remote", businessCode: "script", type: "text", status: "pending" });
        expect(record.taskOrigin).toBe("admin-workflow-test");
        expect(record.id).toBeTruthy();
        expect(mocks.create).toHaveBeenCalledWith("text", expect.objectContaining({ taskOrigin: "admin-workflow-test" }), expect.any(Number));
        expect(record).not.toHaveProperty("schoolId");
        expect(record).not.toHaveProperty("projectId");
    });

    it("only returns the matching admin owner", async () => {
        mocks.get.mockResolvedValue({ id: "run", userId: "admin-1", taskOrigin: "admin-workflow-test" });
        expect(await getAdminWorkflowTest("text", "run", "admin-1")).toBeTruthy();
        expect(await getAdminWorkflowTest("text", "run", "admin-2")).toBeNull();
    });

    it("updates status through the shared generation task store", async () => {
        const record = {
            id: "run",
            userId: "admin-1",
            workflowKey: "wf",
            workflowVersion: 1,
            upstreamWorkflowId: "remote",
            businessCode: "script",
            type: "text" as const,
            status: "running" as const,
            createdAt: Date.now() - 100,
            updatedAt: Date.now(),
            taskOrigin: "admin-workflow-test" as const,
        };
        const next = await updateAdminWorkflowTest(record);
        expect(next.durationMs).toBeGreaterThanOrEqual(0);
        expect(mocks.update).toHaveBeenCalledWith("text", expect.objectContaining({ id: "run", status: "running" }), expect.any(Number));
    });
});
