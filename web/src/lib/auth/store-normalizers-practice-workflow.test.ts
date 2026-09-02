import { describe, expect, it } from "vitest";

import { normalizePracticeWorkflowModels } from "./store-normalizers";

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
});
