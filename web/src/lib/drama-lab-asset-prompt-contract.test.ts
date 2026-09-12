import { describe, expect, it } from "vitest";
import { buildDramaLabAssetFinalPrompt, dramaLabAssetPromptField } from "./drama-lab-asset-prompt-contract";

const project = { style: "realistic", aspectRatio: "16:9" };
describe("L-compatible asset prompt contracts", () => {
    it("locks characters to the industrial four-view sheet", () => {
        const prompt = buildDramaLabAssetFinalPrompt(project, { name: "林忆", appearance: "短发红衣" }, "characters", "短发红衣");
        expect(prompt).toContain("FACE HERO CLOSE-UP");
        expect(prompt).toContain("FRONT VIEW");
        expect(prompt).toContain("BACK VIEW");
        expect(prompt).toContain("SIDE PROFILE CLOSE-UP");
        expect(prompt).toContain("MATERIAL & TEXTURE NOTES");
    });
    it("selects separate scene single and four-view prompts", () => {
        expect(dramaLabAssetPromptField("scenes", { generationLayout: "single", singleImagePrompt: "single", polishedPrompt: "four" })).toBe("single");
        expect(dramaLabAssetPromptField("scenes", { generationLayout: "four_view", singleImagePrompt: "single", polishedPrompt: "four" })).toBe("four");
        expect(buildDramaLabAssetFinalPrompt(project, { generationLayout: "single" }, "scenes", "夜晚公园")).toContain("ONE single continuous image");
        expect(buildDramaLabAssetFinalPrompt(project, { generationLayout: "four_view" }, "scenes", "夜晚公园")).toContain("2×2 grid");
    });
    it("supports prop single and four-view contracts", () => {
        expect(buildDramaLabAssetFinalPrompt(project, { generationLayout: "single" }, "props", "银色机械表")).toContain("Exactly one prop");
        expect(buildDramaLabAssetFinalPrompt(project, { generationLayout: "four_view" }, "props", "银色机械表")).toContain("FRONT VIEW, SIDE VIEW, BACK VIEW");
    });
});
