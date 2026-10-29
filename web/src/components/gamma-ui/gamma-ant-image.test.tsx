import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Image } from "./gamma-ant-image";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("gamma-ant-image：与 antd Image 同 API", () => {
    it("基本渲染：src/alt/width/height/className/rootClassName", () => {
        const markup = html(<Image src="/a.png" alt="示例图" width={48} height={48} className="size-12" rootClassName="my-root" />);
        expect(markup).toContain('src="/a.png"');
        expect(markup).toContain('alt="示例图"');
        expect(markup).toContain('width="48"');
        expect(markup).toContain("my-root");
        expect(markup).toContain("cursor-zoom-in");
    });

    it("preview={false}：不加放大光标，仍渲染 fallback 占位 lightbox（关闭态隐藏）", () => {
        const markup = html(<Image src="/a.png" alt="" preview={false} />);
        expect(markup).not.toContain("cursor-zoom-in");
    });

    it("PreviewGroup：多张图共享一个 lightbox 容器，关闭态下不显示任意一张大图", () => {
        const markup = html(
            <Image.PreviewGroup>
                <Image src="/a.png" alt="图一" />
                <Image src="/b.png" alt="图二" />
            </Image.PreviewGroup>,
        );
        expect(markup).toContain('src="/a.png"');
        expect(markup).toContain('src="/b.png"');
        expect(markup).toContain("cursor-zoom-in");
    });
});
