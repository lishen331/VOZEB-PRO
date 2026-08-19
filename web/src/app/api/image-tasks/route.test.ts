import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getAuthSettings: vi.fn(),
    getStoredGenerationTaskByRequest: vi.fn(),
    rate: vi.fn(),
    validateGenerationContextIpReferences: vi.fn(),
    withGenerationConcurrencyLimit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "user-one", role: "user" })) }));
vi.mock("@/lib/auth/store", () => ({
    getAuthSettings: mocks.getAuthSettings,
    isAuthInputError: vi.fn(() => false),
    refundUserPoints: vi.fn(),
}));
vi.mock("@/lib/server/generation-task-store", () => ({
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

import { maxDuration, POST } from "./route";
import { SchoolServiceError } from "@/lib/server/school-access-service";

describe("image task route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getStoredGenerationTaskByRequest.mockResolvedValue(undefined);
        mocks.rate.mockResolvedValue({ allowed: true, remaining: 5, resetAt: Date.now() + 60_000 });
        mocks.validateGenerationContextIpReferences.mockResolvedValue(undefined);
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
        expect(mocks.validateGenerationContextIpReferences).toHaveBeenCalledWith("user-one", { surface: "canvas", projectId: "canvas-one" });
        expect(mocks.getAuthSettings).not.toHaveBeenCalled();
    });
});
