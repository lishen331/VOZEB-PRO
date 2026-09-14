import { describe, expect, it } from "vitest";
import { describeCanvasGenerationInputs } from "./use-canvas-generation-actions";

describe("canvas generation pipeline summary", () => {
    it("describes multimodal inputs and explicit platform additions", () => {
        expect(describeCanvasGenerationInputs({ mode: "image", prompt: "猫", textCount: 1, imageCount: 2, videoCount: 0, audioCount: 0, hasCameraControl: true })).toContain("图片输入：2");
        expect(describeCanvasGenerationInputs({ mode: "video", prompt: "猫", textCount: 1, imageCount: 1, videoCount: 1, audioCount: 1, isPanorama: true })).toContain("全景图约束");
    });
});
