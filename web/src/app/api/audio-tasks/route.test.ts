import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    resolveProjectExecutionProfile: vi.fn(),
    createAudioTask: vi.fn(),
    getStoredGenerationTaskByRequest: vi.fn(),
    validateGenerationContextIpReferences: vi.fn(),
    resolveSchoolComputeBillingContext: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return { ...actual, after: vi.fn() };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "user" })) }));
vi.mock("@/lib/auth/store", () => {
    class AuthInputError extends Error {
        status = 400;
    }
    return {
        AuthInputError,
        getAuthSettings: vi.fn(async () => ({
            systemChannels: [],
            logicalModels: [],
            defaultModels: { audioModel: "" },
            generationConcurrency: { audio: 1 },
            generationDefaults: { audioVoice: "alloy", audioFormat: "mp3" },
        })),
        isAuthInputError: (error: unknown) => error instanceof AuthInputError,
        refundUserPoints: vi.fn(),
    };
});
vi.mock("@/lib/server/generation-task-store", () => ({
    withGenerationConcurrencyLimit: vi.fn(async (_userId, _type, _staleMs, _limit, handler) => handler()),
    getStoredGenerationTaskByRequest: mocks.getStoredGenerationTaskByRequest,
    linkStoredGenerationTask: vi.fn(),
}));
vi.mock("@/lib/server/ip-library-reference-service", () => ({ validateGenerationContextIpReferences: mocks.validateGenerationContextIpReferences }));
vi.mock("@/lib/server/school-compute-billing-context", () => ({ resolveSchoolComputeBillingContext: mocks.resolveSchoolComputeBillingContext }));

vi.mock("@/lib/server/generation-project-context", () => ({
    resolveProjectExecutionProfile: mocks.resolveProjectExecutionProfile,
    projectExecutionProfileError: (error: unknown) =>
        error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number"
            ? { status: (error as { status: number }).status, message: error instanceof Error ? error.message : "项目访问权限已失效" }
            : null,
}));
vi.mock("@/lib/server/security", () => ({
    checkGenerationRateLimit: vi.fn(async () => ({ allowed: true, remaining: 19, resetAt: Date.now() + 60_000 })),
    rateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock("@/lib/server/audio-task-store", () => ({
    createAudioTask: mocks.createAudioTask,
    getAudioTask: vi.fn(),
    transitionAudioTask: vi.fn(),
    updateAudioTask: vi.fn(),
}));

import { POST } from "./route";
import { SchoolServiceError } from "@/lib/server/school-access-service";

describe("audio task model routing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resolveProjectExecutionProfile.mockResolvedValue(undefined);
        mocks.resolveSchoolComputeBillingContext.mockResolvedValue(undefined);
    });
    it("returns the project access status before task creation", async () => {
        mocks.resolveProjectExecutionProfile.mockRejectedValueOnce(Object.assign(new Error("当前账号没有可用的学校身份"), { status: 403 }));
        const response = await POST(
            new Request("http://localhost/api/audio-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "练习任务", context: { surface: "canvas", projectId: "practice-canvas" } }) }),
        );
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "当前账号没有可用的学校身份" });
    });

    it("rejects a forged client model when the backend has no audio default", async () => {
        const response = await POST(
            new Request("http://localhost/api/audio-tasks", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ config: { model: "forged-audio" }, prompt: "Generate narration" }),
            }),
        );

        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe("音频任务参数不完整或渠道不支持");
        expect(mocks.createAudioTask).not.toHaveBeenCalled();
    });

    it("rejects a new Drama audio task after its IP authorization is revoked", async () => {
        mocks.validateGenerationContextIpReferences.mockRejectedValueOnce(new SchoolServiceError(403, "IP 授权已失效"));

        const response = await POST(
            new Request("http://localhost/api/audio-tasks", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ prompt: "Generate narration", context: { surface: "drama", projectId: "drama-one" } }),
            }),
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "IP 授权已失效" });
        expect(mocks.createAudioTask).not.toHaveBeenCalled();
    });

    it("blocks a stale linked project before creating a personal task", async () => {
        mocks.resolveSchoolComputeBillingContext.mockRejectedValueOnce(new SchoolServiceError(409, "项目关联已失效"));
        const response = await POST(
            new Request("http://localhost/api/audio-tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "narration", context: { surface: "drama", projectId: "drama-one" } }) }),
        );
        expect(response.status).toBe(409);
        expect(mocks.createAudioTask).not.toHaveBeenCalled();
    });
});
