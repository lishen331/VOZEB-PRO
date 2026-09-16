import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { appendCanvasLibraryPrompt, canvasNodePrompt, shouldPersistCanvasNodePrompt } from "./canvas-node-prompt-panel";

const uploadedImage: CanvasNodeData = {
    id: "water-meter",
    type: CanvasNodeType.Image,
    title: "水表.png",
    position: { x: 0, y: 0 },
    width: 320,
    height: 240,
    metadata: { content: "/api/reference-assets/water-meter.png" },
};

describe("Canvas node prompt editing", () => {
    it("starts an uploaded image with an empty prompt and keeps a generated prompt visible", () => {
        expect(canvasNodePrompt(uploadedImage)).toBe("");
        expect(canvasNodePrompt({ ...uploadedImage, metadata: { ...uploadedImage.metadata, prompt: "改成复古铜制水表" } })).toBe("改成复古铜制水表");
    });

    it("persists prompt changes for existing image nodes", () => {
        expect(shouldPersistCanvasNodePrompt(uploadedImage)).toBe(true);
    });

    it("appends a library prompt without replacing the existing draft", () => {
        expect(appendCanvasLibraryPrompt("保留现有构图和水表主体", "改为复古铜制工业风格")).toBe("保留现有构图和水表主体\n\n改为复古铜制工业风格");
        expect(appendCanvasLibraryPrompt("", "改为复古铜制工业风格")).toBe("改为复古铜制工业风格");
    });
});
