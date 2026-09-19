import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
describe("L standalone prompt editor", () => {
    it("opens the requested dialog section without exposing a six-tab replacement", async () => {
        const source = await readFile("src/app/(user)/one-click-film/[id]/one-click-film-shot-editor.tsx", "utf8");
        expect(source).not.toContain("<Tabs");
        expect(source).toContain('width={initialTab === "prompts" ? 700');
        expect(source).not.toContain("value={polishedPrompt} readOnly");
        expect(source).toContain("shotPromptPatch({ imagePrompt, polishedPrompt, videoPrompt })");
    });
});
