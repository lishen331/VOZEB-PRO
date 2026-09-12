import { describe, expect, it } from "vitest";
import { isScriptAgentKey, isScriptArtifactType, isScriptRunEventType, isScriptRunType, normalizeChapterSelection, SCRIPT_AGENT_KEYS, SCRIPT_RUN_EVENT_TYPES } from "./script-agent-domain";

describe("screenwriter agent domain", () => {
    it("accepts the confirmed text-only agents and artifacts", () => {
        expect(SCRIPT_AGENT_KEYS).toContain("storyboard_writer");
        expect(isScriptAgentKey("novel_writer")).toBe(true);
        expect(isScriptArtifactType("asset_prompts")).toBe(true);
        expect(isScriptRunType("episode_scripts")).toBe(true);
    });

    it("rejects every media-generation operation", () => {
        for (const value of ["image", "video", "audio", "dubbing", "storyboard_image", "generate_video"]) {
            expect(isScriptAgentKey(value)).toBe(false);
            expect(isScriptArtifactType(value)).toBe(false);
            expect(isScriptRunType(value)).toBe(false);
        }
    });

    it("limits a prose batch to one through five distinct positive chapters", () => {
        expect(normalizeChapterSelection([5, 3, 3, 4])).toEqual([3, 4, 5]);
        expect(() => normalizeChapterSelection([])).toThrow("1–5");
        expect(() => normalizeChapterSelection([1, 2, 3, 4, 5, 6])).toThrow("1–5");
        expect(() => normalizeChapterSelection([0])).toThrow("章节");
    });

    it("exposes only public persisted run events", () => {
        expect(SCRIPT_RUN_EVENT_TYPES).toContain("artifact_saved");
        expect(isScriptRunEventType("assistant_delta")).toBe(true);
        expect(isScriptRunEventType("reasoning_delta")).toBe(false);
        expect(isScriptRunEventType("chain_of_thought")).toBe(false);
    });
});
