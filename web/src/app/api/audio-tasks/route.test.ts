import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createAudioTask: vi.fn(),
    getStoredGenerationTaskByRequest: vi.fn(),
    validateGenerationContextIpReferences: vi.fn(),
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
});
