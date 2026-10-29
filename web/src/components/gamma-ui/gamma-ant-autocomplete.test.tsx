import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AutoComplete } from "./gamma-ant-autocomplete";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("gamma-ant-autocomplete：与 antd AutoComplete 同 API", () => {
    it("无 children：渲染内置输入框，value/placeholder/className 透传", () => {
        const markup = html(<AutoComplete value="720" placeholder="例如 720、1440 或 2K" className="w-full" options={[{ value: "480" }, { value: "720" }]} onChange={() => {}} />);
        expect(markup).toContain('value="720"');
        expect(markup).toContain('placeholder="例如 720、1440 或 2K"');
        expect(markup).toContain("w-full");
    });

    it("有 children：克隆自定义输入元素而不是渲染内置 input", () => {
        const markup = html(
            <AutoComplete value="教学" options={[{ value: "教学" }]} onChange={() => {}}>
                <input data-testid="custom-input" maxLength={60} />
            </AutoComplete>,
        );
        expect(markup).toContain('data-testid="custom-input"');
        expect(markup).toContain('maxLength="60"');
        expect(markup).toContain('value="教学"');
    });
});
