import { describe, expect, it } from "vitest";

import { resultTargetSize } from "@/app/api/image-tasks/image-task-size";

describe("practice panorama image result sizing", () => {
    it("does not resample scene_main_view results to the global square default", () => {
        expect(resultTargetSize("scene_main_view", "production", { quality: "auto", size: "1:1" })).toBeUndefined();
    });

    it("keeps ordinary image result sizing unchanged", () => {
        expect(resultTargetSize("storyboard_shot", "production", { quality: "auto", size: "1:1" })).toBe("1024x1024");
    });

    it("preserves every practice workflow result geometry, not only panoramas", () => {
        expect(resultTargetSize("character_main_view", "open-source-practice", { quality: "auto", size: "1:1" })).toBeUndefined();
        expect(resultTargetSize("storyboard_shot", "open-source-practice", { quality: "auto", size: "1:1" })).toBeUndefined();
    });
});
