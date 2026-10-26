import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QRCode } from "./gamma-ant-qrcode";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("gamma-ant-qrcode：与 antd QRCode 同 API", () => {
    it("渲染出 SVG 二维码，size 透传到 width/height", () => {
        const markup = html(<QRCode value="https://example.com" size={120} />);
        expect(markup).toContain("<svg");
        expect(markup).toContain('width="120"');
        expect(markup).toContain('height="120"');
        expect(markup).toContain("<rect");
    });

    it("bordered={false}：不加白底描边容器样式", () => {
        const markup = html(<QRCode value="abc" bordered={false} />);
        expect(markup).not.toContain("border-[var(--gm-border)]");
    });

    it("className 透传到外层容器", () => {
        const markup = html(<QRCode value="abc" className="mx-auto" />);
        expect(markup).toContain("mx-auto");
    });
});
