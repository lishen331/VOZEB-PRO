import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-lab-visual-assets-panel.tsx");

describe("drama lab visual asset card layout", () => {
    it("keeps the asset grid and card media frame layout contract", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain('className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"');
        expect(source).toContain('className="group relative flex h-[430px] cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-primary/50"');
        expect(source).toContain('className="relative flex h-44 shrink-0 items-center justify-center overflow-hidden bg-muted/50"');
    });

    it("summarizes affected shots and opens a clickable detail modal without a locate button", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("const [impactModalAsset, setImpactModalAsset] = useState<VisualAsset>();");
        expect(source).toContain("··· 更多");
        expect(source).toContain("关联分镜的全部信息");
        expect(source).toContain("setImpactModalAsset(asset)");
        expect(source).toContain("影响分镜");
        expect(source).toContain("分镜图");
        expect(source).toContain("onLocateShot(shot.episodeId, shot.id)");
        expect(source).not.toContain(">定位</button>");
    });
});
