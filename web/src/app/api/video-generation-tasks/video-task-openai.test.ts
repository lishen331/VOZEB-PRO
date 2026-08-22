import { describe, expect, it } from "vitest";
import { normalizeOpenAiVideoSeconds } from "./video-task-openai";

describe("Sora-compatible video multipart duration", () => {
    it.each([
        [Number.NaN, 4],
        [2, 4],
        [4, 4],
        [6, 8],
        [8, 8],
        [9, 12],
        [15, 12],
    ])("maps %s seconds to %s", (requested, expected) => {
        expect(normalizeOpenAiVideoSeconds(requested)).toBe(expected);
    });
});
