import { describe, expect, it } from "vitest";
import { buildPracticeReversePromptInstruction, parsePracticeReversePrompt } from "./practice-reverse-prompt";

describe("practice reverse prompt contract", () => {
    it("keeps fixed structure separate from the analysis focus", () => {
        const instruction = buildPracticeReversePromptInstruction("重点看三视图布局");
        expect(instruction).toContain('"fullPrompt"');
        expect(instruction).toContain('"observation"');
        expect(instruction).toContain("重点看三视图布局");
    });

    it("reads the sections and reusable prompt from fenced JSON", () => {
        const raw = "以下是拆解：\n```json\n" + JSON.stringify({ sections: { subject: { observation: "橘白色的猫", phrase: "保持橘白色毛发" }, composition: { phrase: "正面、侧面、背面" } }, fullPrompt: " 画一张橘白猫三视图。 " }) + "\n```";
        expect(parsePracticeReversePrompt(raw)).toEqual({
            sections: [
                { id: "subject", observation: "橘白色的猫", phrase: "保持橘白色毛发" },
                { id: "composition", observation: "", phrase: "正面、侧面、背面" },
            ],
            fullPrompt: "画一张橘白猫三视图。",
        });
    });

    it("supports old plaintext but never feeds JSON-shaped garbage into generation", () => {
        expect(parsePracticeReversePrompt("一只猫，三视图。")).toEqual({ sections: [], fullPrompt: "一只猫，三视图。" });
        for (const raw of ["```json\n{bad\n```", '{"sections":{}}', "   "]) expect(parsePracticeReversePrompt(raw).fullPrompt).toBe("");
    });
});
