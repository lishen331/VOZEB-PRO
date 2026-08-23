import { describe, expect, it } from "vitest";

import { sanitizeDramaLabFramePrompt } from "./drama-lab-frame-prompt-sanitize";

describe("drama lab frame prompt sanitization", () => {
    it("normalizes allowed appearance and removes unlisted characters", () => {
        const result = sanitizeDramaLabFramePrompt("林薇（红色风衣、长发）位于画面左侧，顾城（黑衣）站在右侧。", ["林薇"], ["林薇", "顾城"]);
        expect(result.prompt).toContain("林薇（参考图中的人物形象）");
        expect(result.prompt).not.toContain("顾城");
        expect(result.report.changedSteps).toContain("unlisted_character");
    });

    it("removes scene appearance fragments and modern prop boilerplate", () => {
        const result = sanitizeDramaLabFramePrompt("场景为古宅，背景长发、眉眼清晰，智能手机为正常6英寸平放于茶几上，背景保持干净。", [], []);
        expect(result.prompt).not.toContain("长发");
        expect(result.prompt).not.toContain("智能手机");
        expect(result.report.totalRemovedChars).toBeGreaterThan(0);
    });
});
