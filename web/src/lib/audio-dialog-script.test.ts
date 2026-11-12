import { describe, expect, it } from "vitest";

import { DIALOG_LIMITS, dialogRoles, detectDialogScript, parseDialogScript, validateDialog } from "./audio-dialog-script";

describe("dialog script parsing", () => {
    it("splits lines on Chinese and ASCII colons", () => {
        const lines = parseDialogScript("小美：哥哥你回来啦！\n阿强: 嗯，路上堵车。\n小美：快过来抱抱");
        expect(lines).toEqual([
            { role: "小美", text: "哥哥你回来啦！" },
            { role: "阿强", text: "嗯，路上堵车。" },
            { role: "小美", text: "快过来抱抱" },
        ]);
        expect(dialogRoles(lines)).toEqual(["小美", "阿强"]);
    });

    it("ignores lines without a speaker or with an empty line body", () => {
        expect(parseDialogScript("普通的一句话\n注意：明天下雨\n小美：\n")).toEqual([{ role: "注意", text: "明天下雨" }]);
    });

    it("ignores prefixes longer than 8 characters", () => {
        expect(parseDialogScript("这是一个很长的角色名字啦：台词")).toEqual([]);
    });

    it("truncates each line to the per-line limit", () => {
        const lines = parseDialogScript(`小美：${"字".repeat(DIALOG_LIMITS.maxCharsPerLine + 50)}`);
        expect(lines[0].text).toHaveLength(DIALOG_LIMITS.maxCharsPerLine);
    });
});

describe("dialog validation", () => {
    const lines = parseDialogScript("小美：你好\n阿强：你好");

    it("accepts two roles that each have a voice", () => {
        expect(validateDialog(lines, { 小美: { voice: "longanhuan_v3.1" }, 阿强: { voice: "longlaotie_v3.1" } })).toBeNull();
    });

    it("rejects a single role", () => {
        expect(validateDialog(parseDialogScript("小美：你好\n小美：再见"), { 小美: { voice: "v" } })).toContain("至少要 2 个角色");
    });

    it("rejects a role without a voice", () => {
        expect(validateDialog(lines, { 小美: { voice: "v" } })).toContain("阿强");
    });

    it("rejects too many roles", () => {
        const many = Array.from({ length: DIALOG_LIMITS.maxRoles + 1 }, (_, i) => `角色${i}：你好`).join("\n");
        expect(validateDialog(parseDialogScript(many), {})).toContain("最多");
    });
});

describe("detectDialogScript", () => {
    const twoRoles = ["小美：你好", "阿强：你好"].join("\n");
    const oneRole = ["小美：你好", "小美：再见"].join("\n");

    it("suggests dialogue mode once two roles appear", () => {
        expect(detectDialogScript(twoRoles).suggested).toBe(true);
        expect(detectDialogScript(oneRole).suggested).toBe(false);
        expect(detectDialogScript("普通的一句话").suggested).toBe(false);
    });
});
