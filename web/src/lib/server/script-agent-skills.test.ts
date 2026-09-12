import { describe, expect, it } from "vitest";
import { BUILTIN_SCRIPT_SKILLS, compileScriptAgentInstructions, scriptAgentProfileDefaults } from "./script-agent-skills";

describe("screenwriter Agent skills", () => {
    it("provides one original core skill for every Agent", () => {
        for (const profile of scriptAgentProfileDefaults()) {
            const skills = BUILTIN_SCRIPT_SKILLS.filter((skill) => profile.skillBindings.includes(skill.id));
            expect(skills.length).toBeGreaterThan(0);
            expect(skills.every((skill) => skill.markdown.length > 120)).toBe(true);
        }
    });

    it("composes core, explicitly selected genre, carrier and specialty skills", () => {
        const text = compileScriptAgentInstructions("script_writer", ["genre-rebirth-revenge", "carrier-vertical-short", "specialty-ending-hook"]);
        expect(text).toContain("分集剧本");
        expect(text).toContain("重生复仇");
        expect(text).toContain("竖屏微短剧");
        expect(text).toContain("结尾钩子");
    });

    it("never exposes a media-generation tool in a default profile", () => {
        const forbidden = /image|video|audio|dubbing|生图|视频生成|配音/i;
        for (const profile of scriptAgentProfileDefaults()) expect(profile.toolAllowlist.join(" ")).not.toMatch(forbidden);
    });
});
