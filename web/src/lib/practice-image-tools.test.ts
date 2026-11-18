import { describe, expect, it } from "vitest";
import { getPracticeImageToolConfig, PRACTICE_IMAGE_TOOL_IDS } from "./practice-image-tools";

describe("practice image tool routes", () => {
    it("exposes exactly four standalone tool ids and paths", () => {
        expect(PRACTICE_IMAGE_TOOL_IDS).toEqual(["reverse-prompt", "local-edit", "expression-reference", "super-resolution"]);
        expect(PRACTICE_IMAGE_TOOL_IDS.map((id) => getPracticeImageToolConfig(id)!.path)).toEqual(["/practice/reverse-prompt", "/practice/local-edit", "/practice/expression-reference", "/practice/super-resolution"]);
    });

    it("rejects an unknown route slug", () => {
        expect(getPracticeImageToolConfig("not-a-tool")).toBeNull();
    });
});
