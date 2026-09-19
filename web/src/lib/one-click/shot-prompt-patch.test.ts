import { describe, expect, it } from "vitest";
import { shotPromptPatch } from "./shot-prompt-patch";
describe("editable polished prompt persistence", () => {
    it("persists edits to the final image prompt, including explicit clearing", () => {
        expect(shotPromptPatch({ imagePrompt: "原始", polishedPrompt: "用户修订", videoPrompt: "视频" })).toEqual({ imagePrompt: "原始", polishedPrompt: "用户修订", videoPrompt: "视频" });
        expect(shotPromptPatch({ imagePrompt: "原始", polishedPrompt: "", videoPrompt: "" }).polishedPrompt).toBe("");
    });
});
