import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const path = "src/app/(user)/drama-lab/[id]/outline/page.tsx";

describe("drama lab outline style picker", () => {
    it("updates the visible selection and persists the exact option chosen in the picker", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("const selectStyle = (style: string, closePicker = true) => {");
        expect(source).toContain('form.setFieldValue("style", nextStyle)');
        expect(source).toContain("setSelectedStyle(nextStyle)");
        expect(source).toContain("scheduleProjectSettingsSave({ style: nextStyle })");
        expect(source).toContain("onClick={() => selectStyle(option.value)}");
        expect(source).toContain("selectStyle(event.target.value, false)");
    });

    it("reads unregistered picker values from the complete form store instead of falling back to an old style", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("const values = form.getFieldsValue(true) as ProjectSettingsFormValues");
        expect(source).toContain('const style = (typeof overrides.style === "string" ? overrides.style : values.style || selectedStyle || project.style || "").trim()');
        expect(source).toContain("setSelectedStyle(style)");
    });
});
