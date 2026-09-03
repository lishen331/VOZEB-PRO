import { describe, expect, it } from "vitest";

import { analyzeRunningHubWorkflowJson } from "./runninghub-workflow-discovery";
import { validateRunningHubWorkflowConfig } from "./runninghub-workflow-domain";

const minimax = {
    workflowType: "MiniMaxH3ReferenceToVideo",
    nodes: {
        "138": { class_type: "TextInput", inputs: { value: "{{prompt}}" } },
        "147": { class_type: "LoadImage", inputs: { image: "默认参考.png" } },
        "148": { class_type: "LoadImage", inputs: { image: "默认参考.png" } },
        "158": { class_type: "LoadImage", inputs: { image: "默认参考.png" } },
        "132": { class_type: "PrimitiveInt", inputs: { value: 10, duration: 10 } },
        "92": { class_type: "SaveVideo", inputs: { video: ["77", 0] } },
    },
};

describe("RunningHub workflow discovery", () => {
    it("recognizes MiniMax prompt, reference images, duration, output and default file warnings", () => {
        const result = analyzeRunningHubWorkflowJson({ workflowId: "2090436199843454978", raw: minimax, capability: "video" });
        expect(result.workflowType).toBe("MiniMaxH3ReferenceToVideo");
        expect(result.nodeCount).toBe(6);
        expect(result.candidates).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ nodeId: "138", fieldName: "value", role: "prompt" }),
                expect.objectContaining({ nodeId: "147", fieldName: "image", role: "image", hasExternalFileDependency: true }),
                expect.objectContaining({ nodeId: "132", fieldName: "duration", role: "duration" }),
                expect.objectContaining({ nodeId: "92", role: "output" }),
            ]),
        );
        expect(result.warnings.some((warning) => warning.includes("默认文件依赖"))).toBe(true);
        expect(result.suggestedOutputs[0]).toMatchObject({ nodeId: "92", assetType: "VIDEO" });
        expect(result.suggestedInputs.filter((item) => item.type === "image")).toHaveLength(3);
        expect(result.suggestedNodeMappings.filter((item) => item.inputKey.startsWith("referenceImage"))).toHaveLength(3);
    });

    it("recognizes Boogu prompt and image candidates without hard-coding universal node ids", () => {
        const result = analyzeRunningHubWorkflowJson({
            workflowId: "2087498214948823042",
            raw: {
                data: {
                    "62": { class_type: "TextEncodeBooguEdit", inputs: { prompt: "{{prompt}}" } },
                    "32": { class_type: "LoadImage", inputs: { image: "a.png" } },
                    "68": { class_type: "LoadImage", inputs: { image: "b.png" } },
                    "44": { class_type: "SaveImage", inputs: { images: ["x", 0] } },
                },
            },
            capability: "image",
        });
        expect(result.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: "62", fieldName: "prompt", role: "prompt" }), expect.objectContaining({ nodeId: "44", role: "output" })]));
        expect(result.suggestedOutputs[0]).toMatchObject({ nodeId: "44", assetType: "IMAGE" });
    });

    it("parses nested JSON string payloads such as RunningHub data.prompt", () => {
        const nodes = {
            "35": { class_type: "TextInput", inputs: { text: "{{prompt}}" } },
            "13": { class_type: "LoadImage", inputs: { image: "reference.png" } },
            "67": { class_type: "SaveImage", inputs: { images: ["13", 0] } },
        };
        const result = analyzeRunningHubWorkflowJson({ workflowId: "2090436220538150914", raw: { code: 0, msg: "SUCCESS", data: { prompt: JSON.stringify(nodes) } }, capability: "image" });
        expect(result.nodeCount).toBe(3);
        expect(result.warnings).not.toContain("未识别到可配置的工作流节点");
        expect(result.candidates).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ nodeId: "35", fieldName: "text", role: "prompt" }),
                expect.objectContaining({ nodeId: "13", fieldName: "image", role: "image", hasExternalFileDependency: true }),
                expect.objectContaining({ nodeId: "67", role: "output" }),
            ]),
        );
        expect(result.suggestedOutputs[0]).toMatchObject({ nodeId: "67", assetType: "IMAGE" });
    });

    it("keeps template placeholders and numeric-looking strings untouched while unwrapping", () => {
        const result = analyzeRunningHubWorkflowJson({ workflowId: "wf", raw: { data: { prompt: JSON.stringify({ "1": { class_type: "TextInput", inputs: { text: "{{prompt}}", steps: "20" } } }) } }, capability: "image" });
        expect(result.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ fieldName: "text", role: "prompt", defaultValue: "{{prompt}}" })]));
        expect(result.candidates.find((item) => item.fieldName === "steps")).toBeUndefined();
    });

    it("does not silently map ambiguous prompts and never returns secrets", () => {
        const result = analyzeRunningHubWorkflowJson({ workflowId: "wf", raw: { "1": { class_type: "TextInput", inputs: { prompt: "one", text: "two", value: "example-placeholder-value", apiKey: "secret" } } }, capability: "text" });
        expect(result.suggestedNodeMappings.filter((item) => item.inputKey === "prompt")).toHaveLength(0);
        expect(result.warnings.some((warning) => warning.includes("多个提示词"))).toBe(true);
        expect(JSON.stringify(result)).not.toContain("secret");
    });

    it("keeps nodes without writable semantic fields as low-confidence unknown candidates", () => {
        const result = analyzeRunningHubWorkflowJson({ workflowId: "wf", raw: { "999": { class_type: "CustomNode", inputs: { upstream: ["1", 0] } } }, capability: "image" });
        expect(result.candidates).toEqual([expect.objectContaining({ nodeId: "999", role: "unknown", confidence: "low" })]);
    });

    it("preserves enum arrays and redacts sensitive defaults", () => {
        const result = analyzeRunningHubWorkflowJson({ workflowId: "wf", raw: { "1": { class_type: "Control", inputs: { quality: ["low", "high"], apiKey: "secret" } } }, capability: "image" });
        expect(result.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ fieldName: "quality", role: "enum" })]));
        expect(JSON.stringify(result)).not.toContain("secret");
    });

    it("produces unique input keys and options so a multi-parameter workflow passes save validation", () => {
        const nodes = {
            "35": { class_type: "TextInput", inputs: { text: "{{prompt}}" } },
            "13": { class_type: "LoadImage", inputs: { image: "ref.png" } },
            "40": { class_type: "KSampler", inputs: { steps: 20, cfg: 7.5, seed: 12345, denoise: 1 } },
            "41": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024 } },
            "50": { class_type: "Control", inputs: { quality: ["low", "high"], mode: ["a", "b"] } },
            "51": { class_type: "Toggle", inputs: { enableUpscale: true, enableFix: false } },
            "67": { class_type: "SaveImage", inputs: { images: ["13", 0] } },
        };
        const result = analyzeRunningHubWorkflowJson({ workflowId: "2090436220538150914", raw: { code: 0, data: { prompt: JSON.stringify(nodes) } }, capability: "image" });

        const inputKeys = result.suggestedInputs.map((item) => item.key);
        expect(new Set(inputKeys).size).toBe(inputKeys.length);
        const mappingKeys = result.suggestedNodeMappings.map((item) => item.paramKey);
        expect(new Set(mappingKeys).size).toBe(mappingKeys.length);
        for (const field of result.suggestedInputs) {
            if (field.type === "enum") expect(field.options && field.options.length).toBeTruthy();
        }

        const errors = validateRunningHubWorkflowConfig({
            workflowKey: "wf-1",
            workflowName: "多参数工作流",
            channelId: "rh",
            workflowId: "2090436220538150914",
            providerType: "runninghub",
            businessCode: "storyboard-image",
            capability: "image",
            createPath: "/task/openapi/create",
            queryPath: "/openapi/v2/query",
            taskIdField: "data.taskId",
            statusField: "data.status",
            resultField: "data.result",
            requestTemplate: "{}",
            version: 1,
            inputSchema: result.suggestedInputs,
            nodeMappings: result.suggestedNodeMappings,
            outputMappings: result.suggestedOutputs,
        });
        expect(errors).toEqual([]);
    });

    it("drops internal sampler knobs from suggested inputs while keeping semantic entries and business selectors", () => {
        const nodes = {
            "35": { class_type: "TextInput", inputs: { text: "{{prompt}}" } },
            "13": { class_type: "LoadImage", inputs: { image: "ref.png" } },
            "40": { class_type: "KSampler", inputs: { steps: 20, cfg: 7.5, seed: 12345, denoise: 1, sampler_name: ["euler", "dpmpp"] } },
            "45": { class_type: "ImageScale", inputs: { megapixels: 1, bit_depth: 8, strength_model: 0.6 } },
            "50": { class_type: "AspectRatio", inputs: { aspect_ratio: ["16:9", "9:16", "1:1"] } },
            "51": { class_type: "Quality", inputs: { quality: ["low", "high"] } },
            "67": { class_type: "SaveImage", inputs: { images: ["13", 0] } },
        };
        const result = analyzeRunningHubWorkflowJson({ workflowId: "2090436220538150914", raw: { code: 0, data: { prompt: JSON.stringify(nodes) } }, capability: "image" });

        const mappedFields = result.suggestedNodeMappings.map((item) => item.fieldName);
        // internal, already-tuned workflow knobs must never become business inputs
        expect(mappedFields.some((field) => /steps|cfg|seed|denoise|sampler|megapixel|bit_depth|strength/i.test(field))).toBe(false);
        // semantic entries and genuine business selectors are still surfaced
        expect(mappedFields).toEqual(expect.arrayContaining(["text", "image", "aspect_ratio", "quality"]));
        const enums = result.suggestedInputs.filter((item) => item.type === "enum");
        expect(enums.map((item) => item.options?.length ?? 0).every((length) => length > 0)).toBe(true);
        // discovery still records the dropped knobs as candidates so an admin can opt one in manually
        expect(result.candidates.some((item) => item.fieldName === "steps")).toBe(true);
    });

    it("does not treat size/dimension fields as reference files even when the name contains image/video", () => {
        const nodes = {
            "138": { class_type: "TextInput", inputs: { value: "{{prompt}}" } },
            "147": { class_type: "LoadImage", inputs: { image: "分镜_02.png" } },
            "148": { class_type: "LoadImage", inputs: { image: "分镜_03.png" } },
            "158": { class_type: "LoadImage", inputs: { image: "分镜_04.png" } },
            // ref_image_size 名字里带 image，但值是设置项（"match"），是尺寸旋钮而非参考图
            "136": { class_type: "MiniMaxH3ReferenceToVideo", inputs: { ref_image_size: "match" } },
            "92": { class_type: "SaveVideo", inputs: { video: ["77", 0] } },
        };
        const result = analyzeRunningHubWorkflowJson({ workflowId: "2090436199843454978", raw: { code: 0, data: { prompt: JSON.stringify(nodes) } }, capability: "video" });

        // exactly the three real LoadImage nodes become reference images — not the size knob
        expect(result.suggestedInputs.filter((item) => item.type === "image")).toHaveLength(3);
        const imageMappingNodeIds = result.suggestedNodeMappings.filter((item) => item.paramKey.startsWith("referenceImage")).map((item) => item.nodeId);
        expect(imageMappingNodeIds.sort()).toEqual(["147", "148", "158"]);
        expect(imageMappingNodeIds).not.toContain("136");
        // the size knob named ref_image_size must never be surfaced as a file input
        expect(result.suggestedNodeMappings.some((item) => item.fieldName === "ref_image_size")).toBe(false);
    });
});
