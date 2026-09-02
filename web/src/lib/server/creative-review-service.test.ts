import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthSettings, refundGenerationCharge, fetchInternalApi, resolveLogicalModel } = vi.hoisted(() => ({ getAuthSettings: vi.fn(), refundGenerationCharge: vi.fn(), fetchInternalApi: vi.fn(), resolveLogicalModel: vi.fn() }));

vi.mock("@/lib/auth/store", () => ({ getAuthSettings }));
vi.mock("@/lib/server/generation-charge-service", () => ({ refundGenerationCharge }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi }));
vi.mock("@/lib/server/logical-model-router", () => ({ resolveLogicalModel }));
vi.mock("@/lib/server/structured-model-output", () => ({ strictJsonObjectText: (value: unknown) => (typeof value === "string" ? value : "") }));

import { reviewCreativeOutputs } from "./creative-review-service";

const foundation = { complexity: "simple" as const, brief: { objective: "生成商品主图" }, direction: { summary: "干净、可信、突出产品" } };

describe("creative review service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getAuthSettings.mockResolvedValue({ site: { title: "星河创作" }, defaultModels: { textModel: "planner" } });
        resolveLogicalModel.mockReturnValue({ upstreamModel: "vendor-planner", channel: { id: "text-channel" } });
    });

    it("returns an explicit unavailable result when no visual or text input exists", async () => {
        const review = await reviewCreativeOutputs({ origin: "http://localhost:3000", cookie: "session=1", userId: "user", foundation, tasks: [{ id: "video", title: "视频", type: "video", prompt: "生成视频", resultSummary: "已完成" }] });

        expect(review).toMatchObject({ mode: "unavailable", status: "unavailable" });
        expect(getAuthSettings).not.toHaveBeenCalled();
    });

    it("sends real images to the trusted logical model route", async () => {
        fetchInternalApi.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    output: [
                        {
                            type: "function_call",
                            name: "review_creative_outputs",
                            arguments: JSON.stringify({ mode: "visual", status: "passed", score: 92, summary: "主体和视觉方向一致", issues: [], retryTaskIds: [] }),
                        },
                    ],
                }),
                { status: 200, headers: { "Content-Type": "application/json", "x-vozeb-pro-points-cost": "2" } },
            ),
        );

        const review = await reviewCreativeOutputs({
            origin: "http://localhost:3000",
            cookie: "session=1",
            userId: "user",
            billingId: "record-one",
            foundation,
            tasks: [{ id: "image-1", title: "主图", type: "image", prompt: "生成主图", resultSummary: "已生成", imageUrls: ["data:image/png;base64,AA=="] }],
        });

        expect(review).toMatchObject({ mode: "visual", status: "passed", score: 92 });
        expect(fetchInternalApi).toHaveBeenCalledWith("http://localhost:3000/api/ai/system/text-channel/responses", expect.objectContaining({ body: expect.stringContaining('"type":"input_image"') }));
        const requestBody = JSON.parse(fetchInternalApi.mock.calls[0][1].body);
        expect(requestBody.model).toBe("vendor-planner");
        expect(requestBody.input[0].content).toContain("你是 星河创作 创作质检 Agent");
        const headers = new Headers(fetchInternalApi.mock.calls[0][1].headers);
        expect(headers.get("x-vozeb-pro-logical-model")).toBe("planner");
        expect(headers.get("x-vozeb-pro-points-idempotency-key")).toMatch(/^creative-review:[a-f0-9]{32}$/);
    });

    it("sends completed video media to the visual review model", async () => {
        fetchInternalApi.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    output: [{ type: "function_call", name: "review_creative_outputs", arguments: JSON.stringify({ mode: "visual", status: "passed", summary: "video checked", issues: [], retryTaskIds: [] }) }],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            ),
        );

        const review = await reviewCreativeOutputs({
            origin: "http://localhost:3000",
            cookie: "session=1",
            userId: "user",
            foundation,
            tasks: [{ id: "video-1", title: "shot", type: "video", prompt: "animate", resultSummary: "completed", videoUrls: ["https://cdn.example.com/shot.mp4"] }],
        });

        expect(review).toMatchObject({ mode: "visual", status: "passed" });
        const requestBody = JSON.parse(fetchInternalApi.mock.calls[0][1].body);
        expect(requestBody.input[1].content).toContainEqual({ type: "input_video", video_url: "https://cdn.example.com/shot.mp4" });
        expect(requestBody.input[1].content).not.toContainEqual(expect.objectContaining({ type: "input_image" }));
        expect(JSON.stringify(requestBody)).not.toContain('"videoUrls"');
    });

    it("resolves private project video media before sending it upstream", async () => {
        fetchInternalApi
            .mockResolvedValueOnce(new Response(new Uint8Array([0, 1, 2]), { status: 200, headers: { "Content-Type": "video/mp4", "Content-Length": "3" } }))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ output: [{ type: "function_call", name: "review_creative_outputs", arguments: JSON.stringify({ mode: "visual", status: "passed", summary: "private video checked", issues: [], retryTaskIds: [] }) }] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
            );

        await expect(
            reviewCreativeOutputs({
                origin: "http://localhost:3000",
                cookie: "session=1",
                userId: "user",
                foundation,
                tasks: [{ id: "video-1", title: "shot", type: "video", prompt: "animate", resultSummary: "completed", videoUrls: ["/api/generation-log-assets/video.mp4"] }],
            }),
        ).resolves.toMatchObject({ mode: "visual", status: "passed" });

        const requestBody = JSON.parse(fetchInternalApi.mock.calls[1][1].body);
        expect(requestBody.input[1].content).toContainEqual({ type: "input_video", video_url: "data:video/mp4;base64,AAEC" });
    });

    it("falls back to Chat while preserving the video_url content part", async () => {
        fetchInternalApi
            .mockResolvedValueOnce(new Response("responses unsupported", { status: 404 }))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "review_creative_outputs", arguments: JSON.stringify({ mode: "visual", status: "passed", summary: "chat checked", issues: [], retryTaskIds: [] }) } }] } }] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
            );

        await expect(
            reviewCreativeOutputs({
                origin: "http://localhost:3000",
                cookie: "session=1",
                userId: "user",
                foundation,
                tasks: [{ id: "video-1", title: "shot", type: "video", prompt: "animate", resultSummary: "completed", videoUrls: ["https://cdn.example.com/shot.mp4"] }],
            }),
        ).resolves.toMatchObject({ mode: "visual", status: "passed" });

        const chatBody = JSON.parse(fetchInternalApi.mock.calls[1][1].body);
        expect(chatBody.messages[1].content).toContainEqual({ type: "video_url", role: "reference_video", video_url: { url: "https://cdn.example.com/shot.mp4" } });
    });

    it("ignores invalid video URLs instead of claiming a visual review", async () => {
        const review = await reviewCreativeOutputs({
            origin: "http://localhost:3000",
            cookie: "session=1",
            userId: "user",
            foundation,
            tasks: [{ id: "video-1", title: "shot", type: "video", prompt: "animate", resultSummary: "completed", videoUrls: ["blob:expired", "http://insecure.example.com/shot.mp4"] }],
        });

        expect(review).toMatchObject({ mode: "unavailable", status: "unavailable" });
        expect(getAuthSettings).not.toHaveBeenCalled();
    });

    it("refunds an invalid structured review and preserves the result as unavailable", async () => {
        fetchInternalApi.mockResolvedValueOnce(
            new Response(JSON.stringify({ output: [{ type: "function_call", name: "review_creative_outputs", arguments: JSON.stringify({ status: "passed" }) }] }), {
                status: 200,
                headers: { "Content-Type": "application/json", "x-vozeb-pro-points-cost": "3", "x-vozeb-pro-billing-receipt-id": "school:review-3" },
            }),
        );

        const review = await reviewCreativeOutputs({
            origin: "http://localhost:3000",
            cookie: "session=1",
            userId: "user",
            foundation,
            tasks: [{ id: "image-1", title: "主图", type: "image", prompt: "生成主图", resultSummary: "已生成", imageUrls: ["data:image/png;base64,AA=="] }],
        });

        expect(review).toMatchObject({ status: "unavailable" });
        expect(refundGenerationCharge).toHaveBeenCalledWith({ userId: "user", receiptId: "school:review-3", model: "planner", usageKind: "text", units: 1, idempotencyKey: "creative-review-refund:school:review-3" });
    });

    it("refunds malformed review JSON", async () => {
        fetchInternalApi.mockResolvedValueOnce(
            new Response(JSON.stringify({ output: [{ type: "function_call", name: "review_creative_outputs", arguments: "{" }] }), {
                status: 200,
                headers: { "Content-Type": "application/json", "x-vozeb-pro-points-cost": "0", "x-vozeb-pro-billing-receipt-id": "school:review-free" },
            }),
        );

        const review = await reviewCreativeOutputs({
            origin: "http://localhost:3000",
            cookie: "session=1",
            userId: "user",
            foundation,
            tasks: [{ id: "image-1", title: "主图", type: "image", prompt: "生成主图", resultSummary: "已生成", imageUrls: ["data:image/png;base64,AA=="] }],
        });

        expect(review.status).toBe("unavailable");
        expect(refundGenerationCharge).toHaveBeenCalledWith({ userId: "user", receiptId: "school:review-free", model: "planner", usageKind: "text", units: 1, idempotencyKey: "creative-review-refund:school:review-free" });
    });
});
