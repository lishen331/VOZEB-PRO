import { describe, expect, it } from "vitest";
import { characterStageContextForEpisode } from "./drama-lab-character-stages";

const character = {
    id: "character-one",
    name: "林忆",
    description: "主角",
    stages: [
        { episodeRange: [1, 3] as [number, number], appearance: "白色校服" },
        { episodeRange: [4, 6] as [number, number], appearance: "深色风衣" },
    ],
};

describe("drama lab character stages", () => {
    it("matches the current episode and emits an executable appearance instruction", () => {
        expect(characterStageContextForEpisode(character, 5)).toBe("林忆：深色风衣");
    });

    it("falls back cleanly when no stage covers the episode", () => {
        expect(characterStageContextForEpisode(character, 9)).toBe("");
    });
});
