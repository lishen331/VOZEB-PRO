import type { CanvasGenerationMode } from "../types";

export function canvasGenerationCanStop(mode: CanvasGenerationMode | "panorama" | undefined): boolean {
    return mode === "text" || mode === "audio";
}

/** Use the submitted task kind, never a node's editable next-generation settings. */
export function canvasRunningGenerationCanStop(requests: Iterable<{ runningNodeId: string; mode?: CanvasGenerationMode }>, runningId: string): boolean {
    const running = Array.from(requests).filter((request) => request.runningNodeId === runningId);
    return running.length > 0 && running.every((request) => canvasGenerationCanStop(request.mode));
}
