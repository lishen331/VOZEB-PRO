import type { DramaProject, DramaShotGenerationHistory } from "@/lib/drama-project-contract";
function needsSync(taskId: string | undefined, status: string | undefined, history: DramaShotGenerationHistory[] | undefined) {
    if (!taskId) return false;
    return status === "queued" || status === "pending" || status === "running" || (status === "success" && !history?.some((entry) => entry.taskId === taskId));
}
export function hasOneClickPendingGeneration(project: DramaProject | undefined) {
    return !!project?.episodes.some((episode) =>
        episode.shots.some(
            (shot) =>
                needsSync(shot.storyboardTaskId, shot.storyboardStatus, shot.storyboardHistory) ||
                needsSync(shot.generationTaskId, shot.generationStatus, shot.videoHistory) ||
                Object.values(shot.frames || {}).some((frame) => frame && !frame.locked && needsSync(frame.taskId, frame.status, frame.history)),
        ),
    );
}
