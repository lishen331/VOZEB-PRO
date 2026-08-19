import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createTextTask: vi.fn(),
    validateGenerationContextIpReferences: vi.fn(),
    getStoredGenerationTaskByRequest: vi.fn(),
    linkStoredGenerationTask: vi.fn(),
    checkGenerationRateLimit: vi.fn(async () => ({ allowed: true, remaining: 5, resetAt: Date.now() + 60_000 })),
}));

vi.mock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return { ...actual, after: vi.fn() };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "user-one" })) }));
vi.mock("@/lib/auth/store", () => ({
    getAuthSettings: vi.fn(async () => ({
        systemChannels: [],
        logicalModels: [],
        defaultModels: { textModel: "" },
        generationConcurrency: { text: 1 },
    })),
    isAuthInputError: vi.fn(() => false),
}));
vi.mock("@/lib/server/generation-task-store", () => ({
    getStoredGenerationTaskByRequest: mocks.getStoredGenerationTaskByRequest,
    linkStoredGenerationTask: mocks.linkStoredGenerationTask,
    withGenerationConcurrencyLimit: vi.fn(async (_userId, _type, _staleMs, _limit, handler) => handler()),
}));
vi.mock("@/lib/server/security", () => ({
    checkGenerationRateLimit: mocks.checkGenerationRateLimit,
    rateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock("@/lib/server/text-task-store", () => ({ createTextTask: mocks.createTextTask }));
vi.mock("@/lib/server/ip-library-reference-service", () => ({ validateGenerationContextIpReferences: mocks.validateGenerationContextIpReferences }));

import { POST } from "./route";
import { SchoolServiceError } from "@/lib/server/school-access-service";

describe("text task IP authorization", () => {
    beforeEach(() => vi.clearAllMocks());

    it("rejects a new Canvas text task after its IP authorization is revoked", async () => {
        mocks.validateGenerationContextIpReferences.mockRejectedValueOnce(new SchoolServiceError(403, "IP 授权已失效"));

        const response = await POST(
            new Request("http://localhost/api/text-tasks", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ messages: [{ role: "user", content: "继续创作" }], context: { surface: "canvas", projectId: "canvas-one" } }),
            }),
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "IP 授权已失效" });
        expect(mocks.createTextTask).not.toHaveBeenCalled();
    });

    it("returns an idempotent task before rate limits and revoked reference checks", async () => {
        mocks.getStoredGenerationTaskByRequest.mockResolvedValueOnce({ id: "text-existing", status: "pending", config: { model: "text-model" } });

        const response = await POST(
            new Request("http://localhost/api/text-tasks", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ messages: [{ role: "user", content: "继续创作" }], context: { surface: "canvas", projectId: "canvas-one", clientRequestId: "request-one" } }),
            }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ task: { id: "text-existing" } });
        expect(mocks.checkGenerationRateLimit).not.toHaveBeenCalled();
        expect(mocks.validateGenerationContextIpReferences).not.toHaveBeenCalled();
        expect(mocks.createTextTask).not.toHaveBeenCalled();
    });
});
