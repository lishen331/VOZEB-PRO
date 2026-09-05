import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    after: vi.fn(),
    getAuthSettings: vi.fn(),
    getStoredGenerationTaskByRequest: vi.fn(),
    generationCapacityRetryAfterSeconds: vi.fn(),
    rate: vi.fn(),
    validateGenerationContextIpReferences: vi.fn(),
    withGenerationConcurrencyLimit: vi.fn(),
    resolveSchoolComputeBillingContext: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return { ...actual, after: mocks.after };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "user-one", role: "user" })) }));
vi.mock("@/lib/auth/store", () => ({
    getAuthSettings: mocks.getAuthSettings,
    isAuthInputError: vi.fn(() => false),
    refundUserPoints: vi.fn(),
}));
vi.mock("@/lib/server/generation-task-store", () => ({
    generationCapacityRetryAfterSeconds: mocks.generationCapacityRetryAfterSeconds,
    getStoredGenerationTaskByRequest: mocks.getStoredGenerationTaskByRequest,
    linkStoredGenerationTask: vi.fn(),
    withGenerationConcurrencyLimit: mocks.withGenerationConcurrencyLimit,
}));
vi.mock("@/lib/server/security", () => ({
    checkGenerationRateLimit: mocks.rate,
    rateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock("@/lib/server/proxy-dispatcher", () => ({ configureServerProxyDispatcher: vi.fn() }));
vi.mock("@/lib/server/ip-library-reference-service", () => ({ validateGenerationContextIpReferences: mocks.validateGenerationContextIpReferences }));
vi.mock("@/lib/server/school-compute-billing-context", () => ({ resolveSchoolComputeBillingContext: mocks.resolveSchoolComputeBillingContext }));

import { maxDuration, POST } from "./route";
import { SchoolServiceError } from "@/lib/server/school-access-service";

describe("image task route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getStoredGenerationTaskByRequest.mockResolvedValue(undefined);
        mocks.rate.mockResolvedValue({ allowed: true, remaining: 5, resetAt: Date.now() + 60_000 });
        mocks.validateGenerationContextIpReferences.mockResolvedValue(undefined);
        mocks.resolveSchoolComputeBillingContext.mockResolvedValue(undefined);
        mocks.withGenerationConcurrencyLimit.mockImplementation(async (_userId, _type, _staleMs, _limit, handler) => handler());
    });

    it("keeps background image submission alive past the five minute route default", () => {
        expect(maxDuration).toBeGreaterThanOrEqual(40 * 60);
    });

    it("returns the existing task before settings, rate, and concurrency checks", async () => {
        mocks.getStoredGenerationTaskByRequest.mockResolvedValue({
            id: "existing-image-task",
            kind: "generation",
            status: "running",
            config: { model: "image-upstream", logicalModel: "image-logical" },
        });

        const response = await POST(
            new Request("http://localhost/api/image-tasks", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-VOZEB-PRO-Client-Request-Id": "image-workbench:conversation:slot",
                    "X-VOZEB-PRO-Attempt-No": "3",
                },
                body: JSON.stringify({ prompt: "same request", context: { clientRequestId: "image-workbench:conversation:slot", attemptNo: 3 } }),
            }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ task: { id: "existing-image-task", status: "running", model: "image-logical" } });
        expect(mocks.getStoredGenerationTaskByRequest).toHaveBeenCalledWith("image", "user-one", "image-workbench:conversation:slot", 3);
        expect(mocks.getAuthSettings).not.toHaveBeenCalled();
        expect(mocks.rate).not.toHaveBeenCalled();
        expect(mocks.withGenerationConcurrencyLimit).not.toHaveBeenCalled();
    });

    it("rejects a new Canvas task when its pinned IP authorization was revoked", async () => {
        mocks.validateGenerationContextIpReferences.mockRejectedValueOnce(new SchoolServiceError(403, "IP 授权已失效"));

        const response = await POST(
            new Request("http://localhost/api/image-tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: "new image", context: { surface: "canvas", projectId: "canvas-one" } }),
            }),
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "IP 授权已失效" });
        expect(mocks.validateGenerationContextIpReferences).toHaveBeenCalledWith("user-one", expect.objectContaining({ surface: "canvas", projectId: "canvas-one" }));
        expect(mocks.getAuthSettings).not.toHaveBeenCalled();
    });

    it("blocks a stale linked project before creating a personal task", async () => {
        mocks.getAuthSettings.mockResolvedValue({ generationConcurrency: { image: 1 } });
        mocks.resolveSchoolComputeBillingContext.mockRejectedValueOnce(new SchoolServiceError(409, "项目关联已失效"));
        const response = await POST(
            new Request("http://localhost/api/image-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "new image", context: { surface: "canvas", projectId: "canvas-one" } }) }),
        );
        expect(response.status).toBe(409);
    });
});

function imageRequest(body: unknown) {
    return new Request("http://localhost/api/image-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function imageSettings() {
    return {
        generationConcurrency: { image: 1 },
        generationDefaults: { imageSize: "auto", imageQuality: "auto" },
        systemChannels: [{ id: "image-channel", name: "图片", enabled: true, baseUrl: "https://image.example.com/v1", apiKey: "secret", apiFormat: "openai", models: ["upstream-image"] }],
        logicalModels: [
            {
                id: "image",
                name: "图片",
                capability: "image",
                enabled: true,
                bindings: [{ id: "binding", channelId: "image-channel", upstreamModel: "upstream-image", enabled: true, priority: 1 }],
            },
        ],
        defaultModels: { imageModel: "image" },
    };
}
