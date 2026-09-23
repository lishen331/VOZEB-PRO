import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OneClickAssetReferenceUpload } from "./one-click-asset-reference-upload";
describe("L asset reference upload surface", () => {
    it("shows the complete main image and exactly one multi-file input, never a zoom trigger", () => {
        const html = renderToStaticMarkup(<OneClickAssetReferenceUpload reference={{ id: "r", url: "/portrait.png", source: "upload", label: "参考图", createdAt: "now" }} busy={false} onUpload={vi.fn()} onExtract={vi.fn()} onRemove={vi.fn()} />);
        expect(html).toContain("object-contain");
        expect(html).toContain("/portrait.png");
        expect(html.match(/type="file"/g)).toHaveLength(1);
        expect(html).toContain('multiple=""');
        expect(html).toContain("从参考图提取描述");
        expect(html).toContain("移除参考图");
        expect(html).not.toContain("放大");
    });
    it("shows a droppable upload surface without fake image actions before any reference exists", () => {
        const html = renderToStaticMarkup(<OneClickAssetReferenceUpload busy={false} onUpload={vi.fn()} onExtract={vi.fn()} onRemove={vi.fn()} />);
        expect(html).toContain("点击或拖入参考图");
        expect(html).not.toContain("移除参考图");
        expect(html).not.toContain("从参考图提取描述");
    });
});
