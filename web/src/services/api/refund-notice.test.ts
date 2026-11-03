import { describe, expect, it } from "vitest";

import { withRefundNotice } from "./refund-notice";

describe("withRefundNotice", () => {
    it("tells the user how many points came back", () => {
        expect(withRefundNotice("图片生成失败", 27)).toBe("图片生成失败（本次扣除的 27 积分已退回）");
    });

    it("keeps the original message when nothing was refunded", () => {
        expect(withRefundNotice("图片生成失败")).toBe("图片生成失败");
        expect(withRefundNotice("图片生成失败", 0)).toBe("图片生成失败");
        expect(withRefundNotice("图片生成失败", -5)).toBe("图片生成失败");
    });

    it("formats fractional refunds without trailing zeros", () => {
        expect(withRefundNotice("生成失败", 2.5)).toBe("生成失败（本次扣除的 2.5 积分已退回）");
        expect(withRefundNotice("生成失败", 3.0)).toBe("生成失败（本次扣除的 3 积分已退回）");
    });
});
