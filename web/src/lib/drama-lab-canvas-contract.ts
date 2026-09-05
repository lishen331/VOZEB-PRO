export const DRAMA_LAB_CANVAS_HANDOFF_PREFIX = "drama-lab-canvas:";
const EPISODE_SEPARATOR = ":episode:";

export function dramaLabEpisodeCanvasHandoffId(projectId: string, episodeId: string) {
    return `${dramaLabCanvasProjectHandoffPrefix(projectId)}${encodeHandoffComponent(episodeId)}`;
}

export function dramaLabCanvasProjectHandoffPrefix(projectId: string) {
    return `${DRAMA_LAB_CANVAS_HANDOFF_PREFIX}${encodeHandoffComponent(projectId)}${EPISODE_SEPARATOR}`;
}

export function parseDramaLabEpisodeCanvasHandoffId(value: unknown) {
    if (typeof value !== "string" || !value.startsWith(DRAMA_LAB_CANVAS_HANDOFF_PREFIX)) return null;
    const remainder = value.slice(DRAMA_LAB_CANVAS_HANDOFF_PREFIX.length);
    const index = remainder.lastIndexOf(EPISODE_SEPARATOR);
    if (index <= 0 || index + EPISODE_SEPARATOR.length >= remainder.length) return null;
    const projectId = decodeHandoffComponent(remainder.slice(0, index))?.trim() || "";
    const episodeId = decodeHandoffComponent(remainder.slice(index + EPISODE_SEPARATOR.length))?.trim() || "";
    return projectId && episodeId ? { projectId, episodeId } : null;
}

export function isDramaLabCanvasProject(project: { sourceHandoffId?: unknown }) {
    return typeof project.sourceHandoffId === "string" && project.sourceHandoffId.startsWith(DRAMA_LAB_CANVAS_HANDOFF_PREFIX);
}

function encodeHandoffComponent(value: string) {
    return encodeURIComponent(value);
}

function decodeHandoffComponent(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
}
