import { describe, expect, it } from "vitest";
import { serializeAdminSettingsForUser } from "./admin-channel-config";
import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";

describe("practice settings admin boundary", () => {
    it("hides script model configuration from non-upstream administrators", () => {
        const settings = { ...DEFAULT_SETTINGS, practiceScriptSettings: { ...DEFAULT_SETTINGS.practiceScriptSettings, defaultModelId: "private-writer", enabledTools: ["rewrite_selection"] } };
        const result = serializeAdminSettingsForUser(settings, { role: "admin", status: "active", adminPermissions: ["system.manage"] });
        expect(result.practiceScriptSettings.defaultModelId).toBe("");
        expect(result.practiceScriptSettings.enabledTools).toEqual([]);
    });
    it("keeps script model configuration for upstream administrators", () => {
        const settings = { ...DEFAULT_SETTINGS, practiceScriptSettings: { ...DEFAULT_SETTINGS.practiceScriptSettings, defaultModelId: "writer" } };
        const result = serializeAdminSettingsForUser(settings, { role: "admin", status: "active", adminPermissions: ["upstream.manage"] });
        expect(result.practiceScriptSettings.defaultModelId).toBe("writer");
    });
});
