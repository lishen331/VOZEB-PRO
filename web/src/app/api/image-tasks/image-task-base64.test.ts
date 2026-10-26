import { describe, expect, it } from "vitest";

import { resolveImageBase64Like } from "./image-task-support";

describe("resolveImageBase64Like", () => {
    it("accepts multi-megabyte raw base64 without overflowing the regex stack", () => {
        const jpeg = `/9j/${"A".repeat(12 * 1024 * 1024)}`;
        expect(() => resolveImageBase64Like(jpeg)).not.toThrow();
        expect(resolveImageBase64Like(jpeg).startsWith("data:image/jpeg;base64,/9j/")).toBe(true);
        const unknown = "Q".repeat(12 * 1024 * 1024);
        expect(resolveImageBase64Like(unknown).startsWith("data:image/png;base64,QQQQ")).toBe(true);
    });

    it("strips whitespace and rejects non-base64 text", () => {
        const body = "A".repeat(80);
        expect(resolveImageBase64Like(`${body.slice(0, 40)}\n${body.slice(40)}`)).toBe(`data:image/png;base64,${body}`);
        expect(resolveImageBase64Like(`${"A".repeat(80)}!`)).toBe("");
        expect(resolveImageBase64Like("short")).toBe("");
    });
});
