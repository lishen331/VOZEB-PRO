import { describe, expect, it, vi } from "vitest";

const { reviewCreativeOutputs } = vi.hoisted(() => ({ reviewCreativeOutputs: vi.fn() }));

vi.mock("@/lib/server/creative-review-service", () => ({ reviewCreativeOutputs }));

import { buildDramaLabWorkflowReviewInput } from "./drama-lab-workflow-review-service";
import type { DramaProject } from "@/lib/drama-project-contract";

function project(): DramaProject {
    return {
        id: "project-one",
        title: "video project",
        summary: "summary",
        style: "cinematic",
        ratio: "16:9",
        status: "active",
        characters: [],
        scenes: [],
        props: [],
        clues: [],
        defaultVideoMode: "storyboard",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        episodes: [
            {
                id: "episode-one",
                title: "episode one",
                script: "A short script",
                outline: "",
                hook: "",
                nextPreview: "",
                sourceRange: "",
                reviewStatus: "draft",
                shots: [
                    {
                        id: "shot-one",
                        order: 1,
                        title: "motion",
                        description: "A character walks",
                        sourceText: "",
                        shotBoundary: "",
                        dialogue: "",
                        narration: "",
                        utterances: [],
                        imagePrompt: "",
                        videoPrompt: "walk forward",
                        cameraMotion: "tracking",
                        duration: 5,
                        characterIds: [],
                        propIds: [],
                        clueIds: [],
                        videoUrl: "https://cdn.example.com/shot-one.mp4",
                    },
                ],
            },
        ],
    };
}

describe("buildDramaLabWorkflowReviewInput", () => {
    it("passes a completed shot video as a video review reference", () => {
        const result = buildDramaLabWorkflowReviewInput(project(), ["episode-one"]);
        const task = result.tasks.find((item) => item.id === "shot:shot-one");

        expect(task).toMatchObject({ type: "video", videoUrls: ["https://cdn.example.com/shot-one.mp4"] });
        expect(task?.resultSummary).toContain("已有视频结果");
    });
});
