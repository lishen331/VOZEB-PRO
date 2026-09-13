import { describe, expect, it } from "vitest";
import { resolveScriptWorkflowActions } from "./script-workflow-state";

describe("script workflow action state", () => {
    it("only enables planning for an empty short-film project", () => {
        const actions = resolveScriptWorkflowActions("short_story", []);
        expect(actions.find((item) => item.runType === "project_planning")?.enabled).toBe(true);
        expect(actions.filter((item) => item.runType !== "project_planning").every((item) => !item.enabled)).toBe(true);
        expect(actions.find((item) => item.runType === "short_story")?.reason).toContain("确认创作定位");
    });

    it("unlocks each important gate and keeps internal automatic stages out of manual actions", () => {
        const actions = resolveScriptWorkflowActions("short_story", [
            { type: "creative_positioning", status: "confirmed" },
            { type: "short_story", status: "confirmed" },
            { type: "adaptation_strategy", status: "confirmed" },
            { type: "episode_scripts", status: "draft" },
            { type: "review_report", status: "confirmed" },
        ]);
        expect(actions.find((item) => item.runType === "short_story")?.enabled).toBe(true);
        expect(actions.find((item) => item.runType === "adaptation_bundle")?.enabled).toBe(true);
        expect(actions.find((item) => item.runType === "episode_scripts")?.enabled).toBe(true);
        expect(actions.find((item) => item.runType === "director_plan")?.enabled).toBe(true);
        expect(actions.map((item) => item.runType)).not.toEqual(expect.arrayContaining(["script_review", "text_storyboard", "asset_prompts"]));
        expect(actions.find((item) => item.runType === "episode_scripts")?.label).toContain("自动审核");
        expect(actions.find((item) => item.runType === "director_plan")?.label).toContain("完成分镜");
    });
});
