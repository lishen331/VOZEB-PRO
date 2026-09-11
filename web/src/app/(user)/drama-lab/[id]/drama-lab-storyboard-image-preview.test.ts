import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const path = "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx";

describe("drama lab storyboard image preview", () => {
    it("uses Ant Design preview for classic and first-last frames while filling the aligned media cell", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("preview={{ src: shot.frames[frameType]?.url }}");
        expect(source).toContain("preview={{ src: classicImageUrl }}");
        expect(source).toContain("alt={frameLabel[frameType]}");
        expect(source).toContain("alt={`分镜 ${shot.shotNumber} 图像`}");
        expect(source).toContain('root: "block min-h-0 size-full"');
        expect(source).toContain('image: "block size-full object-contain"');
    });
});
