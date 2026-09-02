import { describe, expect, it } from "vitest";

import { analyzeRunningHubWorkflowJson } from "./runninghub-workflow-discovery";

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

    it("does not silently map ambiguous prompts and never returns secrets", () => {
        const result = analyzeRunningHubWorkflowJson({ workflowId: "wf", raw: { "1": { class_type: "TextInput", inputs: { prompt: "one", text: "two", apiKey: "secret" } } }, capability: "text" });
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
});
