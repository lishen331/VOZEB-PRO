import type { DramaAssetReference } from "./drama-project-contract";

export function generationReferences(references: DramaAssetReference[]) {
    return references
        .filter((reference) => reference.role === "reference")
        .filter((reference, index, values) => values.findIndex((item) => item.url === reference.url) === index)
        .slice(0, 9);
}

export function addPrimaryToGenerationReferences(references: DramaAssetReference[], primary?: DramaAssetReference) {
    if (!primary || references.some((reference) => reference.role === "reference" && reference.url === primary.url)) return references;
    return [...references, { ...primary, id: `reference-${Date.now()}`, role: "reference" as const, label: primary.label || "主图参考" }];
}

export function createAssetGeneratedPrimary(references: DramaAssetReference[], primary: DramaAssetReference | undefined, generated: DramaAssetReference) {
    const remaining = references.filter((reference) => reference.id !== generated.id && reference.id !== primary?.id);
    return {
        primaryReferenceId: generated.id,
        references: [{ ...generated, role: "primary" as const }, ...(primary ? [{ ...primary, role: "history" as const }] : []), ...remaining],
    };
}
