import { describe, expect, it } from "vitest";

import { normalizePracticeModuleVisibility, normalizePracticeWorkflowModels } from "./store-normalizers";

describe("practice workflow model bindings", () => {
    it("normalizes legacy and multiple practice workflow model bindings", () => {
        expect(
            normalizePracticeWorkflowModels({
                "storyboard-image": "practice-image-a",
                "storyboard-video": ["practice-video-a", "practice-video-b", "practice-video-a", ""],
            }),
        ).toEqual({
            "storyboard-image": ["practice-image-a"],
            "storyboard-video": ["practice-video-a", "practice-video-b"],
        });
    });

    it("defaults unfinished projects to hidden and keeps six Demo modules visible", () => {
        expect(normalizePracticeModuleVisibility(undefined)).toEqual({
            canvas: false,
            drama: false,
            character: true,
            scene: true,
            prop: true,
            "storyboard-image": true,
            "storyboard-video": true,
            dubbing: true,
        });
        expect(normalizePracticeModuleVisibility({ scene: false }).scene).toBe(false);
    });
});
