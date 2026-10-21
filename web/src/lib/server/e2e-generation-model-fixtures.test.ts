import { expect, it } from "vitest";
import { e2eSettingsPatch } from "../../../e2e/support";
it("declares explicit logical bindings for every fixture default model", () => {
    const patch = e2eSettingsPatch(1);
    const ids = patch.logicalModels.map((model) => model.id);
    for (const id of Object.values(patch.defaultModels)) expect(ids).toContain(id);
    for (const model of patch.logicalModels) {
        expect(model.bindings.map((binding) => binding.channelId)).toEqual(["e2e-primary", "e2e-backup"]);
        expect(model.bindings.every((binding) => binding.upstreamModel === model.id && binding.enabled)).toBe(true);
    }
});
