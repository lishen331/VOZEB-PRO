export const DRAMA_LAB_CANVAS_HANDOFF_PREFIX = "drama-lab-canvas:";

export function dramaLabEpisodeCanvasHandoffId(projectId: string, episodeId: string) {
    return `${DRAMA_LAB_CANVAS_HANDOFF_PREFIX}${projectId}:episode:${episodeId}`;
}

export function isDramaLabCanvasProject(project: { sourceHandoffId?: unknown }) {
    return typeof project.sourceHandoffId === "string" && project.sourceHandoffId.startsWith(DRAMA_LAB_CANVAS_HANDOFF_PREFIX);
}
