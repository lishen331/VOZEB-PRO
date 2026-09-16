import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAuthSettings } from "@/lib/auth/store";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { requestStructuredText } from "@/lib/server/text-planning-runtime";
import { optimizeCreativePrompt } from "./prompt-optimization-service";

vi.mock("@/lib/auth/store", () => ({ getAuthSettings: vi.fn() }));
const refundGenerationCharge = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/generation-charge-service", () => ({ refundGenerationCharge }));
vi.mock("@/lib/server/logical-model-router", () => ({ resolveLogicalModelCandidates: vi.fn() }));
vi.mock("@/lib/server/text-planning-runtime", () => ({
    rankTextPlanningCandidates: <T>(items: T[]) => items,
    requestStructuredText: vi.fn(),
}));

const candidate = {
    channelId: "text-channel",
    upstreamModel: "grok-4.5",
    channel: { id: "text-channel", name: "文本渠道", baseUrl: "https://example.com/v1", apiKey: "secret", apiFormat: "openai", models: ["grok-4.5"], enabled: true },
};

describe("prompt optimization service", () => {
    beforeEach(() => {
        vi.mocked(getAuthSettings)
            .mockReset()
            .mockResolvedValue({ site: { title: "星河创作" }, defaultModels: { textModel: "planner" } } as Awaited<ReturnType<typeof getAuthSettings>>);
        vi.mocked(resolveLogicalModelCandidates)
            .mockReset()
            .mockReturnValue([candidate] as ReturnType<typeof resolveLogicalModelCandidates>);
        vi.mocked(requestStructuredText).mockReset();
        refundGenerationCharge.mockReset();
    });

    it("uses the default text model once and returns a valid public prompt", async () => {
        vi.mocked(requestStructuredText).mockResolvedValue({ arguments: JSON.stringify({ optimizedPrompt: "生成一张清晰的国风角色海报，保留青色长袍。" }), headers: new Headers(), protocol: "chat", elapsedMs: 10 });

        const result = await optimizeCreativePrompt({ origin: "http://localhost:3000", cookie: "session=1", userId: "user-one", requestId: "request-one", prompt: "做个国风角色海报 青衣", mode: "image" });

        expect(result).toBe("生成一张清晰的国风角色海报，保留青色长袍。");
        expect(requestStructuredText).toHaveBeenCalledTimes(1);
        expect(requestStructuredText).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: expect.arrayContaining([expect.objectContaining({ role: "system", content: expect.stringContaining("你是 星河创作 提示词编辑器") }), expect.objectContaining({ role: "user", content: "做个国风角色海报 青衣" })]),
            }),
        );
        expect(new Headers(vi.mocked(requestStructuredText).mock.calls[0]![0].headers).get("x-vozeb-pro-logical-model")).toBe("planner");
    });

    it("refunds an invalid charged response instead of accepting hidden or empty output", async () => {
        vi.mocked(requestStructuredText).mockResolvedValue({
            arguments: JSON.stringify({ explanation: "内部分析" }),
            headers: new Headers({ "x-vozeb-pro-points-cost": "3", "x-vozeb-pro-billing-receipt-id": "school:one" }),
            protocol: "chat",
            elapsedMs: 10,
        });

        await expect(optimizeCreativePrompt({ origin: "http://localhost:3000", cookie: "session=1", userId: "user-one", requestId: "request-one", prompt: "优化这句话", mode: "agent" })).rejects.toThrow("默认文本模型没有返回有效提示词");
        expect(refundGenerationCharge).toHaveBeenCalledWith({ userId: "user-one", receiptId: "school:one", model: "planner", usageKind: "text", units: 1, idempotencyKey: "prompt-optimize-refund:school:one" });
    });

    it("uses the practice text model with a free execution profile", async () => {
        vi.mocked(getAuthSettings).mockResolvedValue({ site: { title: "星河创作" }, defaultModels: { textModel: "production-writer" }, practiceDefaultModels: { textModel: "practice-writer" } } as Awaited<ReturnType<typeof getAuthSettings>>);
        vi.mocked(resolveLogicalModelCandidates).mockImplementation((_settings, _capability, model, _channel, profile) =>
            model === "practice-writer" && profile === "open-source-practice" ? ([candidate] as ReturnType<typeof resolveLogicalModelCandidates>) : [],
        );
        vi.mocked(requestStructuredText).mockResolvedValue({ arguments: JSON.stringify({ optimizedPrompt: "免费练习提示词" }), headers: new Headers(), protocol: "chat", elapsedMs: 10 });

        await expect(optimizeCreativePrompt({ origin: "http://localhost:3000", cookie: "session=1", userId: "user-one", requestId: "practice-request", prompt: "练习原文", mode: "image", executionProfile: "open-source-practice" })).resolves.toBe(
            "免费练习提示词",
        );

        const headers = new Headers(vi.mocked(requestStructuredText).mock.calls[0]![0].headers);
        expect(headers.get("x-vozeb-pro-execution-profile")).toBe("open-source-practice");
    });

    it("does not fall back to the free practice model for a paid optimization request", async () => {
        vi.mocked(getAuthSettings).mockResolvedValue({ site: { title: "星河创作" }, defaultModels: { textModel: "" }, practiceDefaultModels: { textModel: "practice-writer" } } as Awaited<ReturnType<typeof getAuthSettings>>);
        vi.mocked(resolveLogicalModelCandidates).mockImplementation((_settings, _capability, model, _channel, profile) =>
            model === "practice-writer" && profile === "open-source-practice" ? ([candidate] as ReturnType<typeof resolveLogicalModelCandidates>) : [],
        );

        await expect(optimizeCreativePrompt({ origin: "http://localhost:3000", cookie: "", userId: "user-one", requestId: "request-one", prompt: "优化这句话", mode: "image" })).rejects.toMatchObject({ status: 503 });
        expect(requestStructuredText).not.toHaveBeenCalled();
    });

    it("fails clearly when no default text binding is available", async () => {
        vi.mocked(resolveLogicalModelCandidates).mockReturnValue([]);

        await expect(optimizeCreativePrompt({ origin: "http://localhost:3000", cookie: "", userId: "user-one", requestId: "request-one", prompt: "优化这句话", mode: "agent" })).rejects.toMatchObject({ status: 503 });
        expect(requestStructuredText).not.toHaveBeenCalled();
    });
});
