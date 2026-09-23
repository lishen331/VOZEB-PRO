/** An explicit empty scene survives JSON serialization and clears the saved binding. */
export function buildShotBindingPatch(characterIds: string[], propIds: string[], sceneId: string | undefined) {
    return { characterIds, propIds, sceneId: sceneId || "" };
}
