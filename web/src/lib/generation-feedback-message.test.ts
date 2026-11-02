import { describe, expect, it } from "vitest";
import { GENERATION_BUSY_MESSAGE, GENERATION_COPYRIGHT_MESSAGE, GENERATION_LAST_FRAME_MESSAGE, GENERATION_POLICY_MESSAGE, GENERATION_UNAVAILABLE_MESSAGE, generationUserMessage } from "@/lib/generation-feedback-message";
import { upstreamErrorDetail } from "@/lib/server/generation-attempt";

describe("generationUserMessage", () => {
    it.each([
        [undefined, GENERATION_BUSY_MESSAGE],
        ["上游返回 504 Gateway Timeout", GENERATION_BUSY_MESSAGE],
        ["文本任务在提交阶段中断，未取得上游任务 ID", GENERATION_BUSY_MESSAGE],
        ["socket closed", GENERATION_BUSY_MESSAGE],
        ["token quota is not enough", GENERATION_UNAVAILABLE_MESSAGE],
        ["没有可用的文本渠道", GENERATION_UNAVAILABLE_MESSAGE],
        ["当前用户生图任务已达到并发上限，请稍后再试", "当前用户生图任务已达到并发上限，请稍后再试"],
        ["当前用户视频任务已达到并发上限", "当前用户视频任务已达到并发上限，请稍后再试"],
        ["当前用户文本任务已达到并发上限", "当前用户文本任务已达到并发上限，请稍后再试"],
        ["model not found", GENERATION_UNAVAILABLE_MESSAGE],
        ["内容未通过安全审核：prompt rejected", GENERATION_POLICY_MESSAGE],
        ["Your request was rejected by the content policy (violence)", GENERATION_POLICY_MESSAGE],
        ["HTTP 451 Unavailable For Legal Reasons", GENERATION_POLICY_MESSAGE],
        ["The response was filtered due to the prompt triggering Azure OpenAI's content management policy.", GENERATION_POLICY_MESSAGE],
        ["积分不足，当前余额 0", "积分不足，请充值后重试"],
        ["The input image contains a real person face", "参考图包含真人人脸，请更换图片后重试"],
        ["The request failed because the output video may be related to copyright restrictions. Request id: 0217916225520000", GENERATION_COPYRIGHT_MESSAGE],
        ["请求失败，因为输出视频可能与版权限制有关. Request id: 02179162601510200000", GENERATION_COPYRIGHT_MESSAGE],
        ["The parameter `content` specified in the request is not valid: last frame image content cannot be mixed with reference image content", GENERATION_LAST_FRAME_MESSAGE],
        ["尾帧图片不能与参考图同时使用", GENERATION_LAST_FRAME_MESSAGE],
    ])("maps %j", (raw, expected) => {
        expect(generationUserMessage(raw)).toBe(expected);
    });

    it("keeps already-mapped messages", () => {
        for (const message of [GENERATION_BUSY_MESSAGE, GENERATION_UNAVAILABLE_MESSAGE, GENERATION_POLICY_MESSAGE, GENERATION_COPYRIGHT_MESSAGE, GENERATION_LAST_FRAME_MESSAGE]) expect(generationUserMessage(message)).toBe(message);
    });
});

describe("upstreamErrorDetail", () => {
    it("keeps the raw upstream error but redacts secrets and caps length", () => {
        const detail = upstreamErrorDetail(new Error(`502 from https://up.example/v1/x?key=abc Bearer sk-secret123 ${"x".repeat(5000)}`));
        expect(detail).toContain("502 from https://up.example/v1/x");
        expect(detail).not.toContain("key=abc");
        expect(detail).not.toContain("sk-secret123");
        expect(detail!.length).toBeLessThanOrEqual(2000);
    });

    it("returns undefined for empty errors", () => {
        expect(upstreamErrorDetail(new Error(""))).toBeUndefined();
        expect(upstreamErrorDetail(null)).toBeUndefined();
    });
});

describe("reference size errors", () => {
    it.each([
        ["Height must be between 300px and 6000px.", "参考图尺寸不符合要求（每边需 300–6000 像素），请更换更清晰的图片后重试"],
        ["素材尺寸不符合要求，宽度和高度需在 300 至 6000 像素之间。 Height must be between 300px and 6000px.（素材格式或规格不支持）", "参考图尺寸不符合要求（每边需 300–6000 像素），请更换更清晰的图片后重试"],
        ["素材转换失败: Width must be between 300px and 6000px.", "参考图尺寸不符合要求（每边需 300–6000 像素），请更换更清晰的图片后重试"],
    ])("maps %j", (raw, expected) => {
        expect(generationUserMessage(raw)).toBe(expected);
    });
});
