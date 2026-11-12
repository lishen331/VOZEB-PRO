import { describe, expect, it } from "vitest";
import { CANVAS_UI_FEATURES, isCanvasUiFeatureEnabled } from "./canvas-ui-features";
import { normalizeFeatureModuleSettings } from "./feature-modules";

describe("Canvas custom resolution visibility", () => {
    it("defaults both custom controls to hidden without disabling Canvas or presets", () => {
        const settings = normalizeFeatureModuleSettings(undefined);
        expect(settings.canvas).toBe(true);
        for (const id of Object.values(CANVAS_UI_FEATURES)) {
            expect((settings as Record<string, boolean>)[id]).toBe(false);
            expect(isCanvasUiFeatureEnabled(settings, id)).toBe(false);
        }
    });
    it.each(Object.values(CANVAS_UI_FEATURES))("persists and enables only the selected child %s", (id) => {
        const saved = normalizeFeatureModuleSettings(JSON.parse(JSON.stringify({ [id]: true, canvas: true })));
        expect(isCanvasUiFeatureEnabled(saved, id)).toBe(true);
        for (const other of Object.values(CANVAS_UI_FEATURES).filter((key) => key !== id)) expect(isCanvasUiFeatureEnabled(saved, other)).toBe(false);
        expect(normalizeFeatureModuleSettings({ ...saved, [id]: false })[id as keyof typeof saved]).toBe(false);
    });
    it("does not let a missing session enable custom input", () => {
        expect(isCanvasUiFeatureEnabled(undefined, CANVAS_UI_FEATURES.imageCustomResolution)).toBe(false);
    });
});
