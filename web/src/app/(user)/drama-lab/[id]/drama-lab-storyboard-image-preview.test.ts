import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const path = "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx";

describe("drama lab storyboard image preview", () => {
    it("keeps preview images constrained to the same media cell as video", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("preview={{ src: shot.frames[frameType]?.url }}");
        expect(source).toContain("preview={{ src: classicImageUrl }}");
        expect(source).toContain('data-storyboard-media="image" className="grid h-56 min-h-0 min-w-0 overflow-hidden');
        expect(source).toContain('className="relative h-full min-h-0 min-w-0 overflow-hidden"');
        expect(source).toContain('className="relative min-h-0 min-w-0 flex-1 overflow-hidden"');
        expect(source).toContain('root: "absolute inset-0 block size-full overflow-hidden"');
        expect(source).toContain('image: "block size-full object-contain"');
    });
});
