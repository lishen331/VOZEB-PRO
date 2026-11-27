import { describe, expect, it } from "vitest";
import { getPracticeImageToolConfig, PRACTICE_IMAGE_TOOL_IDS } from "./practice-image-tools";

describe("practice image tool routes", () => {
    it("includes AI outpainting and keeps the legacy super-resolution route", () => {
        expect(PRACTICE_IMAGE_TOOL_IDS).toEqual(["reverse-prompt", "local-edit", "expression-reference", "super-resolution", "ai-outpainting"]);
        expect(PRACTICE_IMAGE_TOOL_IDS.map((id) => getPracticeImageToolConfig(id)!.path)).toEqual(["/practice/reverse-prompt", "/practice/local-edit", "/practice/expression-reference", "/practice/super-resolution", "/practice/ai-outpainting"]);
    });

    it("rejects an unknown route slug", () => {
        expect(getPracticeImageToolConfig("not-a-tool")).toBeNull();
    });
});
