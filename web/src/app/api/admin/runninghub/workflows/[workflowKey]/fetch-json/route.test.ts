import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/runninghub-workflow-service", () => ({ fetchAndSaveWorkflowJson: mocks.fetch }));

import { POST } from "./route";

describe("RunningHub workflow fetch-json route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["upstream.manage"] });
        mocks.fetch.mockResolvedValue({ workflowKey: "workflow-1", workflowCode: "character_main_view", workflowJsonFingerprint: "hash", nodeCount: 3 });
    });

    it("saves a workflow JSON snapshot through the service", async () => {
        const response = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ workflowKey: "workflow-1" }) });
        expect(response.status).toBe(200);
        expect(mocks.fetch).toHaveBeenCalledWith("workflow-1");
        expect(JSON.stringify(await response.json())).not.toContain("apiKey");
    });
});
