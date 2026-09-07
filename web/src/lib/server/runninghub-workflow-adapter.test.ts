import { describe, expect, it } from "vitest";

import { demoRunningHubWorkflowCatalog } from "./runninghub-demo-workflow-catalog";
import { prepareRunningHubWorkflowExecution } from "./runninghub-workflow-adapter";

const catalog = demoRunningHubWorkflowCatalog();
const workflow = (code: string) => {
    const value = catalog.find((item) => item.workflowCode === code);
    if (!value) throw new Error(`missing workflow ${code}`);
    return value;
};

describe("RunningHub Demo workflow adapter", () => {
    it("removes the character reference branch when no reference image is supplied", () => {
        const execution = prepareRunningHubWorkflowExecution({ config: workflow("character_main_view"), businessInput: { prompt: "角色", width: 720, height: 1280 }, references: [] });
        const graph = JSON.parse(execution.workflowJsonOverride || "{}");
        expect(graph).not.toHaveProperty("131");
        expect(graph).not.toHaveProperty("147");
        expect(graph).not.toHaveProperty("148");
        expect(graph).not.toHaveProperty("154");
        expect(graph["178"]?.inputs).not.toHaveProperty("image");
        expect(execution.nodeInfoList.map((item) => item.nodeId)).not.toContain("131");
    });

    it("removes the prop reference branch and keeps a supplied reference URL", () => {
        const withoutReference = prepareRunningHubWorkflowExecution({ config: workflow("prop_main_view"), businessInput: { prompt: "道具", width: 1024, height: 1024 }, references: [] });
        const graph = JSON.parse(withoutReference.workflowJsonOverride || "{}");
        expect(graph).not.toHaveProperty("13");
        expect(graph).not.toHaveProperty("68");
        expect(graph["59"]?.inputs?.["images.image_1"]).toBeUndefined();

        const withReference = prepareRunningHubWorkflowExecution({
            config: workflow("prop_main_view"),
            businessInput: { prompt: "道具", width: 1024, height: 1024 },
            references: [{ type: "image", inputKey: "referenceImage", url: "https://fixture/reference.png" }],
        });
        expect(withReference.nodeInfoList).toContainEqual({ nodeId: "13", fieldName: "image", fieldValue: "https://fixture/reference.png" });
        expect(withReference.workflowJsonOverride).toBeUndefined();
    });

    it("requires a scene image, compacts storyboard slots and removes later empty branches", () => {
        expect(() => prepareRunningHubWorkflowExecution({ config: workflow("storyboard_shot"), businessInput: { prompt: "镜头" }, references: [] })).toThrow("sceneImage");
        const execution = prepareRunningHubWorkflowExecution({
            config: workflow("storyboard_shot"),
            businessInput: { prompt: "镜头", width: 1536, height: 864 },
            references: [
                { type: "image", inputKey: "sceneImage", url: "https://fixture/scene.png" },
                { type: "image", inputKey: "characterPropImage1", url: "https://fixture/role.png" },
                { type: "image", inputKey: "characterPropImage3", url: "https://fixture/prop.png" },
            ],
        });
        const graph = JSON.parse(execution.workflowJsonOverride || "{}");
        expect(graph["13"]?.inputs?.image).toBe("https://fixture/scene.png");
        expect(graph["20"]?.inputs?.image).toBe("https://fixture/role.png");
        expect(graph["24"]?.inputs?.image).toBe("https://fixture/prop.png");
        expect(graph).not.toHaveProperty("48");
        expect(execution.resolvedInput).toMatchObject({ characterPropImage1: "https://fixture/role.png", characterPropImage2: "https://fixture/prop.png" });
    });

    it("rounds video duration, derives the audio switch and omits disabled audio", () => {
        const execution = prepareRunningHubWorkflowExecution({
            config: workflow("storyboard_shot_video"),
            businessInput: { image: "https://fixture/image.png", prompt: "推进", duration: 3.2, width: 1280, height: 720, audioEnabled: false, audio: "https://fixture/should-not-send.wav" },
            references: [],
        });
        expect(execution.resolvedInput).toMatchObject({ duration: 4, audioEnabled: false });
        expect(execution.nodeInfoList).toContainEqual({ nodeId: "380", fieldName: "value", fieldValue: false });
        expect(execution.nodeInfoList.map((item) => item.nodeId)).not.toContain("386");
    });

    it("maps non-empty dialogue lines to s1-s10 and leaves pauses out", () => {
        const execution = prepareRunningHubWorkflowExecution({
            config: workflow("storyboard_dialogue_audio"),
            businessInput: {
                text: "第一句\n\n第二句",
                lines: [
                    { text: "第一句", audioUrl: "https://fixture/a.wav", emotion: { happy: 0.8 } },
                    { text: "", audioUrl: "https://fixture/pause.wav" },
                    { text: "第二句", audioUrl: "https://fixture/b.wav", emotion: { sad: 0.4 } },
                ],
            },
            references: [],
        });
        expect(execution.resolvedInput).toMatchObject({ s1_audio: "https://fixture/a.wav", s2_audio: "https://fixture/b.wav", s1_happy: 0.8, s2_sad: 0.4 });
        expect(execution.nodeInfoList).toContainEqual({ nodeId: "83", fieldName: "audio", fieldValue: "https://fixture/a.wav" });
        expect(execution.nodeInfoList).toContainEqual({ nodeId: "84", fieldName: "audio", fieldValue: "https://fixture/b.wav" });
        expect(execution.nodeInfoList).not.toContainEqual(expect.objectContaining({ fieldValue: "https://fixture/pause.wav" }));
    });
});
