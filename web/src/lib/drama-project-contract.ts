import type { PracticeExecutionProfile, PracticeSource } from "@/lib/practice-domain";
import type { IpReference } from "@/lib/ip-library-domain";

export type DramaTaskStatus = "idle" | "queued" | "pending" | "running" | "success" | "error" | "cancelled";
export type DramaReviewStatus = "draft" | "content_review" | "approved" | "visual_ready";
export type DramaVideoMode = "storyboard" | "direct" | "reference";
export type DramaShotCreationMode = "classic" | "universal";
export type DramaStoryboardFrameMode = "single" | "first_last";
export type DramaShotAudioMode = "source" | "voiceover" | "mute";
export type DramaShotAudioKind = "dialogue" | "narration";

/** Persisted state for one independently generated dialogue/narration track. */
export type DramaShotAudioState = {
    status: DramaTaskStatus;
    attempt?: number;
    taskId?: string;
    error?: string;
    url?: string;
    mimeType?: string;
    speaker?: string;
    voice?: string;
    speed?: number;
    instructions?: string;
    durationMs?: number;
};

export type DramaShotGenerationHistory = {
    id: string;
    taskId: string;
    url: string;
    prompt: string;
    createdAt: string;
    width?: number;
    height?: number;
};

export type DramaShotFrameType = "first" | "key" | "last";
export type DramaShotFrameSource = "generated" | "uploaded" | "video_tail" | "restored";
export type DramaShotFrameState = {
    prompt: string;
    description?: string;
    status: DramaTaskStatus;
    taskId?: string;
    attempt?: number;
    url?: string;
    storageKey?: string;
    width?: number;
    height?: number;
    error?: string;
    history?: DramaShotGenerationHistory[];
    source?: DramaShotFrameSource;
    sourceVideoTaskId?: string;
    sourceShotId?: string;
    sourceVideoHistoryId?: string;
    locked?: boolean;
};

export type DramaShotFrameCandidate = {
    id: string;
    frameType: "first";
    url: string;
    storageKey?: string;
    width?: number;
    height?: number;
    source: "video_tail";
    sourceVideoTaskId: string;
    sourceShotId: string;
    sourceVideoHistoryId: string;
    createdAt: string;
    projectUpdatedAt: string;
};

/** Immutable inputs captured when a storyboard video task is submitted. */
export type DramaShotVideoFrameSnapshot = {
    capturedAt: string;
    model?: string;
    supportsFirstFrame?: boolean;
    supportsLastFrame: boolean;
    maxReferenceImages?: number;
    fallbackReason?: string;
    references: Array<{
        role: "first_frame" | "last_frame" | "reference";
        frameType?: DramaShotFrameType;
        url: string;
        storageKey?: string;
        taskId?: string;
        source?: DramaShotFrameSource;
        sourceVideoTaskId?: string;
        sourceShotId?: string;
        sourceVideoHistoryId?: string;
    }>;
};

export type DramaAssetReference = {
    id: string;
    url: string;
    storageKey?: string;
    source: "upload" | "generated" | "library";
    role?: "primary" | "history" | "reference";
    label: string;
    width?: number;
    height?: number;
    createdAt: string;
};

export type DramaAssetProfile = {
    visualIdentity: string;
    styling: string;
    colorPalette: string;
    consistencyRules: string;
};

export type DramaVoiceProfile = {
    voice: string;
    speed: number;
    instructions: string;
};

/** Optional extraction fields retained by the short-drama lab in project_json. */
export type DramaAssetGenerationLayout = "single" | "four_view";
export type DramaAssetStage = { episodeRange: [number, number]; appearance: string };

export type DramaAssetVisualDetails = {
    appearance?: string;
    imagePrompt?: string;
    polishedPrompt?: string;
    singleImagePrompt?: string;
    generationLayout?: DramaAssetGenerationLayout;
    stages?: DramaAssetStage[];
    role?: string;
    type?: string;
    time?: string;
};

export type DramaNamedAsset = DramaAssetVisualDetails & {
    id: string;
    name: string;
    description: string;
    profile?: DramaAssetProfile;
    references?: DramaAssetReference[];
    primaryReferenceId?: string;
    referenceImageUrl?: string;
    referenceStorageKey?: string;
};

