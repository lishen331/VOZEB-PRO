import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Select } from "./gamma-ant-select";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const OPTIONS = [
    { value: "a", label: "甲" },
    { value: "b", label: "乙" },
    { value: "c", label: "丙", disabled: true },
];

describe("gamma-ant-select：与 antd Select 同 API", () => {
    it("单选：未选中显示 placeholder，选中后显示对应 label", () => {
        expect(html(<Select options={OPTIONS} placeholder="请选择分类" onChange={() => {}} />)).toContain("请选择分类");
        expect(html(<Select options={OPTIONS} value="b" onChange={() => {}} />)).toContain(">乙<");
    });

    it("多选 / 标签模式：value 为数组时渲染多个标签", () => {
        const markup = html(<Select mode="multiple" options={OPTIONS} value={["a", "b"]} onChange={() => {}} />);
        expect(markup).toContain(">甲<");
        expect(markup).toContain(">乙<");
        expect(markup).toContain('aria-label="移除"');
    });

    it("maxTagCount：超出数量折叠为 +N", () => {
        const markup = html(<Select mode="multiple" options={OPTIONS} value={["a", "b"]} maxTagCount={1} onChange={() => {}} />);
        expect(markup).toContain(">甲<");
        expect(markup).not.toContain(">乙<");
        expect(markup).toContain("+1");
    });

    it("allowClear：有选中值时渲染清空按钮，disabled 时不渲染", () => {
        expect(html(<Select options={OPTIONS} value="a" allowClear onChange={() => {}} />)).toContain('aria-label="清空"');
        expect(html(<Select options={OPTIONS} value="a" allowClear disabled onChange={() => {}} />)).not.toContain('aria-label="清空"');
        expect(html(<Select options={OPTIONS} allowClear onChange={() => {}} />)).not.toContain('aria-label="清空"');
    });

    it("loading：渲染加载态图标", () => {
        expect(html(<Select options={OPTIONS} loading onChange={() => {}} />)).toContain("animate-spin");
    });

    it("status：校验态映射到对应的 ring 颜色类", () => {
        expect(html(<Select options={OPTIONS} status="error" onChange={() => {}} />)).toContain("gm-danger");
        expect(html(<Select options={OPTIONS} status="warning" onChange={() => {}} />)).toContain("gm-warning");
    });

    it("disabled：禁用态下 combobox 不可交互", () => {
        expect(html(<Select options={OPTIONS} disabled onChange={() => {}} />)).toMatch(/role="combobox"[^>]*disabled=""/);
    });

    it("size：small / large 映射不同的外壳类", () => {
        expect(html(<Select options={OPTIONS} size="small" onChange={() => {}} />)).toContain("min-h-7");
        expect(html(<Select options={OPTIONS} size="large" onChange={() => {}} />)).toContain("min-h-10");
    });
});
