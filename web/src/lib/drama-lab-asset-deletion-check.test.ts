import { describe, expect, it } from "vitest";
import { checkDramaAssetDeletion } from "./drama-lab-asset-deletion-check";
const shots = [{ id: "shot-1", shotNumber: 1, episodeId: "ep", sceneId: "scene", characterIds: ["char"], propIds: ["prop"] }];
describe("drama asset deletion check", () => {
    it.each([
        ["scenes", "scene"],
        ["characters", "char"],
        ["props", "prop"],
    ] as const)("finds references for %s without deleting", (kind, id) => {
        const result = checkDramaAssetDeletion({ assetId: id, kind, asset: { id, name: "测试" }, shots });
        expect(result).toMatchObject({ assetId: id, canDelete: false, requiresConfirmation: true, affectedShots: [{ id: "shot-1", shotNumber: 1 }] });
    });
    it("returns a safe no-reference result and never mutates shots", () => {
        const input = { assetId: "missing", kind: "props" as const, shots: structuredClone(shots) };
        const result = checkDramaAssetDeletion(input);
        expect(result).toMatchObject({ canDelete: false, requiresConfirmation: false, affectedShots: [] });
        expect(input.shots).toEqual(shots);
    });
    it("does not require a destructive implementation when references exist", () => {
        const result = checkDramaAssetDeletion({ assetId: "char", kind: "characters", shots });
        expect(result.canDelete).toBe(false);
        expect(result.message).toContain("删除前必须确认影响范围");
    });
});
