import { describe, expect, it } from "vitest";

import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { findAffectedShots, findAffectedShotsInEpisode, shotReferencesAsset } from "./affected-shots";

/**
 * 基线：L 的 getCharAffectedStoryboards / getPropAffectedStoryboards /
 * getSceneAffectedStoryboards（FilmCreate.vue 资产卡「影响的分镜」）。
 *
 * 真实行为测试：判定字段搞错会直接算出不同的分镜集合。
 */
function shot(extra: Partial<DramaShot> = {}): DramaShot {
    return {
        id: "s1",
        order: 1,
        title: "镜头",
        description: "",
        sourceText: "",
        shotBoundary: "",
        dialogue: "",
        narration: "",
        utterances: [],
        imagePrompt: "",
        videoPrompt: "",
        cameraMotion: "",
        duration: 3,
        characterIds: [],
        propIds: [],
        clueIds: [],
        ...extra,
    } as DramaShot;
}

function episode(shots: DramaShot[], id = "e1"): DramaEpisode {
    return { id, title: "第 1 集", script: "", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots } as DramaEpisode;
}

function project(episodes: DramaEpisode[]): DramaProject {
    return { id: "p1", title: "项目", characters: [], scenes: [], props: [], clues: [], episodes } as unknown as DramaProject;
}

describe("findAffectedShots (L affected-storyboards parity)", () => {
    it("matches characters by characterIds", () => {
        const found = findAffectedShots(project([episode([shot({ id: "a", characterIds: ["c1"] }), shot({ id: "b", characterIds: ["c2"] })])]), "characters", "c1");
        expect(found.map((item) => item.shot.id)).toEqual(["a"]);
    });

    it("matches props by propIds", () => {
        const found = findAffectedShots(project([episode([shot({ id: "a", propIds: ["p1", "p2"] }), shot({ id: "b" })])]), "props", "p2");
        expect(found.map((item) => item.shot.id)).toEqual(["a"]);
    });

    it("matches scenes by the single sceneId field, not a list", () => {
        const found = findAffectedShots(project([episode([shot({ id: "a", sceneId: "sc1" }), shot({ id: "b", sceneId: "sc2" })])]), "scenes", "sc1");
        expect(found.map((item) => item.shot.id)).toEqual(["a"]);
    });

    it("does not confuse a character id with a prop id", () => {
        const input = project([episode([shot({ id: "a", characterIds: ["x1"] })])]);
        expect(findAffectedShots(input, "props", "x1")).toEqual([]);
        expect(findAffectedShots(input, "scenes", "x1")).toEqual([]);
    });

    it("numbers shots from 1 for L's #N label", () => {
        const found = findAffectedShots(project([episode([shot({ id: "a" }), shot({ id: "b", characterIds: ["c1"] }), shot({ id: "c", characterIds: ["c1"] })])]), "characters", "c1");
        expect(found.map((item) => item.index)).toEqual([2, 3]);
    });

    it("spans every episode and reports which one each shot came from", () => {
        const found = findAffectedShots(project([episode([shot({ id: "a", characterIds: ["c1"] })], "e1"), episode([shot({ id: "b", characterIds: ["c1"] })], "e2")]), "characters", "c1");
        expect(found.map((item) => item.episodeId)).toEqual(["e1", "e2"]);
    });

    it("returns nothing for a blank asset id instead of matching everything", () => {
        expect(findAffectedShots(project([episode([shot({ sceneId: "" })])]), "scenes", "   ")).toEqual([]);
    });

    it("scopes to one episode when asked", () => {
        const target = episode([shot({ id: "a", characterIds: ["c1"] })], "e1");
        const other = episode([shot({ id: "b", characterIds: ["c1"] })], "e2");
        const found = findAffectedShotsInEpisode(target, "characters", "c1");
        expect(found.map((item) => item.shot.id)).toEqual(["a"]);
        expect(findAffectedShotsInEpisode(other, "characters", "c1").map((item) => item.shot.id)).toEqual(["b"]);
    });

    it("exposes the single-shot predicate for reuse", () => {
        expect(shotReferencesAsset(shot({ characterIds: ["c1"] }), "characters", "c1")).toBe(true);
        expect(shotReferencesAsset(shot(), "characters", "c1")).toBe(false);
    });
});
