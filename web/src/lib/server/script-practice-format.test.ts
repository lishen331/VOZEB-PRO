import { describe, expect, it } from "vitest";
import { normalizeScriptDocument, parseFdx, parseFountain, serializeFdx, serializeFountain, serializePlainText } from "./script-practice-format";

describe("script practice format", () => {
    it("keeps supported blocks and drops invalid blocks", () => {
        const result = normalizeScriptDocument({
            blocks: [
                { id: "s1", type: "scene-heading", text: " INT. STATION - NIGHT " },
                { id: "a1", type: "action", text: "林默走进车站。" },
                { id: "bad", type: "unknown", text: "不应保留" },
            ],
        });
        expect(result.blocks).toEqual([
            { id: "s1", type: "scene-heading", text: "INT. STATION - NIGHT" },
            { id: "a1", type: "action", text: "林默走进车站。" },
        ]);
        expect(result.schemaVersion).toBe(1);
    });
    it("parses and round-trips Fountain", () => {
        const doc = parseFountain("INT. STATION - NIGHT\n\n林默走进车站。\n\n林默\n(低声)\n我们到了。\n\nCUT TO:");
        expect(doc.blocks.map(({ type, text }) => ({ type, text }))).toEqual([
            { type: "scene-heading", text: "INT. STATION - NIGHT" },
            { type: "action", text: "林默走进车站。" },
            { type: "character", text: "林默" },
            { type: "parenthetical", text: "(低声)" },
            { type: "dialogue", text: "我们到了。" },
            { type: "transition", text: "CUT TO:" },
        ]);
        expect(parseFountain(serializeFountain(doc)).blocks.map(({ type, text }) => ({ type, text }))).toEqual(doc.blocks.map(({ type, text }) => ({ type, text })));
    });
    it("parses and round-trips supported FDX", () => {
        const source = `<?xml version="1.0"?><FinalDraft><Content><Paragraph Type="Scene Heading"><Text>INT. ROOM - DAY</Text></Paragraph><Paragraph Type="Action"><Text>她推开门。</Text></Paragraph><Paragraph Type="Character"><Text>她</Text></Paragraph><Paragraph Type="Parenthetical"><Text>(轻声)</Text></Paragraph><Paragraph Type="Dialogue"><Text>你好。</Text></Paragraph><Paragraph Type="Transition"><Text>FADE OUT:</Text></Paragraph></Content></FinalDraft>`;
        const doc = parseFdx(source);
        expect(doc.blocks.map(({ type, text }) => ({ type, text }))).toHaveLength(6);
        expect(parseFdx(serializeFdx(doc)).blocks.map(({ type, text }) => ({ type, text }))).toEqual(doc.blocks.map(({ type, text }) => ({ type, text })));
    });
    it("serializes plain text without metadata", () => {
        const doc = normalizeScriptDocument({ blocks: [{ id: "a", type: "action", text: " 一段动作 " }] }, { projectId: "private" });
        expect(serializePlainText(doc)).toBe("一段动作");
        expect(serializePlainText(doc)).not.toContain("private");
    });
    it("rejects malformed FDX", () => expect(() => parseFdx("<FinalDraft><Content>")).toThrow("FDX"));
});
