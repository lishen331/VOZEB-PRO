import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/safe-outbound-fetch", () => ({ fetchSafeOutbound: (url: string | URL, init?: RequestInit) => fetch(url, init) }));
vi.mock("@/lib/server/generation-media-authorization", () => ({ generationMediaProxyHeaders: vi.fn(() => ({ "x-media-auth": "signed" })) }));

const mocks = vi.hoisted(() => ({
    fetchInternalApi: vi.fn(),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    transitionTask: vi.fn(),
    schedule: vi.fn(),
    register: vi.fn(),
    writeMedia: vi.fn(),
    refund: vi.fn(),
    recordLog: vi.fn(),
    getUsers: vi.fn(),
    getLog: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getAuthSettings: vi.fn(), getPublicUsersByIds: mocks.getUsers }));
vi.mock("@/lib/server/generation-log-task-service", () => ({ recordGenerationTaskLogResult: mocks.recordLog }));
vi.mock("@/lib/server/generation-log-store", () => ({ getGenerationLogForUser: mocks.getLog }));
vi.mock("@/lib/server/generation-charge-service", () => ({ refundGenerationCharge: mocks.refund }));
vi.mock("@/lib/server/audio-task-store", () => ({
    getAudioTask: mocks.getTask,
    updateAudioTask: mocks.updateTask,
    transitionAudioTask: mocks.transitionTask,
}));
vi.mock("@/lib/server/creative-runtime-service", () => ({ registerGenerationTaskAssetsForUser: mocks.register }));
vi.mock("@/lib/server/generation-task-scheduler", () => ({ scheduleGenerationTask: mocks.schedule }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writePersistentMediaDataUrl: mocks.writeMedia }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi, isInternalApiBaseUrl: (baseUrl: string) => baseUrl.startsWith("/") }));

import { createProtocolFixtureServer } from "../../../scripts/protocol-fixture-server.mjs";
import { GenerationSubmissionUncertainError } from "./generation-submission-error";
import { createAudioTaskUpstreamStep, markAudioTaskFailed, queryAudioTaskUpstreamStep } from "./audio-task-runtime";
import type { AudioTask } from "./audio-task-store";
import { emptyAdvancedConfig, protocolModelConfig, registeredChannelProtocolDefinitions } from "@/lib/channel-protocol-registry";
import { readVerifiedSystemAiBusinessRequestId } from "./system-ai-billing";

const AUDIO_PROTOCOLS = registeredChannelProtocolDefinitions.filter((definition) => definition.capabilities.includes("audio"));

