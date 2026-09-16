import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("character AI action loading", () => {
    it("only spins the button for the active AI action", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("busyAction={busyKey.startsWith");
        expect(source).toContain('loading={busyAction === "prompt"}');
        expect(source).toContain('loading={busyAction === "anchor"}');
        expect(source).toContain('loading={busyAction === "stages"}');
    });
});
