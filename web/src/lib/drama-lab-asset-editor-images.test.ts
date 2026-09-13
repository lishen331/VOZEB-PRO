import { describe, expect, it } from "vitest";
import { addPrimaryToGenerationReferences, createAssetGeneratedPrimary, generationReferences } from "./drama-lab-asset-editor-images";

const primary = { id: "primary", url: "/primary.png", source: "upload" as const, role: "primary" as const, label: "主图", createdAt: "2026-09-13T00:00:00.000Z" };
const reference = { id: "reference", url: "/reference.png", source: "upload" as const, role: "reference" as const, label: "参考", createdAt: "2026-09-13T00:00:00.000Z" };

describe("drama lab asset editor image state", () => {
    it("does not send the primary or history image unless explicitly added as reference", () => {
        expect(generationReferences([primary, { ...primary, id: "history", role: "history", url: "/history.png" }, reference])).toEqual([reference]);
    });

    it("adds the primary as a deduplicated reference", () => {
        const next = addPrimaryToGenerationReferences([primary, reference], primary);
        expect(generationReferences(next)).toEqual([expect.objectContaining({ url: "/reference.png" }), expect.objectContaining({ url: "/primary.png", role: "reference" })]);
        expect(addPrimaryToGenerationReferences(next, primary)).toEqual(next);
    });

    it("promotes generated image to primary and demotes the old primary to history", () => {
        const next = createAssetGeneratedPrimary([primary, reference], primary, { id: "generated", url: "/generated.png", source: "generated", label: "生成图", createdAt: "2026-09-13T01:00:00.000Z" });
        expect(next.primaryReferenceId).toBe("generated");
        expect(next.references[0]).toMatchObject({ id: "generated", role: "primary" });
        expect(next.references).toContainEqual(expect.objectContaining({ id: "primary", role: "history" }));
        expect(generationReferences(next.references)).toEqual([reference]);
    });
});
