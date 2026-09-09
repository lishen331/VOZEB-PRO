import { describe, expect, it } from "vitest";
import { featureModuleForGenerationContext } from "./feature-module-access";
describe("generation feature module mapping", () => {
    it("keeps ordinary drama tasks on drama", () => expect(featureModuleForGenerationContext({ surface: "drama" })).toBe("drama"));
    it("maps explicit Drama Lab task context to drama-lab", () => expect(featureModuleForGenerationContext({ surface: "drama", featureModule: "drama-lab" })).toBe("drama-lab"));
});
