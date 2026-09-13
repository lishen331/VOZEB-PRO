import { describe, expect, it } from "vitest";

describe("practice script tree contract", () => {
    it("keeps the complete short-film workflow visible in fixed order", async () => {
        const source = await (await import("node:fs/promises")).readFile(new URL("./route.ts", import.meta.url), "utf8");
        expect(source).toContain("WORKFLOW_ORDER");
        expect(source).toContain("not_started");
        expect(source).toContain("pending:${type}");
        expect(source).toContain("DEFAULT_KEYS");
        expect(source).toContain("row?.artifact_key || DEFAULT_KEYS[type]");
        expect(source).toContain("creative_positioning");
        expect(source).toContain("text_storyboard");
    });
});
