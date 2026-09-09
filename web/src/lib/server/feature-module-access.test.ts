import { describe, expect, it } from "vitest";
import { featureModuleForGenerationContext } from "./feature-module-access";
describe("generation feature module mapping", () => {
    it("keeps ordinary drama tasks on drama", () => expect(featureModuleForGenerationContext({ surface: "drama" })).toBe("drama"));
    it("maps explicit Drama Lab task context to drama-lab", () => expect(featureModuleForGenerationContext({ surface: "drama", featureModule: "drama-lab" })).toBe("drama-lab"));
    it("recognizes legacy Drama Lab project IDs when context was created before the module field", () => expect(featureModuleForGenerationContext({ surface: "drama", projectId: "drama-lab-1788493614414-xni9ra7" })).toBe("drama-lab"));
    it("keeps ordinary drama project IDs on drama", () => expect(featureModuleForGenerationContext({ surface: "drama", projectId: "drama-project-ordinary-1" })).toBe("drama"));
});
