import { describe, expect, it } from "vitest";
import { buildShotBindingPatch } from "./shot-binding-patch";

describe("shot binding save payload", () => {
    it("sends an explicit empty scene when clearing the selection", () => {
        const payload = JSON.parse(JSON.stringify(buildShotBindingPatch(["c1"], ["p1"], undefined)));
        expect(payload).toEqual({ characterIds: ["c1"], propIds: ["p1"], sceneId: "" });
    });
    it("preserves a selected scene", () => {
        expect(buildShotBindingPatch([], [], "scene-2").sceneId).toBe("scene-2");
    });
});
