import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { groupStoryboardShots } from "@/lib/drama-lab-storyboard-groups";
import { DramaLabSegmentHeader } from "./drama-lab-segment-header";

const group = groupStoryboardShots([
    { id: "a", shotNumber: 1, segmentIndex: 0, segmentTitle: "开端" },
    { id: "b", shotNumber: 2, segmentIndex: 0, segmentTitle: "开端" },
])[0];

describe("DramaLabSegmentHeader", () => {
    it("exposes segment label, actual shot count/range and expanded panel association", () => {
        const html = renderToStaticMarkup(<DramaLabSegmentHeader group={group} expanded controlsId="segment-a" onToggle={() => {}} />);
        expect(html).toContain("第 1 幕 · 开端");
        expect(html).toContain("镜头 1–2");
        expect(html).toContain("2 个镜头");
        expect(html).toContain('type="button"');
        expect(html).toContain('aria-expanded="true"');
        expect(html).toContain('aria-controls="segment-a"');
        expect(html).toContain("收起");
    });

    it("renders collapsed state and forwards the toggle action", () => {
        const onToggle = vi.fn();
        const element = DramaLabSegmentHeader({ group, expanded: false, controlsId: "segment-a", onToggle });
        const html = renderToStaticMarkup(element);
        expect(html).toContain('aria-expanded="false"');
        expect(html).toContain("展开");
        element.props.children.props.onClick();
        expect(onToggle).toHaveBeenCalledOnce();
    });
});
