export type DramaStoryBatchStatus = "pending" | "persisting" | "completed" | "error" | "cancelled";

export type DramaStoryBatch = {
    version: 1;
    projectId: string;
    /** Owner-backed project storage identity for collaboration members. */
    projectOwnerUserId?: string;
    sourceEpisodeId: string;
    sourceEpisodeIndex: number;
    targetEpisodeIds: string[];
    episodeCount: number;
    storyOutline: string;
    storyStyle: string;
    scriptType: string;
    status: DramaStoryBatchStatus;
    persistedEpisodeIndexes: number[];
    activeEpisodeIndex?: number;
    error?: string;
    startedAt: number;
    completedAt?: number;
};
