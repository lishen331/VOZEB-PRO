import { describe, expect, it } from "vitest";
import { centeredOutpainting, outpaintingGeometry, outpaintingLesson, readOutpaintingSelection, readOutpaintingSnapshot } from "./practice-outpainting";

describe("practice outpainting", () => {
    it("accepts 4K, preserves the aspect ratio and reads a saved 4K snapshot", () => {
        const selection = { padding: centeredOutpainting(1080, 1080, "16:9"), ratio: "16:9", resolution: "4k" } as const;
        const snapshot = { width: 1080, height: 1080, selection };
        expect(readOutpaintingSelection(selection)).toEqual(selection);
        expect(readOutpaintingSnapshot(snapshot)).toEqual(snapshot);
        expect(outpaintingGeometry(1080, 1080, selection)).toEqual({ width: 4096, height: 2304, left: 896, top: 0, sourceWidth: 2304, sourceHeight: 2304 });
        expect(outpaintingLesson(selection, 1080, 1080).prompt).toContain("4096 × 2304");
    });
    it("keeps exact preset ratio, maps both edges and rejects a rounded-away margin", () => {
        const padding = centeredOutpainting(1080, 1080, "16:9");
        expect(padding).toEqual({ left: 420, right: 420, top: 0, bottom: 0 });
        const geometry = outpaintingGeometry(1080, 1080, { padding, ratio: "16:9", resolution: "2k" });
        expect(geometry).toEqual({ width: 2048, height: 1152, left: 448, top: 0, sourceWidth: 1152, sourceHeight: 1152 });
        expect(outpaintingGeometry(4000, 4000, { padding: { left: 0, right: 1, top: 0, bottom: 0 }, ratio: "free", resolution: "1k" })).toBeNull();
    });
    it("rejects invalid and empty selections, and derives the submitted text from four teaching sections", () => {
        const selection = { padding: { left: 0, right: 100, top: 0, bottom: 0 }, ratio: "free", resolution: "1k" } as const;
        expect(readOutpaintingSelection(selection)).toEqual(selection);
        expect(readOutpaintingSelection({ ...selection, padding: { ...selection.padding, right: -1 } })).toBeNull();
        expect(readOutpaintingSelection({ ...selection, padding: { ...selection.padding, right: 0 } })).toBeNull();
        const lesson = outpaintingLesson(selection, 1024, 640);
        expect(lesson.sections.map((part) => part.title)).toEqual(["扩图目标", "补全区域", "画面延续", "禁止事项"]);
        expect(lesson.sections[1].text).toContain("右侧 100 像素");
        expect(lesson.prompt).toBe(lesson.sections.map((part) => `${part.title}：${part.text}`).join("\n"));
    });
});