export type DramaCharacter = DramaNamedAsset & { voiceProfile?: DramaVoiceProfile };
export type DramaScene = DramaNamedAsset;
export type DramaProp = DramaNamedAsset;
export type DramaClue = DramaNamedAsset & { payoff: string };

export type DramaShotContinuity = {
    shotSize: string;
    cameraAngle: string;
    composition: string;
    characterBlocking: string;
    gazeDirection: string;
    actionStart: string;
    actionEnd: string;
    screenDirection: string;
    axisRule: string;
    continuityNotes: string;
};

export type DramaUtterance = {
    id: string;
    order: number;
    type: "dialogue" | "voiceover";
    speaker: string;
    text: string;
};

export type DramaShot = {
    id: string;
    order: number;
    title: string;
    description: string;
    sourceText: string;
    shotBoundary: string;
    dialogue: string;
    narration: string;
    utterances: DramaUtterance[];
    imagePrompt: string;
    videoPrompt: string;
    cameraMotion: string;
    /** LocalMiniDrama storyboard context used by frame planning. */
    shotType?: string;
    /** LocalMiniDrama's optional segment and photography fields. */
    segmentIndex?: number;
    segmentTitle?: string;
    atmosphere?: string;
    lightingStyle?: string;
    depthOfField?: string;
    creationMode?: DramaShotCreationMode;
    universalSegmentText?: string;
    polishedPrompt?: string;
    cameraAngle?: string;
    angleH?: string;
    angleV?: string;
    angleS?: string;
    location?: string;
    time?: string;
    action?: string;
    result?: string;
    emotion?: string;
    emotionIntensity?: number;
    layoutDescription?: string;
    frames?: Partial<Record<DramaShotFrameType, DramaShotFrameState>>;
    firstFrameCandidate?: DramaShotFrameCandidate;
    videoFrameSnapshot?: DramaShotVideoFrameSnapshot;
    startFramePrompt?: string;
    endFramePrompt?: string;
    negativePrompt?: string;
    continuity?: DramaShotContinuity;
    duration: number;
    characterIds: string[];
    propIds: string[];
    clueIds: string[];
    sceneId?: string;
    videoMode?: DramaVideoMode;
    storyboardStatus?: DramaTaskStatus;
    storyboardFrameMode?: DramaStoryboardFrameMode;
    storyboardAttempt?: number;
    storyboardTaskId?: string;
    storyboardError?: string;
    storyboardImageUrl?: string;
    storyboardImageWidth?: number;
    storyboardImageHeight?: number;
    storyboardHistory?: DramaShotGenerationHistory[];
    storyboardEndStatus?: DramaTaskStatus;
    storyboardEndAttempt?: number;
    storyboardEndTaskId?: string;
    storyboardEndError?: string;
    storyboardEndImageUrl?: string;
    storyboardEndImageWidth?: number;
    storyboardEndImageHeight?: number;
    generationStatus?: DramaTaskStatus;
    generationAttempt?: number;
    generationTaskId?: string;
    /** The original upstream task can be checked again without submitting a new video task. */
    generationNeedsReview?: boolean;
    generationError?: string;
    videoUrl?: string;
    videoHistory?: DramaShotGenerationHistory[];
    subtitle?: string;
    audioMode?: DramaShotAudioMode;
    /** Per-kind tracks mirror LocalMiniDrama's dialogue/narration audio fields. */
    dialogueAudio?: DramaShotAudioState;
    narrationAudio?: DramaShotAudioState;
    audioStatus?: DramaTaskStatus;
    audioAttempt?: number;
    audioTaskId?: string;
    audioError?: string;
    audioUrl?: string;
    /** Provenance for an explicit append-only split-by-audio operation. */
    audioSplitSourceShotId?: string;
    audioSplitSegmentIndex?: number;
};

export type DramaRenderTask = {
    id: string;
    status: "pending" | "running" | "success" | "error" | "cancelled";
    result?: { url?: string };
    error?: string;
};

