import { describe, expect, it } from "vitest";

import { ERASE_MS, HOLD_MS, TYPE_MS, typewriterFrame } from "./canvas-generating-copy";

const LINES = ["abc", "de"] as const;

describe("typewriterFrame", () => {
    it("types the first line one character at a time", () => {
        expect(typewriterFrame(0, LINES)).toEqual({ text: "", phase: "type" });
        expect(typewriterFrame(TYPE_MS, LINES)).toEqual({ text: "a", phase: "type" });
        expect(typewriterFrame(TYPE_MS * 2, LINES)).toEqual({ text: "ab", phase: "type" });
    });

    it("holds the fully typed line before erasing", () => {
        expect(typewriterFrame(TYPE_MS * 3, LINES)).toEqual({ text: "abc", phase: "hold" });
        expect(typewriterFrame(TYPE_MS * 3 + HOLD_MS - 1, LINES)).toEqual({ text: "abc", phase: "hold" });
    });

    it("erases back down to empty", () => {
        const eraseStart = TYPE_MS * 3 + HOLD_MS;
        expect(typewriterFrame(eraseStart, LINES)).toEqual({ text: "abc", phase: "erase" });
        expect(typewriterFrame(eraseStart + ERASE_MS, LINES)).toEqual({ text: "ab", phase: "erase" });
    });

    it("advances to the next line after the first slot", () => {
        const slotOne = LINES[0].length * TYPE_MS + HOLD_MS + LINES[0].length * ERASE_MS;
        expect(typewriterFrame(slotOne + TYPE_MS, LINES)).toEqual({ text: "d", phase: "type" });
    });

    it("loops forever without drifting", () => {
        const total = LINES.reduce((sum, line) => sum + line.length * TYPE_MS + HOLD_MS + line.length * ERASE_MS, 0);
        expect(typewriterFrame(total + TYPE_MS, LINES)).toEqual(typewriterFrame(TYPE_MS, LINES));
        expect(typewriterFrame(total * 99 + TYPE_MS, LINES)).toEqual(typewriterFrame(TYPE_MS, LINES));
    });

    it("clamps negative elapsed and tolerates an empty line set", () => {
        expect(typewriterFrame(-500, LINES)).toEqual({ text: "", phase: "type" });
        expect(typewriterFrame(1000, [])).toEqual({ text: "", phase: "hold" });
    });
});
