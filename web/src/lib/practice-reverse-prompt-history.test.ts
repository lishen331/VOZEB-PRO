import { describe, expect, it } from "vitest";
import { readReversePromptHistoryInput } from "./practice-reverse-prompt-history";

describe("reverse prompt history input", () => {
    it("restores only the supported analysis mode and trimmed requirements", () => {
        expect(readReversePromptHistoryInput({ mode: "detail", extraRequirement: "  observe the frame  " })).toEqual({ mode: "detail", extraRequirement: "observe the frame" });
        expect(readReversePromptHistoryInput({ mode: "invalid", extraRequirement: "" })).toBeNull();
        expect(readReversePromptHistoryInput({ mode: "general", extraRequirement: "a".repeat(20001) })).toBeNull();
    });
});