describe("audio task runtime submission safety", () => {
    let state: AudioTask;

    beforeEach(() => {
        vi.clearAllMocks();
        state = audioTask();
        mocks.getTask.mockImplementation(async () => state);
        mocks.updateTask.mockImplementation(async (_id: string, patch: Partial<AudioTask>) => {
            state = { ...state, ...patch };
            return state;
        });
        mocks.transitionTask.mockImplementation(async (_task: AudioTask, allowed: string[], patch: Partial<AudioTask>) => {
            if (!allowed.includes(state.status)) return null;
            state = { ...state, ...patch };
            return state;
        });
        mocks.writeMedia.mockResolvedValue({ token: "fixture-audio", url: "/api/reference-assets/fixture-audio.wav" });
        mocks.register.mockResolvedValue(undefined);
        mocks.recordLog.mockResolvedValue({});
        mocks.getUsers.mockResolvedValue([{ id: "user-one", username: "student", displayName: "学生" }]);
        mocks.getLog.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("persists local audio as a same-origin path, never the worker origin", async () => {
        mocks.writeMedia.mockResolvedValue({ token: "fixture-audio", storage: "local" });
        const wav = Buffer.from("UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=", "base64");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(wav, { headers: { "content-type": "audio/wav" } })));
        await expect(createAudioTaskUpstreamStep(state, "http://127.0.0.1:3000")).resolves.toEqual({ state: "completed" });
        expect(state.result?.url).toBe("/api/reference-assets/fixture-audio");
        expect(mocks.register).toHaveBeenCalledWith("user-one", expect.objectContaining({ assets: [expect.objectContaining({ url: "/api/reference-assets/fixture-audio" })] }));
    });

    it("uses the official POST contract and nested results for RunningHub audio", async () => {
        const task = audioTask();
        task.config = { ...task.config, baseUrl: "/api/ai/system/rh", advancedConfig: { ...emptyAdvancedConfig(), protocol: "runninghub", queryPath: "/openapi/v2/query", statusField: "data.status", resultField: "data.result" } };
        task.upstream = { id: "existing-audio", createPath: "/task/openapi/create" };
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ code: 0, data: { status: "SUCCESS", results: [{ fileUrl: "https://cdn.example/result.wav", fileType: "wav", nodeId: "90" }] } }));
        await expect(queryAudioTaskUpstreamStep(task, "http://localhost")).resolves.toMatchObject({ state: "result_ready", resultUrl: "https://cdn.example/result.wav" });
        const [url, init] = mocks.fetchInternalApi.mock.calls[0];
        expect(url).toBe("http://localhost/api/ai/system/rh/openapi/v2/query");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body).taskId).toBe("existing-audio");
    });

    it("switches to the next channel after a deterministic 422 rejection", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(Response.json({ error: { message: "参数不受支持" } }, { status: 422 }))
            .mockResolvedValueOnce(Response.json({ audio_url: "https://cdn.example/result.mp3" }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(createAudioTaskUpstreamStep(state, "http://internal")).resolves.toMatchObject({
            state: "result_ready",
            resultUrl: "https://cdn.example/result.mp3",
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(state.config.channelId).toBe("channel-two");
        expect(state.candidateConfigs).toEqual([]);
        expect(state.attempts?.map(({ status }) => status)).toEqual(["failed", "running"]);
        expect(mocks.schedule).toHaveBeenLastCalledWith(
            "audio",
            "audio-one",
            expect.objectContaining({ executionPhase: "result_ready", channelId: "channel-two", resultPayload: { url: "https://cdn.example/result.mp3" }, lastUpstreamStatus: "completed" }),
        );
    });

    it("persists an asynchronous upstream task identity before returning", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "audio-upstream-one" })));

        await expect(createAudioTaskUpstreamStep(state, "http://internal")).resolves.toMatchObject({ state: "pending", upstreamTaskId: "audio-upstream-one" });

        expect(state.upstream).toEqual({ id: "audio-upstream-one", createPath: "/audio/speech" });
        expect(mocks.schedule).toHaveBeenLastCalledWith("audio", "audio-one", expect.objectContaining({ executionPhase: "submitted", upstreamTaskId: "audio-upstream-one", channelId: "channel-one", lastUpstreamStatus: "submitted" }));
    });

    it("signs trusted practice polling with a stable server-owned request identity", async () => {
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ id: "audio-upstream-one", status: "processing" }));
        state = {
            ...audioTask(),
            executionProfile: "open-source-practice",
            attemptNo: 3,
            config: { ...audioTask().config, baseUrl: "/api/ai/system/channel-one", executionProfile: "open-source-practice" },
            upstream: { id: "audio-upstream-one", createPath: "/audio/speech" },
        };

        await expect(queryAudioTaskUpstreamStep(state, "http://localhost", "session=test")).resolves.toMatchObject({ state: "pending" });

        const headers = new Headers((mocks.fetchInternalApi.mock.calls[0]?.[1] as RequestInit).headers);
        expect(readVerifiedSystemAiBusinessRequestId(headers, "audio-one", state.config.model, "open-source-practice")).toBe("audio-task:audio-one:attempt:3:poll");
    });

    it("does not persist an HTML fallback page as generated audio", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response("<!doctype html><html><body>fallback</body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }))
            .mockResolvedValueOnce(Response.json({ audio_url: "https://cdn.example/result.mp3" }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(createAudioTaskUpstreamStep(state, "http://internal")).resolves.toMatchObject({ state: "result_ready", resultUrl: "https://cdn.example/result.mp3" });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(mocks.writeMedia).not.toHaveBeenCalled();
        expect(state.attempts?.map(({ status }) => status)).toEqual(["failed", "running"]);
    });

    it.each(AUDIO_PROTOCOLS)("receives an audio response from the $id protocol over a local TCP interface", async (definition) => {
        const fixture = createProtocolFixtureServer();
        await new Promise<void>((resolve) => fixture.server.listen(0, "127.0.0.1", resolve));
        const address = fixture.server.address();
        if (!address || typeof address === "string") throw new Error("Protocol fixture did not bind a TCP port");
        const origin = `http://127.0.0.1:${address.port}`;
        const custom = definition.id === "custom";
        const advancedConfig = custom
            ? {
                  ...emptyAdvancedConfig(),
                  protocol: "custom" as const,
                  createPath: "/custom/audio",
                  requestTemplate: '{"deployment":"{{model}}","content":"{{input}}","speaker":"{{voice}}","rate":"{{speed}}"}',
                  resultField: "data.audio_url",
              }
            : { ...emptyAdvancedConfig(), ...(protocolModelConfig(definition.id, "audio") || { protocol: definition.id }) };
        state = {
            ...audioTask(),
            config: {
                baseUrl: origin,
                apiKey: "fixture-key",
                apiFormat: "openai",
                model: `${definition.id}-audio`,
                channelId: `fixture-${definition.id}-audio`,
                voice: custom ? "nova" : "alloy",
                format: "wav",
                speed: custom ? "1.25" : "1",
                advancedConfig,
            },
            candidateConfigs: [],
        };

        try {
            const result = await createAudioTaskUpstreamStep(state, "http://internal");
            if (custom) {
                expect(result).toMatchObject({ state: "result_ready", resultUrl: expect.stringContaining("/media/fixture.wav") });
                expect(JSON.parse(fixture.requests[0]?.body.toString("utf8") || "{}")).toEqual({ deployment: "custom-audio", content: "test", speaker: "nova", rate: 1.25 });
            } else {
                expect(result).toEqual({ state: "completed" });
                expect(state).toMatchObject({ status: "success", result: { url: "/api/reference-assets/fixture-audio.wav", mimeType: "audio/wav" } });
                expect(mocks.writeMedia).toHaveBeenCalledWith(expect.stringMatching(/^data:audio\/wav;base64,UklGR/), "audio", expect.objectContaining({ ownerUserId: "user-one", taskId: "audio-one" }));
                expect(mocks.register).toHaveBeenCalledOnce();
            }
            expect(fixture.requests[0]).toMatchObject({ method: "POST", path: custom ? "/custom/audio" : "/audio/speech" });
            expect(fixture.requests[0]?.headers.authorization).toBe("Bearer fixture-key");
            expect(fixture.requests[0]?.headers["idempotency-key"]).toBe("audio-task:audio-one:attempt:1");
            expect(fixture.requests[0]?.headers["x-client-request-id"]).toBe("audio-task:audio-one:attempt:1");
        } finally {
            await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
        }
    });

    it("records successful practice audio with its persistent browser URL", async () => {
        state = { ...audioTask(), status: "running", executionProfile: "open-source-practice", businessCode: "dubbing" };
        mocks.writeMedia.mockResolvedValueOnce({ token: "permanent/audio/result.flac", url: "/api/reference-assets/permanent/audio/result.flac" });
        mocks.getUsers.mockResolvedValueOnce([{ id: "user-one", username: "student", displayName: "学生" }]);
        mocks.fetchInternalApi.mockResolvedValueOnce(new Response(Buffer.from("fLaC"), { headers: { "content-type": "audio/flac" } }));

        const { persistAudioTaskResult } = await import("./audio-task-runtime");
        await expect(persistAudioTaskResult({ ...state, config: { ...state.config, baseUrl: "/api/ai/system/rh" } }, "http://127.0.0.1:3000", "https://cdn.example/result.flac")).resolves.toMatchObject({
            status: "success",
            result: { url: "/api/reference-assets/permanent/audio/result.flac", mimeType: "audio/flac" },
        });
        expect(mocks.recordLog).toHaveBeenCalledWith(
            expect.objectContaining({
                taskId: "audio-one",
                userId: "user-one",
                kind: "audio",
                source: "practice",
                status: "success",
                asset: { type: "audio", url: "/api/reference-assets/permanent/audio/result.flac", mimeType: "audio/flac" },
            }),
        );
    });

    it("normalizes a legacy internal audio URL while backfilling its log", async () => {
        const task = {
            ...audioTask(),
            status: "success" as const,
            executionProfile: "open-source-practice" as const,
            businessCode: "dubbing" as const,
            result: { url: "http://127.0.0.1:3000/api/reference-assets/permanent/audio/result.flac", mimeType: "audio/flac" },
        };

        const { ensurePracticeAudioGenerationLog } = await import("./audio-task-runtime");
        await ensurePracticeAudioGenerationLog(task, "success");

        expect(mocks.recordLog).toHaveBeenCalledWith(
            expect.objectContaining({
                asset: { type: "audio", url: "/api/reference-assets/permanent/audio/result.flac", mimeType: "audio/flac" },
            }),
        );
    });

    it("does not rewrite an existing practice audio generation log", async () => {
        const task = { ...audioTask(), status: "success" as const, executionProfile: "open-source-practice" as const, businessCode: "dubbing" as const, result: { url: "/api/reference-assets/audio.flac", mimeType: "audio/flac" } };
        mocks.getLog.mockResolvedValueOnce({ id: "audio-task:audio-one" });

        const { ensurePracticeAudioGenerationLog } = await import("./audio-task-runtime");
        await ensurePracticeAudioGenerationLog(task, "success");

        expect(mocks.recordLog).not.toHaveBeenCalled();
        expect(mocks.getUsers).not.toHaveBeenCalled();
    });

    it("keeps the original candidate when the request connection is interrupted", async () => {
        const fetchMock = vi.fn().mockRejectedValueOnce(new Error("socket closed"));
        vi.stubGlobal("fetch", fetchMock);

        await expect(createAudioTaskUpstreamStep(state, "http://internal")).rejects.toBeInstanceOf(GenerationSubmissionUncertainError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(state.config.channelId).toBe("channel-one");
        expect(state.candidateConfigs).toHaveLength(1);
        expect(state.attempts?.map(({ status }) => status)).toEqual(["running"]);
    });

    it("treats a successful response with invalid JSON as an uncertain submission", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce(
                new Response("not-json", {
                    status: 200,
                    headers: { "content-type": "application/json", "x-vozeb-pro-points-cost": "1.25", "x-vozeb-pro-billing-receipt-id": "audio-receipt-unknown" },
                }),
            ),
        );

        await expect(createAudioTaskUpstreamStep(state, "http://internal")).rejects.toBeInstanceOf(GenerationSubmissionUncertainError);
        expect(state.config.channelId).toBe("channel-one");
        expect(state.billing).toEqual({ pointsCost: 1.25, billingReceiptId: "audio-receipt-unknown", refunded: false });
        expect(mocks.refund).not.toHaveBeenCalled();
    });

    it("records a failed dubbing practice task without an audio asset", async () => {
        state = { ...audioTask(), status: "running", executionProfile: "open-source-practice", businessCode: "dubbing" };
        mocks.refund.mockImplementationOnce(async () => {
            state = { ...state, billing: state.billing ? { ...state.billing, refunded: true } : undefined };
            return state;
        });

        await expect(markAudioTaskFailed(state, "workflow failed")).resolves.toMatchObject({ status: "error" });
        expect(mocks.recordLog).toHaveBeenCalledWith(
            expect.objectContaining({
                taskId: "audio-one",
                kind: "audio",
                source: "practice",
                status: "failed",
                error: "workflow failed",
                asset: undefined,
            }),
        );
    });

    it("does not refund when audio success wins the failure transition race", async () => {
        state = { ...audioTask(), status: "running", billing: { pointsCost: 2, billingReceiptId: "audio-race", refunded: false } };
        mocks.transitionTask.mockImplementationOnce(async () => {
            state = { ...state, status: "success" };
            return null;
        });

        await expect(markAudioTaskFailed(state, "late failure")).resolves.toMatchObject({ status: "success" });
        expect(mocks.refund).not.toHaveBeenCalled();
    });

    it("commits the audio error state before refunding", async () => {
        state = { ...audioTask(), status: "running", attemptNo: 1, billing: { pointsCost: 2, billingReceiptId: "audio-failed", refunded: false } };
        mocks.refund.mockImplementationOnce(async () => {
            expect(state.status).toBe("error");
            return undefined;
        });

        await expect(markAudioTaskFailed(state, "provider failed")).resolves.toMatchObject({ status: "error", billing: { refunded: true } });
        expect(mocks.refund).toHaveBeenCalledOnce();
    });
});

function audioTask(): AudioTask {
    const second = { baseUrl: "https://two.example", apiKey: "two", apiFormat: "openai" as const, model: "audio-two", channelId: "channel-two", voice: "alloy", format: "mp3", speed: "1" };
    return {
        id: "audio-one",
        userId: "user-one",
        status: "pending",
        createdAt: 1,
        updatedAt: 1,
        config: { baseUrl: "https://one.example", apiKey: "one", apiFormat: "openai", model: "audio-one", channelId: "channel-one", voice: "alloy", format: "mp3", speed: "1" },
        candidateConfigs: [second],
        prompt: "test",
    };
}