export type DramaVisualReview = {
    mode: "visual" | "text" | "unavailable";
    status: "passed" | "needs_revision" | "unavailable";
    score?: number;
    summary: string;
    issues: Array<{ taskId?: string; category: string; severity: "low" | "medium" | "high"; message: string; correction?: string }>;
    retryTaskIds: string[];
};

export type DramaEpisode = {
    id: string;
    episodeNumber?: number;
    title: string;
    script: string;
    scriptRichContent?: import("@/lib/drama-script-rich-content").DramaScriptRichContent;
    outline: string;
    hook: string;
    nextPreview: string;
    sourceRange: string;
    reviewStatus: DramaReviewStatus;
    shots: DramaShot[];
    renderTask?: DramaRenderTask;
    visualReview?: DramaVisualReview;
};

export type DramaSourceAsset = {
    id: string;
    type: "text" | "image" | "video" | "audio";
    title: string;
    textContent?: string;
    storageKey?: string;
    remoteUrl?: string;
    serverUrl?: string;
    mimeType?: string;
    width?: number;
    height?: number;
};

export type DramaProject = {
    id: string;
    sourceHandoffId?: string;
    title: string;
    summary: string;
    style: string;
    storyStyle?: string;
    scriptType?: string;
    ratio: string;
    status: "active" | "archived";
    creativeConversationId?: string;
    activeEpisodeId?: string;
    characters: DramaCharacter[];
    scenes: DramaScene[];
    props: DramaProp[];
    clues: DramaClue[];
    defaultVideoMode: DramaVideoMode;
    episodes: DramaEpisode[];
    sourceAssets?: DramaSourceAsset[];
    createdAt: string;
    updatedAt: string;
    executionProfile?: PracticeExecutionProfile;
    practiceSource?: PracticeSource;
    ipReferences?: IpReference[];
};

export type DramaProjectSummary = Pick<DramaProject, "id" | "title" | "summary" | "style" | "ratio" | "status" | "createdAt" | "updatedAt"> & {
    episodeCount: number;
    characterCount: number;
    sceneCount: number;
    shotCount: number;
    pendingTaskCount: number;
    failedTaskCount: number;
    executionProfile?: PracticeExecutionProfile;
    practiceSource?: PracticeSource;
};

export type DramaProjectSummaryPage = {
    items: DramaProjectSummary[];
    total: number;
    page: number;
    pageSize: number;
};

export type CreateDramaProjectInput = Pick<DramaProject, "title" | "summary" | "style" | "ratio"> & {
    storyStyle?: string;
    scriptType?: string;
    sourceHandoffId?: string;
    initialScript?: string;
    sourceAssets?: DramaSourceAsset[];
    defaultVideoMode?: DramaVideoMode;
    ipReferences?: IpReference[];
};

export type DramaContentAnalysis = {
    episode: Pick<DramaEpisode, "outline" | "hook" | "nextPreview" | "sourceRange">;
    characters: Array<Omit<DramaCharacter, "id">>;
    scenes: Array<Omit<DramaScene, "id">>;
    props: Array<Omit<DramaProp, "id">>;
    clues: Array<Omit<DramaClue, "id">>;
    shots: Array<
        Pick<DramaShot, "title" | "description" | "sourceText" | "shotBoundary" | "dialogue" | "narration" | "utterances" | "duration"> & {
            characterNames: string[];
            propNames: string[];
            clueNames: string[];
            sceneName: string;
        }
    >;
};

export type DramaVisualAnalysis = {
    shots: Array<
        Pick<DramaShot, "imagePrompt" | "videoPrompt" | "cameraMotion"> &
            Required<Pick<DramaShot, "startFramePrompt" | "endFramePrompt" | "negativePrompt" | "continuity">> & {
                shotId: string;
            }
    >;
};

export type DramaProjectVersion = {
    id: string;
    projectId: string;
    version: number;
    reason: string;
    createdAt: string;
};

export type DramaCostSummary = {
    estimatedPoints: number;
    actualPoints: number;
    taskCount: number;
    successCount: number;
    failedCount: number;
    byType: Partial<Record<"image" | "video" | "audio", { tasks: number; estimatedPoints: number; actualPoints: number }>>;
};
