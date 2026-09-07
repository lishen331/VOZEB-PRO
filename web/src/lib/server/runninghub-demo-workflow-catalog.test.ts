import { describe, expect, it } from "vitest";

import { demoRunningHubWorkflowCatalog } from "./runninghub-demo-workflow-catalog";

describe("RunningHub Demo workflow catalog", () => {
    it("contains the seven verified workflow codes and IDs", () => {
        expect(demoRunningHubWorkflowCatalog().map((item) => item.workflowCode)).toEqual(["character_main_view", "scene_main_view", "prop_main_view", "character_multi_view", "storyboard_shot", "storyboard_dialogue_audio", "storyboard_shot_video"]);
        expect(demoRunningHubWorkflowCatalog().find((item) => item.workflowCode === "storyboard_shot_video")).toMatchObject({
            workflowId: "2079446871415808002",
            adapterType: "storyboard-shot-video",
            capability: "video",
        });
    });

    it("keeps complete Demo execution metadata without secrets", () => {
        const catalog = demoRunningHubWorkflowCatalog();
        expect(catalog).toHaveLength(7);
        for (const workflow of catalog) {
            expect(workflow.workflowApiJson).toEqual(expect.any(String));
            expect(workflow.inputSchema.length).toBeGreaterThan(0);
            expect(workflow.nodeMappings.length).toBeGreaterThan(0);
            expect(workflow.outputMappings.length).toBeGreaterThan(0);
            expect(workflow.source).toBe("server-dev:aigc_ai_dev");
            expect(workflow.sourceVersion).toBe("server-dev-runninghub-main-verified-20260903-0115");
            expect(JSON.stringify(workflow)).not.toContain("c067");
            expect(JSON.stringify(workflow)).not.toContain("apiKey");
        }
    });
});
