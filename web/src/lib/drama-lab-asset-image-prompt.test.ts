import { describe, expect, it } from "vitest";
import { buildDramaLabAssetImagePrompt, readDramaLabAssetVisualDetails } from "./drama-lab-asset-image-prompt";

const project = { style: "realistic", aspectRatio: "9:16" };
describe("lab asset generation consumes preserved extraction fields", () => {
    it("uses character appearance rather than losing it to background description", () => {
        const prompt = buildDramaLabAssetImagePrompt(project, { name: "林薇", description: "主角", appearance: "短发，红色风衣" }, "characters");
        expect(prompt).toContain("短发，红色风衣");
        expect(prompt).toContain("真实皮肤纹理");
    });
    it.each(["scenes", "props"] as const)("uses %s imagePrompt without re-injecting narrative people", (kind) => {
        const prompt = buildDramaLabAssetImagePrompt(project, { name: "林薇的物件", description: "林薇拿起铜灯", imagePrompt: "仅铜灯主体，无人物无手，纯色底" }, kind);
        expect(prompt).toContain("仅铜灯主体，无人物无手，纯色底");
        expect(prompt).not.toContain("林薇");
    });
    it("uses a saved polished prompt as the final generation prompt", () => {
        expect(buildDramaLabAssetImagePrompt(project, { name: "林薇", polishedPrompt: "固定四视图最终提示词" }, "characters")).toBe("固定四视图最终提示词");
    });

    it("uses the declared layout when a polished prompt is not available", () => {
        const prompt = buildDramaLabAssetImagePrompt(project, { name: "林薇", generationLayout: "four_view" }, "characters");
        expect(prompt).toContain("角色四视图设定板");
    });
    it("reads only the declared visual metadata fields", () => {
        expect(readDramaLabAssetVisualDetails({ appearance: "红衣", imagePrompt: "  单人  ", role: "main", generationLayout: "four_view", arbitrary: "ignored", time: 123 })).toEqual({
            appearance: "红衣",
            imagePrompt: "单人",
            generationLayout: "four_view",
            role: "main",
        });
    });
});
