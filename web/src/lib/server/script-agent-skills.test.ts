import { describe, expect, it } from "vitest";
import { BUILTIN_SCRIPT_SKILLS, compileScriptAgentInstructions, deriveShortFilmSkillIds, inferShortFilmSkillInput, scriptAgentProfileDefaults } from "./script-agent-skills";

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

    it("provides real short-film skills and composes them from project parameters", () => {
        const ids = deriveShortFilmSkillIds({ carrierType: "vlog", purpose: "place_seeding", viewpoint: "first_person", companions: "friends" });
        expect(ids).toEqual(expect.arrayContaining(["core-short-film", "carrier-vlog", "specialty-three-minute", "purpose-place-seeding", "viewpoint-first-person", "relationship-friends"]));
        const text = compileScriptAgentInstructions("script_writer", ids);
        expect(text).toContain("Vlog 纪实短片");
        expect(text).toContain("地点/景区种草");
        expect(text).toContain("朋友同行");
        expect(inferShortFilmSkillInput("我和两个朋友去游乐园玩，想推荐这个地方")).toEqual({ purpose: "place_seeding", viewpoint: "first_person", companions: "friends" });
        expect(inferShortFilmSkillInput("介绍这款产品，拍成广告")).toMatchObject({ purpose: "product_seeding" });
    });

    it("never exposes a media-generation tool in a default profile", () => {
        const forbidden = /image|video|audio|dubbing|生图|视频生成|配音/i;
        for (const profile of scriptAgentProfileDefaults()) expect(profile.toolAllowlist.join(" ")).not.toMatch(forbidden);
    });
});
