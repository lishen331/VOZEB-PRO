import type { DramaShotFrameType } from "@/lib/drama-project-contract";

export type DramaCanvasWritebackKind = "asset-reference" | "shot-frame" | "shot-video" | "shot-field";
export type DramaCanvasAssetType = "character" | "scene" | "prop";
export type DramaCanvasShotField =
    | "description"
    | "sourceText"
    | "shotBoundary"
    | "dialogue"
    | "narration"
    | "imagePrompt"
    | "videoPrompt"
    | "cameraMotion"
    | "shotType"
    | "segmentTitle"
    | "atmosphere"
    | "lightingStyle"
    | "depthOfField"
    | "universalSegmentText"
    | "polishedPrompt"
    | "cameraAngle"
    | "angleH"
    | "angleV"
    | "angleS"
    | "location"
    | "time"
    | "action"
    | "result"
    | "emotion"
    | "layoutDescription"
    | "startFramePrompt"
    | "endFramePrompt"
    | "negativePrompt";

export type DramaCanvasWritebackInput = {
    projectId: string;
    episodeId: string;
    nodeId: string;
    kind: DramaCanvasWritebackKind;
    expectedProjectUpdatedAt: string;
    expectedCanvasUpdatedAt?: string;
    shotId?: string;
    assetId?: string;
    assetType?: DramaCanvasAssetType;
    frameType?: DramaShotFrameType;
    field?: DramaCanvasShotField;
};

export type DramaCanvasWritebackApplied = Omit<DramaCanvasWritebackInput, "expectedProjectUpdatedAt" | "expectedCanvasUpdatedAt">;
