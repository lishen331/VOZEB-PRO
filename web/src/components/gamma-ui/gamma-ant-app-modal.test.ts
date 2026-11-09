import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Gamma App confirmation modal composition", () => {
    it("shares the focus-managed modal primitive with nested editor dialogs", async () => {
        const source = await readFile(new URL("./gamma-ant-app.tsx", import.meta.url), "utf8");
        expect(source).toContain('from "@/components/gamma-ui/gamma-ant-modal"');
        expect(source).not.toContain("<GammaModal");
    });
});
