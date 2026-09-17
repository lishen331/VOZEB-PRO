import { describe, expect, it } from "vitest";
import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { buildOneClickUniversalPromptRequest } from "./universal-prompt-service";
import systemPrompts from "./universal-prompt-l-system.json";
const project = {
    style: "写实",
    ratio: "16:9",
    characters: [{ id: "c1", name: "林薇", description: "", referenceImageUrl: "char" }],
    scenes: [{ id: "s1", name: "湖边", description: "", referenceImageUrl: "scene" }],
    props: [{ id: "p1", name: "手提箱", description: "", referenceImageUrl: "prop" }],
    episodes: [{ id: "e1", script: "剧本内容", shots: [{ id: "shot1" }] }],
} as unknown as Pick<DramaProject, "style" | "ratio" | "characters" | "scenes" | "props" | "episodes">;
const shot = {
    id: "shot1",
    title: "夜路",
    description: "走路",
    location: "湖边",
    time: "夜",
    action: "前行",
    dialogue: "你好",
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
    universalSegmentText: "",
} as unknown as DramaShot;
describe("one-click universal prompt request payload", () => {
    it("generate mode: uses L system prompt verbatim and full field bundle, no draft field", () => {
        const request = buildOneClickUniversalPromptRequest({ project, shot }, { mode: "generate" });
        expect(request.systemPrompt).toBe(systemPrompts.getUniversalOmniSegmentPrompt);
        const body = JSON.parse(request.userPrompt);
        expect(body.TOTAL_CLIP_SECONDS).toBe(5);
        expect(body.LINE3_REQUIRED).toBe(systemPrompts.line3);
        expect(body.IMAGE_SLOT_MAP).toEqual(request.references);
        expect(body.IMAGE_SLOT_MAP.map((item: { slot: string }) => item.slot)).toEqual(["@图片1", "@图片2", "@图片3"]);
        expect(body.SHOT_FIELDS).toMatchObject({ TITLE: "夜路", DIALOGUE: "你好", NARRATION: "旁白" });
        expect(body.EPISODE_SCRIPT).toBe("剧本内容");
        expect(body.CURRENT_UNIVERSAL_SEGMENT).toBe("");
        expect(request.systemContract).toBe("L_UNIVERSAL_SEGMENT_PROMPT_V1");
    });
    it("polish mode: appends L polish suffix and forwards the current draft verbatim", () => {
        const request = buildOneClickUniversalPromptRequest({ project, shot, draft: "当前草稿全文" }, { mode: "polish" });
        expect(request.systemPrompt).toBe(`${systemPrompts.getUniversalOmniSegmentPrompt}\n\n${systemPrompts.polishSuffix}`);
        const body = JSON.parse(request.userPrompt);
        expect(body.CURRENT_UNIVERSAL_SEGMENT).toBe("当前草稿全文");
    });
    it("force_without_reference_images is forwarded exactly as requested", () => {
        const request = buildOneClickUniversalPromptRequest({ project, shot, forceWithoutReferenceImages: true }, { mode: "generate" });
        const body = JSON.parse(request.userPrompt);
        expect(body.FORCE_WITHOUT_REFERENCE_IMAGES).toBe(true);
    });
});
