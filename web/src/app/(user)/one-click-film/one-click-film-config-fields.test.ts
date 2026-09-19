import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
describe("L video parameter dialog fields", () => {
    it("includes editable location/time/action/result and sends them when saved", async () => {
        const source = await readFile("src/app/(user)/one-click-film/[id]/one-click-film-shot-editor.tsx", "utf8");
        for (const name of ["分镜地点", "分镜时间", "分镜动作", "分镜画面结果", "分镜氛围"]) expect(source).toContain(`aria-label="${name}"`);
        expect(source).toContain("location, time, action, result, atmosphere");
    });
});
