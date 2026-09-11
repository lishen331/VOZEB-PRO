import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const path = "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx";

describe("drama lab storyboard image preview", () => {
    it("uses the shared clickable image preview for classic and first-last frames", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("Image preview={{ src: shot.frames[frameType]?.url }}");
        expect(source).toContain("Image preview={{ src: classicImageUrl }}");
        expect(source).toContain("alt={frameLabel[frameType]}");
        expect(source).toContain("alt={`分镜 ${shot.shotNumber} 图像`}");
    });
});
