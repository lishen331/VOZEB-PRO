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
    it("includes the complete six-layer character anchor in the final image prompt", () => {
        const prompt = buildDramaLabAssetFinalPrompt(
            project,
            {
                name: "林忆",
                profile: {
                    visualIdentity: "",
                    styling: "",
                    colorPalette: "",
                    consistencyRules: "",
                    face_shape: "鹅蛋脸",
                    facial_features: "杏眼 #3D2B1F，直鼻",
                    unique_marks: "左眼下泪痣",
                    color_anchors: { hair: "#1A0A00", eyes: "#3D2B1F", skin: "#FDDBB4", primary_outfit: "#808080" },
                    skin_texture: "白皙细腻",
                    hair_style: "披肩微卷黑发",
                },
            },
            "characters",
            "都市女性",
        );
        expect(prompt).toContain("脸型：鹅蛋脸");
        expect(prompt).toContain("五官特征：杏眼 #3D2B1F，直鼻");
        expect(prompt).toContain("独特标记：左眼下泪痣");
        expect(prompt).toContain("头发 #1A0A00；眼睛 #3D2B1F；肤色 #FDDBB4；主服装 #808080");
        expect(prompt).toContain("皮肤质感：白皙细腻");
        expect(prompt).toContain("发型：披肩微卷黑发");
    });
});
