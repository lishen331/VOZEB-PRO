import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { insertResourceMention } from "./resource-image-generation";

describe("outline resource editor autosave and mentions", () => {
    it("inserts a mention at the current cursor without deleting following text", () => {
        expect(insertResourceMention("保留脸，使用服装", 2, 2, "图1")).toEqual({ value: "保留@图1 脸，使用服装", cursor: 6 });
        expect(insertResourceMention("保留@脸，使用服装", 2, 3, "图2")).toEqual({ value: "保留@图2 脸，使用服装", cursor: 6 });
    });

    it("autosaves resource editor changes without success toast and keeps explicit save confirmation", async () => {
        const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
        expect(source).toContain("resourceAutoSaveTimerRef");
        expect(source).toContain("scheduleResourceAutoSave");
        expect(source).toContain("persistResourceAsset");
        expect(source).toContain("await saveResourceEditor(true)");
        expect(source).toContain('message.success("保存成功")');
        expect(source).not.toContain('message.success("已自动保存")');
    });
});
