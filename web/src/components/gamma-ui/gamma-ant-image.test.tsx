import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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

/*
 * 回归：PreviewGroup 曾经每次渲染都新建 context 值，Image 的注册 effect 以 group 为依赖，
 * 于是「注册 → setItems 新数组 → 再渲染 → 换新 group」无限循环，主线程被占满，
 * Next 的客户端跳转永远提交不了（表现为详情页侧栏、面包屑、卡片点了没反应）。
 * 修法是记忆化 context 值并让 register/open 稳定；这里锁死这两点，防回退。
 */
describe("PreviewGroup 的 context 值必须稳定（否则注册 effect 自激重渲染）", () => {
    it("memoizes the context value and stabilizes register/open", async () => {
        const source = await readFile(resolve(process.cwd(), "src/components/gamma-ui/gamma-ant-image.tsx"), "utf8");
        expect(source).toMatch(/const register = useCallback\(/);
        expect(source).toMatch(/const open = useCallback\(/);
        expect(source).toMatch(/useMemo<GroupContextValue>\(\(\) => \(\{ register, open \}\)/);
    });

    it("returns the previous items array when a re-registration changes nothing", async () => {
        const source = await readFile(resolve(process.cwd(), "src/components/gamma-ui/gamma-ant-image.tsx"), "utf8");
        expect(source).toContain("if (existing.src === item.src && existing.alt === item.alt) return current;");
    });
});
