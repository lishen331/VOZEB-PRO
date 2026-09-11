import { describe, expect, it } from "vitest";
import { parseFdx, parseFountain, normalizeScriptDocument } from "@/lib/script-practice-contract";

describe("script import format boundary", () => {
    it("supports plain text and markdown as action blocks", () => {
        expect(normalizeScriptDocument({ blocks: "第一段\n\n第二段".split(/\n{2,}/).map((text) => ({ type: "action", text })) }).blocks).toHaveLength(2);
    });
    it("rejects malformed FDX and empty Fountain", () => {
        expect(() => parseFdx("<FinalDraft>")).toThrow();
        expect(() => parseFountain(" ")).toThrow();
    });
});
