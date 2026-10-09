import { describe, expect, it } from "vitest";
import { GENERATION_BUSY_MESSAGE, GENERATION_POLICY_MESSAGE, GENERATION_UNAVAILABLE_MESSAGE, generationUserMessage } from "@/lib/generation-feedback-message";
import { upstreamErrorDetail } from "@/lib/server/generation-attempt";

describe("generationUserMessage", () => {
    it.each([
        [undefined, GENERATION_BUSY_MESSAGE],
        ["上游返回 504 Gateway Timeout", GENERATION_BUSY_MESSAGE],
        ["文本任务在提交阶段中断，未取得上游任务 ID", GENERATION_BUSY_MESSAGE],
        ["socket closed", GENERATION_BUSY_MESSAGE],
        ["token quota is not enough", GENERATION_UNAVAILABLE_MESSAGE],
        ["没有可用的文本渠道", GENERATION_UNAVAILABLE_MESSAGE],
        ["model not found", GENERATION_UNAVAILABLE_MESSAGE],
        ["内容未通过安全审核：prompt rejected", GENERATION_POLICY_MESSAGE],
        ["Your request was rejected by the content policy (violence)", GENERATION_POLICY_MESSAGE],
        ["HTTP 451 Unavailable For Legal Reasons", GENERATION_POLICY_MESSAGE],
        ["积分不足，当前余额 0", "积分不足，请充值后重试"],
        ["The input image contains a real person face", "参考图包含真人人脸，请更换图片后重试"],
    ])("maps %j", (raw, expected) => {
        expect(generationUserMessage(raw)).toBe(expected);
    });

    it("keeps already-mapped messages", () => {
        for (const message of [GENERATION_BUSY_MESSAGE, GENERATION_UNAVAILABLE_MESSAGE, GENERATION_POLICY_MESSAGE]) expect(generationUserMessage(message)).toBe(message);
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
