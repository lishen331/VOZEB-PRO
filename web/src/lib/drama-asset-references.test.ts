import { describe, expect, it } from "vitest";

import { dramaAssetPrimaryReference, dramaShotAssetReferences } from "./drama-asset-references";

describe("drama asset references", () => {
    it("uses the selected primary reference and falls back to the first usable candidate", () => {
        const asset = {
            id: "character-1",
            name: "林夏",
            description: "调查记者",
            references: [
                { id: "first", url: "/api/reference-assets/first.png", source: "upload" as const, label: "初版", createdAt: "2026-08-21T00:00:00.000Z" },
                { id: "selected", url: "/api/reference-assets/selected.png", source: "generated" as const, label: "定稿", createdAt: "2026-08-21T00:00:00.000Z" },
            ],
            primaryReferenceId: "selected",
        };

        expect(dramaAssetPrimaryReference(asset)?.id).toBe("selected");
        expect(dramaAssetPrimaryReference({ ...asset, primaryReferenceId: "missing" })?.id).toBe("first");
        expect(dramaAssetPrimaryReference({ ...asset, references: [], referenceImageUrl: "/api/reference-assets/legacy.png" })).toMatchObject({
            id: "character-1-reference-legacy",
            url: "/api/reference-assets/legacy.png",
        });
    });

    it("orders shot references as scene, characters, then props while removing duplicate files", () => {
        const project = {
            characters: [
                { id: "character-1", name: "林夏", description: "", references: [{ id: "char", url: "/api/reference-assets/character.png", source: "upload" as const, label: "角色", createdAt: "2026-08-21T00:00:00.000Z" }] },
                { id: "character-2", name: "周默", description: "", references: [{ id: "char-duplicate", url: "/api/reference-assets/character.png", source: "upload" as const, label: "重复", createdAt: "2026-08-21T00:00:00.000Z" }] },
            ],
            scenes: [{ id: "scene-1", name: "旧仓库", description: "", references: [{ id: "scene", url: "/api/reference-assets/scene.png", source: "generated" as const, label: "场景", createdAt: "2026-08-21T00:00:00.000Z" }] }],
            props: [{ id: "prop-1", name: "旧手机", description: "", references: [{ id: "prop", url: "/api/reference-assets/prop.png", source: "library" as const, label: "道具", createdAt: "2026-08-21T00:00:00.000Z" }] }],
        };

        expect(
            dramaShotAssetReferences(project, {
                sceneId: "scene-1",
                characterIds: ["character-2", "character-1"],
                propIds: ["prop-1"],
            }),
        ).toEqual([
            expect.objectContaining({ id: "scene", url: "/api/reference-assets/scene.png" }),
            expect.objectContaining({ id: "char-duplicate", url: "/api/reference-assets/character.png" }),
            expect.objectContaining({ id: "prop", url: "/api/reference-assets/prop.png" }),
        ]);
    });

    it("ignores assets without a usable image", () => {
        expect(
            dramaShotAssetReferences(
                {
                    characters: [{ id: "character-1", name: "林夏", description: "" }],
                    scenes: [],
                    props: [],
                },
                { characterIds: ["character-1"], propIds: [] },
            ),
        ).toEqual([]);
    });
});
