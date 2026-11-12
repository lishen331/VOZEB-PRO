import { describe, expect, it } from "vitest";

import { canvasGenerationCanStop, canvasRunningGenerationCanStop } from "./canvas-generation-stop-policy";

describe("canvas generation stop policy", () => {
    it.each(["image", "video", "text", "audio", "panorama"] as const)("allows stopping %s generation only when upstream interaction supports it", (mode) => {
        expect(canvasGenerationCanStop(mode)).toBe(mode === "text" || mode === "audio");
    });

    it("treats an unset config-node mode as image generation and does not allow stopping", () => {
        expect(canvasGenerationCanStop(undefined)).toBe(false);
    });
});

describe("running task stop policy", () => {
    it("protects image generation started from a text or config node", () => {
        expect(canvasRunningGenerationCanStop([{ runningNodeId: "text-node", mode: "image" }], "text-node")).toBe(false);
    });
    it("allows text/audio but blocks mixed and unregistered requests", () => {
        expect(canvasRunningGenerationCanStop([{ runningNodeId: "a", mode: "audio" }], "a")).toBe(true);
        expect(canvasRunningGenerationCanStop([{ runningNodeId: "a", mode: "text" }], "a")).toBe(true);
        expect(
            canvasRunningGenerationCanStop(
                [
                    { runningNodeId: "a", mode: "text" },
                    { runningNodeId: "a", mode: "video" },
                ],
                "a",
            ),
        ).toBe(false);
        expect(canvasRunningGenerationCanStop([], "a")).toBe(false);
        expect(canvasRunningGenerationCanStop([{ runningNodeId: "a" }], "a")).toBe(false);
    });
});
