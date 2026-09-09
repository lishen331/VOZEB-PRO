export type PracticeExecutionProfile = "production" | "open-source-practice";
export type PracticeProjectKind = "canvas" | "drama";
export type PracticeModuleKind = "script" | "character" | "scene" | "prop" | "storyboard-image" | "storyboard-video" | "dubbing" | "music";
export type PracticeSessionMode = "manual" | "workflow";
export type PracticeSessionPublicStatus = "draft" | "queued" | "running" | "success" | "failed" | "cancelled";
/** 与 Demo“尺寸比例”下拉一致：key 为 `${width}x${height}`，label 形如 `16:9 · 1280×720`。 */
export type PracticeSizeOption = { key: string; label: string; width: number; height: number };
export type PracticeWorkflowOption = { code: string; label: string; inputSchema?: PracticeModuleInputField[]; sizeOptions?: PracticeSizeOption[]; durationOptions?: number[] };
export type PracticeModuleModelOption = { id: string; label: string; workflowOptions?: PracticeWorkflowOption[] };
export type PracticeModuleInputField = {
    key: string;
    label: string;
    type: "text" | "textarea" | "image" | "number" | "enum" | "boolean";
    required: boolean;
    options?: string[];
    defaultValue?: string | number | boolean | null;
};
export type PracticeModuleCapability = {
    module: PracticeModuleKind;
    mode: PracticeSessionMode;
    available: boolean;
    unavailableReason?: string;
    models: PracticeModuleModelOption[];
    inputSchema: PracticeModuleInputField[];
    outputType: "text" | "image" | "video" | "audio";
    workflowOptions?: PracticeWorkflowOption[];
    /** 生成尺寸预设；存在时前端用“尺寸比例”下拉代替裸 width/height 数字框。 */
    sizeOptions?: PracticeSizeOption[];
    /** 视频时长预设（秒）；存在时前端用下拉代替裸 duration 数字框。 */
    durationOptions?: number[];
};
export type SystemChannelPurpose = "production" | "open-source-practice" | "shared";
export type PullFilmSourceType = "canvas" | "drama";

export type PracticeSource = { type: "blank" } | { type: "published-work"; workId: string; versionId: string };

export type PublicProcessAsset = {
    id: string;
    title?: string;
    type?: string;
    role?: "cover" | "content";
    previewUrl?: string;
};

export type PublicCanvasNode = {
    id: string;
    type: string;
    title?: string;
    summary?: string;
    position?: { x: number; y: number };
    assetIds?: string[];
};

export type PublicCanvasConnection = { id: string; fromNodeId: string; toNodeId: string };

export type PublicDramaCharacter = { id: string; name: string; summary?: string; assetIds?: string[] };

export type PublicDramaScene = {
    id: string;
    title?: string;
    summary?: string;
    assetIds?: string[];
};

export type PublicDramaShot = {
    id: string;
    order: number;
    title?: string;
    summary?: string;
    sceneId?: string;
    storyboardAssetIds?: string[];
    videoAssetIds?: string[];
    audioAssetIds?: string[];
};

export type PublicDramaEpisode = {
    id: string;
    title: string;
    order: number;
    scriptSummary?: string;
    reviewStatus?: string;
    shots: PublicDramaShot[];
};

export type PublicProcessSnapshot =
    | { sourceType: "canvas"; versionId: string; title?: string; nodes: readonly PublicCanvasNode[]; connections: readonly PublicCanvasConnection[]; assets: readonly PublicProcessAsset[] }
    | {
          sourceType: "drama";
          versionId: string;
          title?: string;
          summary?: string;
          style?: string;
          ratio?: string;
          characters: readonly PublicDramaCharacter[];
          scenes: readonly PublicDramaScene[];
          episodes: readonly PublicDramaEpisode[];
          assets: readonly PublicProcessAsset[];
      };

export function resolvePracticeModelAccess(profile: PracticeExecutionProfile, purpose: SystemChannelPurpose) {
    return purpose === "shared" || purpose === profile || (profile === "open-source-practice" && purpose === "open-source-practice");
}

export function canChangeExecutionProfile(_from: PracticeExecutionProfile, _to: PracticeExecutionProfile): false {
    return false;
}

export function isPullFilmSourceType(value: string): value is PullFilmSourceType {
    return value === "canvas" || value === "drama";
}
