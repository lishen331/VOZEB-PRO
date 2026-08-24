import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    after: vi.fn(),
    getCurrentUser: vi.fn(),
    getAuthSettings: vi.fn(),
    checkRateLimit: vi.fn(),
    countActiveStoredGenerationTasks: vi.fn(),
    withGenerationConcurrencyLimit: vi.fn(),
    runGenerationTaskRecoveryBatch: vi.fn(),
    createAgentRun: vi.fn(),
    getAgentRunByClientRequestId: vi.fn(),
    listAgentRuns: vi.fn(),
    validateCreativeProjectIpReferencesForRun: vi.fn(),
    resolveSchoolComputeBillingContext: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/security", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/server/generation-task-store", () => ({ withGenerationConcurrencyLimit: mocks.withGenerationConcurrencyLimit }));
vi.mock("@/lib/server/generation-task-recovery-service", () => ({ runGenerationTaskRecoveryBatch: mocks.runGenerationTaskRecoveryBatch }));
vi.mock("@/lib/server/agent-run-store", () => ({ createAgentRun: mocks.createAgentRun, getAgentRunByClientRequestId: mocks.getAgentRunByClientRequestId, listAgentRuns: mocks.listAgentRuns }));
vi.mock("@/lib/server/internal-origin", () => ({ resolveInternalOrigin: vi.fn(() => "http://localhost") }));
vi.mock("@/lib/server/ip-library-reference-service", () => ({ validateCreativeProjectIpReferencesForRun: mocks.validateCreativeProjectIpReferencesForRun }));
vi.mock("@/lib/server/school-compute-billing-context", () => ({ resolveSchoolComputeBillingContext: mocks.resolveSchoolComputeBillingContext }));

import { GET, maxDuration, POST } from "./route";
import { SchoolServiceError } from "@/lib/server/school-access-service";

