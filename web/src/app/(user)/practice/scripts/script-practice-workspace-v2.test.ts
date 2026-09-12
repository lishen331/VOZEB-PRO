import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("screenwriter workspace v2", () => {
    it("uses work tree, formal artifact canvas, and Agent chat columns", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/scripts/script-practice-workspace.tsx"), "utf8");
        expect(source).toContain('aria-label="剧本工作目录"');
        expect(source).toContain('aria-label="正式创作成果"');
        expect(source).toContain('aria-label="剧本 Agent 对话"');
    });
    it("uses stable Run SSE, stop, and failed-only retry", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/scripts/script-practice-workspace.tsx"), "utf8");
        expect(source).toContain("runEventsUrl");
        expect(source).toContain("stopRun");
        expect(source).toContain("retryFailed");
        expect(source).not.toContain("JSON.stringify(stage");
    });
});
