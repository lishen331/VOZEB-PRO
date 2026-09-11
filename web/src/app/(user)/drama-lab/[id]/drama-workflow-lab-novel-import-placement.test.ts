import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("drama workflow novel import placement", () => {
    it("places the novel picker next to script generation while retaining the script drop zone", async () => {
        const source = await readFile(new URL("./drama-workflow-lab-project-complete.tsx", import.meta.url), "utf8");
        const importIndex = source.indexOf('triggerContainerId="drama-lab-novel-import-actions"');
        const scriptFieldIndex = source.indexOf('name="script"');
        const generateIndex = source.indexOf('"生成剧本"');
        const actionSlotIndex = source.indexOf('id="drama-lab-novel-import-actions"');

        expect(importIndex).toBeGreaterThanOrEqual(0);
        expect(scriptFieldIndex).toBeGreaterThan(importIndex);
        expect(generateIndex).toBeGreaterThan(scriptFieldIndex);
        expect(actionSlotIndex).toBeGreaterThan(generateIndex);
    });
});
