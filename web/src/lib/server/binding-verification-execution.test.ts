import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/store";
import type { BindingVerificationRun } from "./binding-verification-store";
const state = vi.hoisted(() => ({
    run: null as BindingVerificationRun | null,
    task: null as Record<string, unknown> | null,
    evidence: true,
    fp: "fp",
    createText: vi.fn(),
    runText: vi.fn(),
    settings: {
        logicalModels: [
            {
                id: "m",
                name: "model",
                capability: "text",
                enabled: true,
                bindings: [
                    { id: "b", channelId: "c", upstreamModel: "vision", enabled: false, priority: 1 },
                    { id: "other", channelId: "other", upstreamModel: "fallback", enabled: true, priority: 2 },
                ],
            },
        ],
        systemChannels: [{ id: "c", name: "channel", baseUrl: "https://upstream.example", apiKey: "secret", apiFormat: "openai", enabled: true, models: ["vision"] }],
    },
}));
vi.mock("@/lib/auth/store", () => ({ getFreshAuthSettings: async () => state.settings }));
vi.mock("./binding-verification-policy", () => ({ bindingVerificationFingerprint: () => state.fp }));
vi.mock("./binding-verification-store", () => ({
    recordBindingVerificationDiagnostic: vi.fn(),
    createBindingVerification: async (input: Omit<BindingVerificationRun, "id" | "createdAt" | "updatedAt">) => (state.run = { ...input, id: "run", createdAt: 1, updatedAt: 1 }),
    getBindingVerification: async () => state.run,
    updateBindingVerification: async (_id: string, patch: Partial<BindingVerificationRun>) => (state.run = { ...state.run!, ...patch }),
    claimBindingVerification: async (_id: string, busyUntil: number) => (state.run?.busyUntil ? null : (state.run = { ...state.run!, busyUntil })),
    completeBindingVerification: async (_id: string, _busy: number, result: BindingVerificationRun["result"]) => (state.run = { ...state.run!, status: "passed", result, busyUntil: 0 }),
}));
vi.mock("./text-task-store", () => ({
    createTextTask: async (input: Record<string, unknown>) => {
        state.createText(input);
        return (state.task = { ...input, id: "task", status: "pending" });
    },
    getTextTask: async () => state.task,
}));
vi.mock("./text-task-runtime", () => ({
    runTextTaskStep: async () => {
        state.runText();
        state.task = { ...state.task, status: "success", result: { content: "Orange sphere beside a blue cube." } };
        if (state.evidence) state.run = { ...state.run!, diagnostics: { ...state.run!.diagnostics, requestDigest: "wire-digest" } };
        return { state: "completed" };
    },
}));
vi.mock("./image-task-store", () => ({ createImageTask: vi.fn(), getImageTask: vi.fn() }));
vi.mock("./image-task-runtime", () => ({ createImageTaskUpstreamStep: vi.fn(), queryImageTaskUpstreamStep: vi.fn(), persistImageTaskResult: vi.fn() }));
vi.mock("./video-task-store", () => ({ createVideoTask: vi.fn(), getVideoTask: vi.fn(), updateVideoTask: vi.fn() }));
vi.mock("./video-task-runtime", () => ({ queryVideoTaskUpstream: vi.fn(), persistVideoTaskResult: vi.fn() }));
vi.mock("@/app/api/video-generation-tasks/video-generation-route", () => ({ createUpstream: vi.fn() }));
vi.mock("./generation-task-scheduler", () => ({ scheduleGenerationTask: vi.fn() }));
vi.mock("./media-download", () => ({ downloadMediaToFile: vi.fn() }));
vi.mock("./internal-origin", () => ({ resolveInternalOrigin: (origin: string) => origin }));
import { startBindingVerification, advanceBindingVerification } from "./binding-verification-runner";
const user: PublicUser = {
    id: "u",
    accountId: "1",
    username: "admin",
    displayName: "Admin",
    bio: "",
    role: "admin",
    status: "active",
    adminPermissions: ["upstream.manage"],
    planId: "p",
    planName: "p",
    hasActivePlan: true,
    pointsBalance: 1000,
    permanentPointsBalance: 1000,
    dailyPointsBalance: 0,
    dailyPointsExpiresAt: "",
    mfaEnabled: false,
    createdAt: "",
    updatedAt: "",
};
const start = () => startBindingVerification({ logicalModelId: "m", bindingId: "b", user, publicOrigin: "https://site.test" });
describe("real binding runner orchestration", () => {
    beforeEach(() => {
        state.run = null;
        state.task = null;
        state.evidence = true;
        state.fp = "fp";
        vi.clearAllMocks();
    });
    it("accepts a deliberately unauthenticated channel without requiring an API key", async () => {
        const channel = state.settings.systemChannels[0];
        const originalKey = channel.apiKey;
        Object.assign(channel, { apiKey: "", advancedConfig: { authMode: "none" } });
        try {
            expect((await start()).status).toBe("running");
        } finally {
            channel.apiKey = originalKey;
            Reflect.deleteProperty(channel, "advancedConfig");
        }
    });
    it("executes exactly the disabled target with one image and no fallback candidate", async () => {
        const original = JSON.stringify(state.settings);
        await start();
        const result = await advanceBindingVerification("run", user, "https://site.test", "session=cookie");
        expect(result.status).toBe("passed");
        expect(state.createText).toHaveBeenCalledOnce();
        const input = state.createText.mock.calls[0][0];
        expect(input.config).toMatchObject({ channelId: "c", model: "vision", logicalModel: "m" });
        expect(input.candidateConfigs).toEqual([]);
        expect(input.messages[0].content.filter((part: { type: string }) => part.type === "image_url")).toHaveLength(1);
        expect(JSON.stringify(state.settings)).toBe(original);
    });
    it("does not trust generated content without actual proxy submission evidence", async () => {
        state.evidence = false;
        await start();
        const result = await advanceBindingVerification("run", user, "https://site.test", "");
        expect(result.status).toBe("failed");
        expect(result.error).toContain("提交证据");
    });
    it("fails changed settings without executing a provider", async () => {
        await start();
        state.fp = "changed";
        const result = await advanceBindingVerification("run", user, "https://site.test", "");
        expect(result.status).toBe("failed");
        expect(state.runText).not.toHaveBeenCalled();
    });
    it("does not replay an expired in-flight submission", async () => {
        await start();
        state.run!.busyUntil = Date.now() - 1;
        const result = await advanceBindingVerification("run", user, "https://site.test", "");
        expect(result.status).toBe("needs_review");
        expect(state.createText).not.toHaveBeenCalled();
    });
    it("returns terminal result without another provider call", async () => {
        await start();
        await advanceBindingVerification("run", user, "https://site.test", "");
        await advanceBindingVerification("run", user, "https://site.test", "");
        expect(state.runText).toHaveBeenCalledOnce();
    });
    it("does not let another admin execute an owned run", async () => {
        await start();
        await expect(advanceBindingVerification("run", { ...user, id: "other" }, "https://site.test", "")).rejects.toThrow("无权访问");
        expect(state.runText).not.toHaveBeenCalled();
    });
});
