import { describe, expect, it } from "vitest";
import { defaultDramaAssetGenerationLayout, normalizeDramaAssetGenerationLayout } from "./drama-asset-generation-contract";

describe("drama asset generation layout contract", () => {
    it("keeps L-compatible defaults without changing legacy asset data", () => {
        expect(defaultDramaAssetGenerationLayout("characters")).toBe("four_view");
        expect(defaultDramaAssetGenerationLayout("scenes")).toBe("single");
        expect(defaultDramaAssetGenerationLayout("props")).toBe("single");
        expect(normalizeDramaAssetGenerationLayout("characters", undefined)).toBe("four_view");
        expect(normalizeDramaAssetGenerationLayout("props", "invalid")).toBe("single");
    });

    it("preserves an explicit layout selection", () => {
        expect(normalizeDramaAssetGenerationLayout("scenes", "four_view")).toBe("four_view");
        expect(normalizeDramaAssetGenerationLayout("props", "single")).toBe("single");
    });
});
