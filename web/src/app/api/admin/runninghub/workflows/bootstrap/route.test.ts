import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), initialize: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/runninghub-workflow-service", () => ({ initializeDemoRunningHubWorkflows: mocks.initialize }));

import { POST } from "./route";

describe("RunningHub Demo bootstrap route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["upstream.manage"] });
        mocks.initialize.mockResolvedValue({ added: 7, updated: 0, skipped: 0, workflowKeys: [] });
    });

    it("requires a workflow channel and passes overwrite explicitly", async () => {
        expect((await POST(new Request("http://localhost", { method: "POST", body: "{}" }))).status).toBe(400);
        const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channelId: "rh", overwrite: true }) }));
        expect(response.status).toBe(200);
        expect(mocks.initialize).toHaveBeenCalledWith({ channelId: "rh", overwrite: true });
    });
});
