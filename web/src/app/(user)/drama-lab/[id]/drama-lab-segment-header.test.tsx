import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { groupStoryboardShots } from "@/lib/drama-lab-storyboard-groups";
import { DramaLabSegmentHeader } from "./drama-lab-segment-header";

const group = groupStoryboardShots([
    { id: "a", shotNumber: 1, segmentIndex: 0, segmentTitle: "开端" },
    { id: "b", shotNumber: 2, segmentIndex: 0, segmentTitle: "开端" },
])[0];

describe("DramaLabSegmentHeader", () => {
    it("exposes segment label, actual shot count and range without a group collapse control", () => {
        const html = renderToStaticMarkup(<DramaLabSegmentHeader group={group} />);
        expect(html).toContain("第 1 幕 · 开端");
        expect(html).toContain("镜头 1–2");
        expect(html).toContain("2 个镜头");
        expect(html).not.toContain('type="button"');
        expect(html).not.toContain("aria-expanded");
        expect(html).not.toContain("收起");
    });
});
