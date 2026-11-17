import { describe, expect, it } from "vitest";

import { resolvePromptExpansionMode, resolveVideoRequestRatio } from "./video-generation-route";

describe("H3 adaptive ratio", () => {
    const adaptive = { capabilityProfile: { videoRatioMode: "adaptive_in_keyframe" as const } };

    it("sends adaptive for a keyframe request", () => {
        expect(resolveVideoRequestRatio(adaptive, "16:9", true)).toBe("adaptive");
    });

    it("keeps the picked ratio for text-to-video", () => {
        expect(resolveVideoRequestRatio(adaptive, "16:9", false)).toBe("16:9");
    });

    it("leaves models without the capability untouched", () => {
        expect(resolveVideoRequestRatio({}, "9:16", true)).toBe("9:16");
        expect(resolveVideoRequestRatio({ capabilityProfile: {} }, "9:16", true)).toBe("9:16");
    });

    it("still maps auto to undefined for ordinary models", () => {
        expect(resolveVideoRequestRatio({}, "auto", false)).toBeUndefined();
    });
});

describe("H3 prompt expansion", () => {
    const modes = ["disabled", "balanced", "quality"];

    it("returns undefined when the model does not declare the levels", () => {
        expect(resolvePromptExpansionMode("quality", undefined)).toBeUndefined();
        expect(resolvePromptExpansionMode("quality", [])).toBeUndefined();
    });

    it("forwards a declared level", () => {
        expect(resolvePromptExpansionMode("quality", modes)).toBe("quality");
        expect(resolvePromptExpansionMode("disabled", modes)).toBe("disabled");
    });

    it("falls back to the declared default for missing or unknown values", () => {
        expect(resolvePromptExpansionMode(undefined, modes)).toBe("balanced");
        expect(resolvePromptExpansionMode("balance", modes)).toBe("balanced");
        expect(resolvePromptExpansionMode(true, modes)).toBe("balanced");
    });

    it("uses the first declared level when balanced is not offered", () => {
        expect(resolvePromptExpansionMode("nope", ["off", "high"])).toBe("off");
        expect(resolvePromptExpansionMode("high", ["off", "high"])).toBe("high");
    });
});
