import { describe, expect, it } from "vitest";

import { dramaLabShotPrompt, dramaLabShotReferenceImages } from "./drama-lab-visual-assets-panel";
import type { Project, Shot } from "./drama-workflow-lab-project-complete";

describe("drama lab visual assets", () => {
    it("passes scene, character, and prop primary images to a storyboard image task", () => {
        const project = {
            id: "project-1",
            title: "测试项目",
            style: "电影感",
            aspectRatio: "9:16",
            episodes: [],
            characters: [{ id: "character-1", name: "林夏", description: "红色风衣", references: [{ id: "character-old", url: "/api/reference-assets/character-old.png", source: "upload", label: "旧图", createdAt: "2026-08-21T00:00:00.000Z" }, { id: "character-main", url: "/api/reference-assets/character-main.png", source: "generated", label: "角色主图", createdAt: "2026-08-21T00:00:00.000Z" }], primaryReferenceId: "character-main" }],
            scenes: [{ id: "scene-1", name: "旧仓库", location: "旧仓库", description: "雨夜", references: [{ id: "scene-main", url: "/api/reference-assets/scene-main.png", source: "upload", label: "场景主图", createdAt: "2026-08-21T00:00:00.000Z" }] }],
            props: [{ id: "prop-1", name: "旧手机", description: "裂屏", references: [{ id: "prop-main", url: "/api/reference-assets/prop-main.png", source: "library", label: "道具主图", createdAt: "2026-08-21T00:00:00.000Z" }] }],
            shots: [],
        } as Project;
        const shot = { id: "shot-1", episodeId: "episode-1", shotNumber: 1, script: "林夏拿起旧手机", characterIds: ["character-1"], propIds: ["prop-1"], sceneId: "scene-1", duration: 3, status: "draft" } as Shot;

        expect(dramaLabShotReferenceImages(project, shot)).toMatchObject([
            { id: "scene-main", serverUrl: "/api/reference-assets/scene-main.png" },
            { id: "character-main", serverUrl: "/api/reference-assets/character-main.png" },
            { id: "prop-main", serverUrl: "/api/reference-assets/prop-main.png" },
        ]);
        expect(dramaLabShotPrompt(project, shot)).toContain("道具设定：旧手机 裂屏");
    });
});
