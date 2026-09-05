import type { DramaAssetReference, DramaProject, DramaShot } from "@/lib/drama-project-contract";

type DramaReferenceOwner = Pick<DramaAssetReference, never> & {
    id: string;
    references?: DramaAssetReference[];
    primaryReferenceId?: string;
    referenceImageUrl?: string;
    referenceStorageKey?: string;
};

/** Returns normalized candidates so every surface applies the same primary-image rule. */
export function dramaAssetReferences(asset: DramaReferenceOwner): DramaAssetReference[] {
    const references = (asset.references || []).filter((reference) => reference.url.trim());
    if (references.length || !asset.referenceImageUrl?.trim()) return references;
    return [
        {
            id: `${asset.id}-reference-legacy`,
            url: asset.referenceImageUrl,
            storageKey: asset.referenceStorageKey,
            source: "library",
            label: "原参考图",
            createdAt: new Date(0).toISOString(),
        },
    ];
}

export function dramaAssetPrimaryReference(asset: DramaReferenceOwner) {
    const references = dramaAssetReferences(asset);
    return references.find((reference) => reference.id === asset.primaryReferenceId) || references[0];
}

export function dramaShotAssetReferences(project: Pick<DramaProject, "characters" | "scenes" | "props">, shot: Pick<DramaShot, "sceneId" | "characterIds" | "propIds">) {
    const scene = project.scenes.find((asset) => asset.id === shot.sceneId);
    const characters = shot.characterIds.flatMap((id) => {
        const asset = project.characters.find((item) => item.id === id);
        return asset ? [asset] : [];
    });
    const props = shot.propIds.flatMap((id) => {
        const asset = project.props.find((item) => item.id === id);
        return asset ? [asset] : [];
    });
    const seenUrls = new Set<string>();
    return [scene, ...characters, ...props].flatMap((asset) => {
        if (!asset) return [];
        const reference = dramaAssetPrimaryReference(asset);
        if (!reference || seenUrls.has(reference.url)) return [];
        seenUrls.add(reference.url);
        return [reference];
    });
}
