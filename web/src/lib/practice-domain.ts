export type PracticeExecutionProfile = "production" | "open-source-practice";
export type PracticeProjectKind = "canvas" | "drama";
export type PracticeModuleKind = "script" | "storyboard-image" | "storyboard-video" | "dubbing" | "music";
export type SystemChannelPurpose = "production" | "open-source-practice" | "shared";
export type PullFilmSourceType = "canvas" | "drama";

export type PracticeSource = { type: "blank" } | { type: "published-work"; workId: string; versionId: string };

export type PublicProcessAsset = {
    id: string;
    title?: string;
    type?: string;
    previewUrl?: string;
};

export type PublicCanvasNode = {
    id: string;
    type: string;
    title?: string;
    summary?: string;
    assetIds?: string[];
};

export type PublicDramaScene = {
    id: string;
    title?: string;
    summary?: string;
    assetIds?: string[];
};

export type PublicDramaEpisode = {
    id: string;
    title: string;
    order: number;
    scenes: PublicDramaScene[];
};

export type PublicProcessSnapshot =
    { sourceType: "canvas"; versionId: string; nodes: readonly PublicCanvasNode[]; assets: readonly PublicProcessAsset[] } | { sourceType: "drama"; versionId: string; episodes: readonly PublicDramaEpisode[]; assets: readonly PublicProcessAsset[] };

export function resolvePracticeModelAccess(profile: PracticeExecutionProfile, purpose: SystemChannelPurpose) {
    return purpose === "shared" || purpose === profile || (profile === "open-source-practice" && purpose === "open-source-practice");
}

export function canChangeExecutionProfile(_from: PracticeExecutionProfile, _to: PracticeExecutionProfile): false {
    return false;
}

export function isPullFilmSourceType(value: string): value is PullFilmSourceType {
    return value === "canvas" || value === "drama";
}
