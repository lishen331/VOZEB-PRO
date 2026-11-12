import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { useCanvasTaskRuntime, type CanvasTaskRuntime } from "./use-canvas-task-runtime";
import type { CanvasPageState } from "./use-canvas-page-state";
import type { CanvasGenerationRequest } from "./canvas-page-elements";

function fixture() {
    const generationRequestsRef = { current: new Map<string, CanvasGenerationRequest>() };
    const state = { generationRequestsRef, setNodes: vi.fn(), setRunningNodeId: vi.fn(), modal: { confirm: vi.fn() } };
    let runtime!: CanvasTaskRuntime;
    function Harness() {
        // This hook's stop path only needs these state fields; no API or database is used.
        runtime = useCanvasTaskRuntime({ state: state as unknown as CanvasPageState });
        return null;
    }
    renderToStaticMarkup(<Harness />);
    return { runtime, state };
}

describe("Canvas task runtime stopping", () => {
    it.each(["image", "video"] as const)("never aborts or clears a running %s task even when called directly", (mode) => {
        const { runtime, state } = fixture();
        const controller = runtime.startGenerationRequest("output", "text-source", "text-source", undefined, mode);
        runtime.confirmStopGeneration("text-source");
        runtime.stopGenerationByRunningId("text-source");
        expect(controller.signal.aborted).toBe(false);
        expect(state.generationRequestsRef.current.size).toBe(1);
        expect(state.modal.confirm).not.toHaveBeenCalled();
        expect(state.setNodes).not.toHaveBeenCalled();
        expect(state.setRunningNodeId).not.toHaveBeenCalled();
    });

    it.each(["text", "audio"] as const)("still stops %s tasks and cleans their running state", (mode) => {
        const { runtime, state } = fixture();
        const controller = runtime.startGenerationRequest("output", "source", "source", undefined, mode);
        runtime.stopGenerationByRunningId("source");
        expect(controller.signal.aborted).toBe(true);
        expect(state.generationRequestsRef.current.size).toBe(0);
        expect(state.setNodes).toHaveBeenCalledOnce();
        expect(state.setRunningNodeId).toHaveBeenCalledOnce();
    });

    it("checks the current submitted kind again when a stale confirmation is accepted", () => {
        const { runtime, state } = fixture();
        runtime.startGenerationRequest("old-output", "source", "source", undefined, "text");
        runtime.confirmStopGeneration("source");
        runtime.startGenerationRequest("image-output", "source", "source", undefined, "image");
        const confirmation = state.modal.confirm.mock.calls[0][0];
        confirmation.onOk();
        expect(state.generationRequestsRef.current.size).toBe(2);
        expect(state.setNodes).not.toHaveBeenCalled();
    });
});
