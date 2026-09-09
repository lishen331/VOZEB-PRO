import { describe, expect, it } from "vitest";
import { requireFeatureModuleEnabled } from "./feature-module-access";

describe("feature module display switches", () => {
    it("never block server business operations when a display module is disabled", async () => {
        const original = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        try {
            await expect(requireFeatureModuleEnabled("drama")).resolves.toBeUndefined();
            await expect(requireFeatureModuleEnabled("drama-lab")).resolves.toBeUndefined();
        } finally {
            process.env.NODE_ENV = original;
        }
    });
});
