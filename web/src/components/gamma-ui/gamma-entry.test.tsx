import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GammaCardGridSkeleton, GammaDetailSkeleton, GammaListSkeleton } from "./gamma-data";
import { GammaReveal, GM_ENTRY_STAGGER_LIMIT } from "./gamma-motion";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("加载骨架", () => {
    it("卡片网格：按 count 出卡，网格列数沿用调用方 className，带 status 语义", () => {
        const markup = html(<GammaCardGridSkeleton count={4} className="md:grid-cols-2" media="aspect-[4/3]" label="正在加载项目" />);
        expect(markup).toContain('role="status"');
        expect(markup).toContain('aria-busy="true"');
        expect(markup).toContain('aria-label="正在加载项目"');
        expect(markup).toContain("md:grid-cols-2");
        expect(markup.match(/aspect-\[4\/3\]/g)).toHaveLength(4);
    });

    it("卡片网格：不传 media 时不出图片占位", () => {
        expect(html(<GammaCardGridSkeleton count={2} />)).not.toContain("rounded-none");
    });

    it("列表与详情：都是 status 区域且有闪光占位", () => {
        for (const markup of [html(<GammaListSkeleton rows={2} />), html(<GammaDetailSkeleton />)]) {
            expect(markup).toContain('role="status"');
            expect(markup).toContain("gm-shimmer");
        }
    });
});

describe("GammaReveal 入场", () => {
    it("上限内的项从透明开始", () => {
        expect(html(<GammaReveal index={0}>a</GammaReveal>)).toContain("opacity:0");
    });

    it("超过上限、或 animate=false 时直接出现，不留透明初始态", () => {
        expect(html(<GammaReveal index={GM_ENTRY_STAGGER_LIMIT}>a</GammaReveal>)).not.toContain("opacity:0");
        expect(html(<GammaReveal animate={false}>a</GammaReveal>)).not.toContain("opacity:0");
    });
});
