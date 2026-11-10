export const CANVAS_UI_FEATURES = {
    imageCustomResolution: "canvas-ui-image-custom-resolution",
    videoCustomResolution: "canvas-ui-video-custom-resolution",
} as const;
export type CanvasUiFeatureId = (typeof CANVAS_UI_FEATURES)[keyof typeof CANVAS_UI_FEATURES];
export const DEFAULT_CANVAS_UI_FEATURES = Object.fromEntries(Object.values(CANVAS_UI_FEATURES).map((id) => [id, false])) as Record<CanvasUiFeatureId, boolean>;
export function isCanvasUiFeatureEnabled(featureModules: Record<string, boolean> | undefined, id: CanvasUiFeatureId) {
    return featureModules?.[id] === true;
}
