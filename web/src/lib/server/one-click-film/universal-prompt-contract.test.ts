import { describe, expect, it } from "vitest";
import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { buildOneClickUniversalPromptInput } from "./universal-prompt-contract";
const project = {
    style: "写实",
    ratio: "16:9",
    characters: [{ id: "c1", name: "林薇", description: "", referenceImageUrl: "char" }],
    scenes: [{ id: "s1", name: "湖边", description: "", referenceImageUrl: "scene" }],
    props: [{ id: "p1", name: "手提箱", description: "", referenceImageUrl: "prop" }],
    episodes: [{ id: "e1", script: "剧本", shots: [{ id: "shot1" }] }],
} as unknown as Pick<DramaProject, "style" | "ratio" | "characters" | "scenes" | "props" | "episodes">;
const shot = {
    id: "shot1",
    title: "夜路",
    description: "走路",
    location: "湖边",
    time: "夜",
    action: "前行",
    dialogue: "",
    narration: "旁白",
    result: "抵达",
    atmosphere: "冷",
    imagePrompt: "img",
    polishedPrompt: "polished",
    videoPrompt: "video",
    shotType: "中景",
    cameraAngle: "平视",
    angleH: "",
    angleV: "",
    angleS: "",
    cameraMotion: "跟拍",
    lightingStyle: "冷光",
    depthOfField: "浅",
    duration: 5,
    sceneId: "s1",
    characterIds: ["c1"],
    propIds: ["p1"],
    universalSegmentText: "draft",
} as unknown as DramaShot;
describe("one-click universal prompt contract", () => {
    it("keeps L field contract and reference order", () => {
        const result = buildOneClickUniversalPromptInput({ project, shot, draft: "当前草稿", forceWithoutReferenceImages: true });
        expect(result.systemContract).toBe("L_UNIVERSAL_SEGMENT_PROMPT_V1");
        expect(result.fields).toMatchObject({ TITLE: "夜路", PROJECT_STYLE: "写实", ASPECT_RATIO: "16:9", CURRENT_UNIVERSAL_SEGMENT: "当前草稿", FORCE_WITHOUT_REFERENCE_IMAGES: true });
        expect(result.references.filter((item): item is Exclude<typeof item, null> => item !== null).map((item) => item.slot)).toEqual(["@图片1", "@图片2", "@图片3"]);
    });
});