describe("POST /api/agent/runs", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user" });
        mocks.getAuthSettings.mockResolvedValue({ generationConcurrency: { agent: 2 } });
        mocks.checkRateLimit.mockReturnValue({ allowed: true });
        mocks.countActiveStoredGenerationTasks.mockResolvedValue(0);
        mocks.withGenerationConcurrencyLimit.mockImplementation(async (_userId, _type, _staleMs, _limit, handler) => handler());
        mocks.getAgentRunByClientRequestId.mockResolvedValue(null);
        mocks.validateCreativeProjectIpReferencesForRun.mockResolvedValue(undefined);
        mocks.resolveSchoolComputeBillingContext.mockResolvedValue(undefined);
    });

    it("keeps Agent recovery alive while long media children are running", () => {
        expect(maxDuration).toBeGreaterThanOrEqual(40 * 60);
    });

    it("requires authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await POST(request(validInput()));
        expect(response.status).toBe(401);
    });

    it("enforces chat surface invariants before creating a run", async () => {
        const response = await POST(request({ ...validInput(), projectId: "project" }));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ msg: "普通对话不接受项目或快照" });
        expect(mocks.createAgentRun).not.toHaveBeenCalled();
    });

    it("returns an existing idempotent run before rate and concurrency checks", async () => {
        mocks.getAgentRunByClientRequestId.mockResolvedValue({ id: "existing-run", userId: "user", clientRequestId: "request-one" });
        const response = await POST(request(validInput()));
        expect(await response.json()).toMatchObject({ data: { run: { id: "existing-run" }, created: false } });
        expect(mocks.checkRateLimit).not.toHaveBeenCalled();
        expect(mocks.withGenerationConcurrencyLimit).not.toHaveBeenCalled();
        expect(mocks.createAgentRun).not.toHaveBeenCalled();
    });

    it("creates a pre-scheduled run and queues recovery without a second task update", async () => {
        const run = { id: "new-run", userId: "user", clientRequestId: "request-one" };
        mocks.createAgentRun.mockResolvedValue({ run, conversation: { id: "conversation" }, created: true });
        const response = await POST(request(validInput()));
        expect(await response.json()).toMatchObject({ data: { run: { id: "new-run" }, conversation: { id: "conversation" }, created: true } });
        expect(mocks.createAgentRun).toHaveBeenCalledWith("user", {
            ...validInput(),
            conversationId: undefined,
            projectId: undefined,
            skillIds: [],
            modelIds: [],
            snapshot: undefined,
        });
        expect(mocks.after).toHaveBeenCalledWith(expect.any(Function));
    });

    it("revalidates project IP grants before creating a new canvas run", async () => {
        mocks.validateCreativeProjectIpReferencesForRun.mockRejectedValue(new SchoolServiceError(403, "IP 授权已失效"));

        const response = await POST(request({ ...validInput(), surface: "canvas", projectId: "canvas-one", snapshot: { projectId: "canvas-one", nodes: [], connections: [] } }));

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 403, msg: "IP 授权已失效" });
        expect(mocks.validateCreativeProjectIpReferencesForRun).toHaveBeenCalledWith("user", "canvas", "canvas-one");
        expect(mocks.createAgentRun).not.toHaveBeenCalled();
    });

    it("replaces a client billing context with the trusted project association", async () => {
        const billingContext = { schoolId: "school-a", groupId: "group-a", orderId: "order-a", projectType: "canvas" as const, projectId: "canvas-one" };
        mocks.resolveSchoolComputeBillingContext.mockResolvedValue(billingContext);
        mocks.createAgentRun.mockResolvedValue({ run: { id: "new-run", userId: "user" }, conversation: { id: "conversation" }, created: true });
        await POST(
            request({
                ...validInput(),
                surface: "canvas",
                projectId: "canvas-one",
                snapshot: { projectId: "canvas-one", nodes: [], connections: [] },
                billingContext: { schoolId: "fake", groupId: "fake", orderId: "fake", projectType: "canvas", projectId: "canvas-one" },
            }),
        );

        expect(mocks.resolveSchoolComputeBillingContext).toHaveBeenCalledWith("user", { surface: "canvas", projectId: "canvas-one", executionProfile: "production" });
        expect(mocks.createAgentRun).toHaveBeenCalledWith("user", expect.objectContaining({ billingContext }));
    });
});

describe("GET /api/agent/runs", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user" });
        mocks.listAgentRuns.mockResolvedValue([]);
    });

    it("passes entity filters to the store instead of filtering a fixed in-memory page", async () => {
        const response = await GET(new Request("http://localhost/api/agent/runs?conversationId=conversation-one&projectId=project-one&surface=canvas"));

        expect(response.status).toBe(200);
        expect(mocks.listAgentRuns).toHaveBeenCalledWith({ userId: "user", conversationId: "conversation-one", projectId: "project-one", surface: "canvas", statuses: undefined, limit: 50 });
    });

    it("queries the latest active run directly for workspace recovery", async () => {
        mocks.listAgentRuns.mockResolvedValue([{ id: "active-run", userId: "user", status: "running" }]);
        const response = await GET(new Request("http://localhost/api/agent/runs?surface=chat&status=active&limit=1"));

        expect(response.status).toBe(200);
        expect(mocks.listAgentRuns).toHaveBeenCalledWith({ userId: "user", conversationId: "", projectId: "", surface: "chat", statuses: ["planning", "running", "paused"], limit: 1 });
        expect(mocks.after).not.toHaveBeenCalled();
        expect(mocks.runGenerationTaskRecoveryBatch).not.toHaveBeenCalled();
    });
});

function request(body: unknown) {
    return new Request("http://localhost/api/agent/runs", { method: "POST", headers: { "content-type": "application/json", cookie: "session=test" }, body: JSON.stringify(body) });
}

function validInput() {
    return { clientRequestId: "request-one", surface: "chat", prompt: "生成一张图", assetIds: [] };
}
