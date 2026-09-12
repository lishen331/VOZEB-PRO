import { describe, expect, it } from "vitest";
import { normalizePromptAssets, normalizeScriptShots, validateScriptToolCall } from "./script-agent-tools-v2";

describe("screenwriter tools", () => {
    it("enforces the one-to-five chapter contract", () => {
        expect(validateScriptToolCall("save_chapter", { chapterNumbers: [1, 3, 5] })).toMatchObject({ chapterNumbers: [1, 3, 5] });
        expect(() => validateScriptToolCall("save_chapter", { chapterNumbers: [1, 2, 3, 4, 5, 6] })).toThrow("1–5");
    });
    it("rejects every media tool", () => {
        for (const name of ["generate_image", "generate_video", "generate_audio", "generate_storyboard_image"]) expect(() => validateScriptToolCall(name, {})).toThrow("不允许");
    });
    it("normalizes one textual shot per row", () => {
        const shots = normalizeScriptShots("episode-1", [
            {
                sceneId: "scene-1",
                shotNumber: 1,
                visualDescription: "雨夜近景",
                shotSize: "近景",
                cameraAngle: "平视",
                composition: "居中",
                cameraMovement: "固定",
                characterIds: ["c1"],
                action: "回头",
                emotion: "警惕",
                durationSeconds: 3,
                characterAssetIds: ["c1"],
                propAssetIds: [],
            },
        ]);
        expect(shots).toHaveLength(1);
        expect(shots[0]).toMatchObject({ episodeId: "episode-1", sceneId: "scene-1", durationSeconds: 3 });
    });
    it("deduplicates project prompts by type and canonical name", () => {
        expect(
            normalizePromptAssets([
                { type: "character", name: " 苏明 ", prompt: "青年" },
                { type: "character", name: "苏明", prompt: "青年主角" },
            ]),
        ).toEqual([{ assetType: "character", canonicalName: "苏明", basePrompt: "青年主角", aliases: [], variants: [] }]);
    });
});
