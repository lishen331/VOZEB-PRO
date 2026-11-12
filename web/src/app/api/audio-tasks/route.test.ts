import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    resolveProjectExecutionContext: vi.fn(),
    createAudioTask: vi.fn(),
    getStoredGenerationTaskByRequest: vi.fn(),
    validateGenerationContextIpReferences: vi.fn(),
    resolveSchoolComputeBillingContext: vi.fn(),
    withGenerationConcurrencyLimit: vi.fn(),
    scheduleGenerationTask: vi.fn(),
    getCustomVoice: vi.fn(),
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
    withGenerationConcurrencyLimit: mocks.withGenerationConcurrencyLimit,
    getStoredGenerationTaskByRequest: mocks.getStoredGenerationTaskByRequest,
    linkStoredGenerationTask: vi.fn(),
}));
vi.mock("@/lib/server/generation-task-scheduler", () => ({ scheduleGenerationTask: mocks.scheduleGenerationTask }));
vi.mock("@/lib/server/ip-library-reference-service", () => ({ validateGenerationContextIpReferences: mocks.validateGenerationContextIpReferences }));
vi.mock("@/lib/server/school-compute-billing-context", () => ({ resolveSchoolComputeBillingContext: mocks.resolveSchoolComputeBillingContext }));

vi.mock("@/lib/server/generation-project-context", () => ({
    resolveProjectExecutionContext: mocks.resolveProjectExecutionContext,
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
vi.mock("@/lib/server/custom-voice-store", () => ({ getCustomVoice: mocks.getCustomVoice }));

import { POST } from "./route";
import { SchoolServiceError } from "@/lib/server/school-access-service";

describe("audio task model routing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resolveProjectExecutionContext.mockResolvedValue(undefined);
        mocks.resolveSchoolComputeBillingContext.mockResolvedValue(undefined);
        mocks.withGenerationConcurrencyLimit.mockImplementation(async (_userId, _type, _staleMs, _limit, handler) => handler());
    });
    it("queues a trusted practice audio task without the production concurrency gate", async () => {
        mocks.resolveProjectExecutionContext.mockResolvedValueOnce({ executionProfile: "open-source-practice", schoolId: "school-a" });
        mocks.createAudioTask.mockImplementation(async (input) => ({ ...input, id: "practice-audio", status: "pending", createdAt: 1, updatedAt: 1 }));
        const settings = {
            systemChannels: [
                {
                    id: "audio-channel",
                    name: "音频",
                    enabled: true,
                    purpose: "open-source-practice",
                    baseUrl: "https://runninghub.example",
                    apiKey: "key",
                    apiFormat: "openai",
                    models: ["audio-workflow"],
                    advancedConfig: {
                        protocol: "runninghub",
                        workflowConfigs: {
                            audio: {
                                workflowKey: "audio-workflow",
                                workflowId: "1",
                                workflowCode: "storyboard_dialogue_audio",
                                version: 1,
                                businessCode: "dubbing",
                                capability: "audio",
                                enabled: true,
                                createPath: "/task/openapi/create",
                                queryPath: "/openapi/v2/query",
                                taskIdField: "taskId",
                                statusField: "status",
                                resultField: "results",
                                inputMappings: [],
                                outputMappings: [],
                            },
                        },
                    },
                },
            ],
            logicalModels: [],
            defaultModels: { audioModel: "audio-workflow" },
            generationConcurrency: { audio: 1 },
            generationDefaults: { audioVoice: "alloy", audioFormat: "mp3" },
        };
        const { getAuthSettings } = await import("@/lib/auth/store");
        vi.mocked(getAuthSettings).mockResolvedValueOnce(settings as never);

        const response = await POST(
            new Request("http://localhost/api/audio-tasks", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ prompt: "配音", context: { surface: "drama", projectId: "practice-drama", businessCode: "dubbing" } }),
            }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ task: { id: "practice-audio" }, queued: true });
        expect(mocks.withGenerationConcurrencyLimit).not.toHaveBeenCalled();
        expect(mocks.scheduleGenerationTask).toHaveBeenCalledWith("audio", "practice-audio", expect.objectContaining({ executionPhase: "queued", lastUpstreamStatus: "queued" }));
    });

    it("returns the project access status before task creation", async () => {
        mocks.resolveProjectExecutionContext.mockRejectedValueOnce(Object.assign(new Error("当前账号没有可用的学校身份"), { status: 403 }));
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

    describe("custom voices", () => {
        const audioSettings = (channelIds: string[]) => ({
            systemChannels: channelIds.map((id) => ({
                id,
                name: id,
                enabled: true,
                purpose: "shared",
                baseUrl: `https://${id}.example`,
                apiKey: "key",
                apiFormat: "openai",
                models: ["speech-2.8-hd"],
            })),
            logicalModels: [
                {
                    id: "speech-2.8-hd",
                    name: "逻辑音频",
                    capability: "audio",
                    enabled: true,
                    bindings: channelIds.map((channelId) => ({ id: `bind-${channelId}`, channelId, upstreamModel: "speech-2.8-hd", enabled: true, priority: 0, weight: 100 })),
                },
            ],
            defaultModels: { audioModel: "speech-2.8-hd" },
            generationConcurrency: { audio: 1 },
            generationDefaults: { audioVoice: "female-shaonv", audioFormat: "mp3" },
        });

        const customVoice = { id: "voice-1", ownerUserId: "user", channelId: "channel-b", status: "ready", shared: false, ttsModel: "speech-2.8-hd", upstreamVoiceId: "upstream-1" };

        it("narrows candidates to the channel that owns the custom voice", async () => {
            const { getAuthSettings } = await import("@/lib/auth/store");
            vi.mocked(getAuthSettings).mockResolvedValueOnce(audioSettings(["channel-a", "channel-b"]) as never);
            mocks.getCustomVoice.mockResolvedValueOnce(customVoice);
            mocks.createAudioTask.mockImplementation(async (input) => ({ ...input, id: "audio-custom", status: "pending", createdAt: 1, updatedAt: 1 }));

            const response = await POST(
                new Request("http://localhost/api/audio-tasks", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ prompt: "你好", config: { model: "speech-2.8-hd", params: { voiceId: "custom:voice-1" } } }),
                }),
            );

            expect(response.status).toBe(200);
            const created = mocks.createAudioTask.mock.calls[0][0];
            expect(created.config).toMatchObject({ channelId: "channel-b", customVoiceId: "voice-1" });
            expect(created.candidateConfigs).toEqual([]);
        });

        it("rejects a custom voice the caller does not own or cannot see", async () => {
            const { getAuthSettings } = await import("@/lib/auth/store");
            vi.mocked(getAuthSettings).mockResolvedValueOnce(audioSettings(["channel-b"]) as never);
            mocks.getCustomVoice.mockResolvedValueOnce({ ...customVoice, ownerUserId: "someone-else", shared: false });

            const response = await POST(
                new Request("http://localhost/api/audio-tasks", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ prompt: "你好", config: { model: "speech-2.8-hd", params: { voiceId: "custom:voice-1" } } }),
                }),
            );

            expect(response.status).toBe(403);
            expect(mocks.createAudioTask).not.toHaveBeenCalled();
        });
    });
});
