import { describe, expect, it } from "vitest";

import { assertAgentPlanIntent, isAnalysisIntent } from "./agent-intent-guard";

describe("agent intent guard", () => {
    it("treats image error questions as text analysis", () => {
        expect(isAnalysisIntent("请分析这张图片为什么生成失败")).toBe(true);
        expect(() => assertAgentPlanIntent({ intent: "generation", deliverables: [{ type: "image", title: "结果", prompt: "重新生成" }] }, "请分析这张图片为什么生成失败", true)).toThrow("不应创建媒体生成任务");
    });

    it("allows explicit media creation", () => {
        expect(isAnalysisIntent("根据这张图片生成一张白底电商图")).toBe(false);
        expect(() => assertAgentPlanIntent({ intent: "generation", deliverables: [{ type: "image", title: "商品图", prompt: "白底商品图" }] }, "根据这张图片生成一张白底电商图", true)).not.toThrow();
    });
});
