import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { generateClientUUID } from "@/lib/client-uuid";
describe("HTTP storyboard actions", () => {
    it("generates client IDs when crypto.randomUUID is unavailable", () => {
        vi.stubGlobal("crypto", {});
        try {
            expect(generateClientUUID()).toMatch(/^[0-9a-f-]{36}$/);
        } finally {
            vi.unstubAllGlobals();
        }
    });
    it("does not call secure-context UUID directly in the project UI", async () => {
        const source = await readFile("src/app/(user)/one-click-film/[id]/one-click-film-project.tsx", "utf8");
        expect(source).not.toContain("crypto.randomUUID()");
        expect(source).toContain("onDrop=");
        expect(source).toContain(".docx,.doc");
    });
});
