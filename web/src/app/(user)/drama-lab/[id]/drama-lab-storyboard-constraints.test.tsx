import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DramaLabStoryboardConstraints } from "./drama-lab-storyboard-constraints";
describe("storyboard constraints", () => {
    it("renders empty targets without fake default counts", () => {
        const html = renderToStaticMarkup(<DramaLabStoryboardConstraints value={{ shotCount: "", totalDuration: "" }} onChange={() => {}} disabled={false} />);
        expect(html).toContain('aria-label="分镜数量"');
        expect(html).toContain('aria-label="视频总时长（秒）"');
        expect(html).toContain('value=""');
    });
    it("keeps the explicit fractional duration visible while disabled", () => {
        const html = renderToStaticMarkup(<DramaLabStoryboardConstraints value={{ shotCount: "12", totalDuration: "90.5" }} onChange={() => {}} disabled />);
        expect(html).toContain('value="90.5"');
        expect(html).toContain('disabled=""');
    });
    it("wires episode-specific input into the actual extraction request", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");
        expect(source).toContain("normalizeDramaLabStoryboardOptions(constraintDraft)");
        expect(source).toContain("requestId: createDramaLabClientRequestId(), storyboardOptions");
        expect(source).toContain('constraintDrafts[episode?.id || ""]');
    });
});

describe("storyboard mode controls", () => {
    it("renders the selected mode and enabled narration", () => {
        const html = renderToStaticMarkup(<DramaLabStoryboardConstraints value={{ shotCount: "", totalDuration: "", creationMode: "universal", generateNarration: true }} onChange={() => {}} disabled={false} />);
        expect(html).toContain("经典分镜");
        expect(html).toContain("全能分镜");
        expect(html).toContain("生成解说旁白");
        expect(html.match(/checked=""/g)).toHaveLength(2);
    });
});
