import { describe, expect, it } from "vitest";

import { FEATURE_MODULE_IDS, featureModuleForPathname, normalizeFeatureModuleSettings } from "./feature-modules";

describe("feature module registry", () => {
    it("keeps every built-in module enabled when no stored configuration exists", () => {
        const settings = normalizeFeatureModuleSettings(undefined);
        expect(FEATURE_MODULE_IDS.every((id) => settings[id])).toBe(true);
    });

    it("only accepts known module switches and defaults omitted entries to enabled", () => {
        expect(normalizeFeatureModuleSettings({ canvas: false, unknown: false })).toMatchObject({ canvas: false, drama: true });
    });

    it("resolves protected page roots to their module", () => {
        expect(featureModuleForPathname("/drama-lab/project-1/outline")).toBe("drama-lab");
        expect(featureModuleForPathname("/profile")).toBeUndefined();
    });
});
