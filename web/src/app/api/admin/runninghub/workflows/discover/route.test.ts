import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), discoverWorkflow: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/runninghub-workflow-service", () => ({
    discoverWorkflow: mocks.discoverWorkflow,
    parseWorkflowId: (value: unknown) => (typeof value === "string" && /^\d+$/.test(value) ? value : typeof value === "string" && /\d{6,}/.test(value) ? value.match(/\d{6,}/)?.[0] : ""),
    RunningHubWorkflowError: class RunningHubWorkflowError extends Error {
        status = 400;
    },
}));

import { POST } from "./route";

describe("admin RunningHub workflow discovery route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["upstream.manage"] });
        mocks.discoverWorkflow.mockResolvedValue({ workflowId: "2090436199843454978", nodeCount: 1, candidates: [], suggestedInputs: [], suggestedNodeMappings: [], suggestedOutputs: [], warnings: [], workflowJsonFingerprint: "hash" });
    });

    it("rejects unauthenticated and unauthorized requests", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce(null);
        expect((await POST(new Request("http://localhost", { method: "POST", body: "{}" }))).status).toBe(401);
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "user", role: "user", status: "active", adminPermissions: [] });
        expect((await POST(new Request("http://localhost", { method: "POST", body: "{}" }))).status).toBe(403);
    });

    it("passes a numeric id or full link to the service without exposing secrets", async () => {
        const response = await POST(
            new Request("http://localhost", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ channelId: "rh", workflowIdOrUrl: "https://www.runninghub.cn/workflow/2090436199843454978", capability: "video", apiKey: "secret" }),
            }),
        );
        expect(response.status).toBe(200);
        expect(mocks.discoverWorkflow).toHaveBeenCalledWith({ channelId: "rh", workflowIdOrUrl: "https://www.runninghub.cn/workflow/2090436199843454978", capability: "video" });
        expect(JSON.stringify(await response.json())).not.toContain("secret");
    });

    it("rejects aliases and malformed capabilities before calling the service", async () => {
        const alias = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channelId: "rh", workflowIdOrUrl: "workflow-minimax-h3-base", capability: "video" }) }));
        expect(alias.status).toBe(400);
        expect(mocks.discoverWorkflow).not.toHaveBeenCalled();
        mocks.discoverWorkflow.mockRejectedValueOnce(new Error("工作流渠道协议无效"));
        const invalid = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channelId: "rh", workflowIdOrUrl: "2090436199843454978", capability: "bad" }) }));
        expect(invalid.status).toBe(400);
    });
});
