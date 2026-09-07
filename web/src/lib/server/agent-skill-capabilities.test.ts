import { describe, expect, it } from "vitest";
import { assertAgentPlanSkillCompatibility, defaultSkillCapabilities, type AgentSkillCapability } from "./agent-skill-capabilities";

describe("agent skill capability contract", () => {
    it("accepts a skill that explicitly supports text plus image to image", () => {
        const skills: Array<{ capabilities: AgentSkillCapability[] }> = [{ capabilities: [{ inputs: ["text", "image"], outputs: ["image"] }] }];
        expect(() => assertAgentPlanSkillCompatibility({ deliverables: [{ type: "image", title: "商品图", prompt: "生成商品图" }] }, skills, ["image"])).not.toThrow();
    });

    it("rejects a video plan for an image-only skill", () => {
        const skills: Array<{ capabilities: AgentSkillCapability[] }> = [{ capabilities: [{ inputs: ["text"], outputs: ["image"] }] }];
        expect(() => assertAgentPlanSkillCompatibility({ deliverables: [{ type: "video", title: "商品视频", prompt: "生成商品视频" }] }, skills, [])).toThrow("Skill 不支持当前输入与输出组合");
    });

    it("derives conservative defaults for legacy image and video skills", () => {
        expect(defaultSkillCapabilities(["image"])).toEqual(expect.arrayContaining([{ inputs: ["text"], outputs: ["image"] }]));
        expect(defaultSkillCapabilities(["video"])).toEqual(expect.arrayContaining([{ inputs: ["text"], outputs: ["video"] }]));
    });

    it("preserves explicit text output for multimodal analysis skills", () => {
        const skills: Array<{ capabilities: AgentSkillCapability[] }> = [{ capabilities: [{ inputs: ["image", "text"], outputs: ["text"] }] }];
        expect(() => assertAgentPlanSkillCompatibility({ deliverables: [{ type: "text", title: "诊断", prompt: "解释失败原因" }] }, skills, ["image"])).not.toThrow();
    });
});
