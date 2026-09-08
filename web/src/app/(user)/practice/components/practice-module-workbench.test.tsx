import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { IpReference } from "@/lib/ip-library-domain";
import { PRACTICE_MODULES, buildPracticeSessionInput, editablePracticeTextReducer, practiceSessionPath, publicPracticeResult } from "./practice-module-workbench";
import { buildStoryboardImageReferences } from "./practice-storyboard-image-panel";
import { buildStoryboardVideoReferences } from "./practice-storyboard-video-panel";
import { normalizePracticeDialogueLines } from "./practice-dubbing-panel";
import { workflowFieldDefaults, workflowFormFields } from "./practice-panel-types";

describe("practice module workbench contract", () => {
    it("sends only user content, public references and a fresh request id", () => {
        const input = buildPracticeSessionInput("script", "一场雨中的重逢", ["asset-1"]);
        expect(input).toMatchObject({ module: "script", title: "单项练习", input: { prompt: "一场雨中的重逢" }, references: [{ type: "asset", id: "asset-1" }] });
        expect(input.clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
        expect(JSON.stringify(input)).not.toMatch(/provider|model|points|executionProfile|channel/i);
    });

    it("submits stable child IP references together with ordinary asset references", () => {
        const reference: IpReference = { type: "ip", id: "ip-one", subIpId: "child-two", itemIds: ["item-three"] };

        expect(buildPracticeSessionInput("music", "雨夜配乐", ["asset-1"], [reference]).references).toEqual([{ type: "asset", id: "asset-1" }, reference]);
    });

    it("keeps the IP picker code dormant behind the shared entry flag", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/components/practice-storyboard-image-panel.tsx"), "utf8");

        expect(source).toContain("IP_REFERENCE_ENTRY_VISIBLE ? <IpReferencePicker");
        expect(source).toContain("<IpReferencePicker");
    });

    it("keeps public result metadata free of task and provider details", () => {
        expect(publicPracticeResult({ status: "success", taskId: "secret-task", model: "secret-model", result: { content: "完成" } })).toEqual({ status: "success", text: "完成" });
        expect(publicPracticeResult({ status: "error", taskId: "secret-task", error: "失败" })).toEqual({ status: "error", error: "失败" });
    });

    it("keeps all six modules in the same workbench contract", () => {
        expect(PRACTICE_MODULES).toHaveLength(6);
    });

    it("routes asset modules to their dedicated panels", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/components/practice-module-workbench.tsx"), "utf8");
        expect(source).toContain("PracticeCharacterPanel");
        expect(source).toContain("PracticeScenePanel");
        expect(source).toContain("PracticePropPanel");
    });

    it("maps storyboard assets to the Demo input slots", () => {
        expect(buildStoryboardImageReferences("scene", ["character", "prop", "extra"])).toEqual([
            { type: "asset", id: "scene", inputKey: "sceneImage" },
            { type: "asset", id: "character", inputKey: "characterPropImage1" },
            { type: "asset", id: "prop", inputKey: "characterPropImage2" },
            { type: "asset", id: "extra", inputKey: "characterPropImage3" },
        ]);
    });

    it("keeps video audio toggle and dialogue pauses out of workflow slots", () => {
        expect(buildStoryboardVideoReferences("image", true, "audio")).toEqual([
            { type: "asset", id: "image", inputKey: "image" },
            { type: "asset", id: "audio", inputKey: "audio" },
        ]);
        expect(normalizePracticeDialogueLines([{ text: "第一句" }, { text: "-0.8s-" }, { text: "第二句", audio: "voice" }])).toEqual([{ text: "第一句" }, { text: "第二句", audio: "voice" }]);
    });

    it("renders required dimensions and character multi-view direction fields from the public capability", () => {
        const capability = {
            module: "character",
            mode: "workflow",
            available: true,
            models: [],
            outputType: "image",
            inputSchema: [
                { key: "prompt", label: "描述", type: "textarea", required: true },
                { key: "width", label: "宽", type: "number", required: true, defaultValue: 720 },
                { key: "height", label: "高", type: "number", required: true, defaultValue: 1280 },
                { key: "frontPrompt", label: "正视图", type: "text", required: false },
            ],
        } as const;
        expect(workflowFieldDefaults(capability as never)).toMatchObject({ width: 720, height: 1280 });
        expect(workflowFormFields(capability as never).map((field) => field.key)).toEqual(["width", "height", "frontPrompt"]);
        expect(workflowFormFields({ ...capability, inputSchema: [...capability.inputSchema, { key: "duration", label: "时长", type: "number", required: false }] } as never).map((field) => field.key)).not.toContain("duration");
    });

    it("keeps internal dialogue slots out of public form defaults", () => {
        const capability = {
            inputSchema: [
                { key: "s1_happy", label: "开心", type: "number", required: false, defaultValue: 0 },
                { key: "duration", label: "时长", type: "number", required: false, defaultValue: 6 },
            ],
        } as never;
        expect(workflowFieldDefaults(capability)).toEqual({ duration: 6 });
    });

    it("exposes emotion controls for structured dialogue lines", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/components/practice-dubbing-panel.tsx"), "utf8");
        expect(source).toContain("Slider");
        expect(source).toContain("happy");
        expect(source).toContain("surprise");
    });

    it("preserves reference context while attaching a created session to the URL", () => {
        expect(practiceSessionPath("storyboard-image", new URLSearchParams("ipId=ip-one&subIpId=child-one"), "session-one")).toBe("/practice/storyboard-image?ipId=ip-one&subIpId=child-one&sessionId=session-one");
    });

    it("keeps generated script text editable until another result is selected", () => {
        expect(editablePracticeTextReducer("初稿", { type: "edit", value: "人工修改稿" })).toBe("人工修改稿");
        expect(editablePracticeTextReducer("人工修改稿", { type: "replace", value: "另一份结果" })).toBe("另一份结果");
    });

    it("wires history retry actions, including cancelled sessions, back to the API", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/components/practice-module-workbench.tsx"), "utf8");

        expect(source).toContain("practiceSessionCanRetry(target)");
        expect(source).toContain("onRetry={(session) => void retry(session)}");
    });
});

it("isolates character schemas, dimensions and public defaults by selected workflow", async () => {
    const { capabilityForWorkflow } = await import("./practice-panel-types");
    const capability = {
        module: "character",
        available: true,
        models: [],
        inputSchema: [],
        workflowOptions: [
            { code: "character_main_view", label: "主形象", inputSchema: [{ key: "width", label: "宽", type: "number", required: true, defaultValue: 720 }] },
            {
                code: "character_multi_view",
                label: "多视图",
                inputSchema: [
                    { key: "width", label: "合并图宽", type: "number", required: false, defaultValue: 1350 },
                    { key: "frontPrompt", label: "正视图", type: "text", required: false },
                ],
            },
        ],
    } as never;
    const main = capabilityForWorkflow(capability, "character_main_view");
    const multi = capabilityForWorkflow(capability, "character_multi_view");
    expect(workflowFieldDefaults(main)).toEqual({ width: 720 });
    expect(workflowFieldDefaults(multi)).toEqual({ width: 1350 });
    expect(workflowFormFields(main).map((field) => field.key)).not.toContain("frontPrompt");
    expect(workflowFormFields(multi).map((field) => field.key)).toContain("frontPrompt");
});
