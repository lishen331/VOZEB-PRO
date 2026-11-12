import type { ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Copy } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { SectionControls } from "@/app/ui-showcase/_components/section-controls";
import { VzModelPicker, type VzModelOption } from "./model-picker";
import { VzParamPicker } from "./param-picker";
import { VzIconButton } from "./primitives";
import { VzPromptEditor } from "./prompt-editor";

type ElementProps = Record<string, unknown> & { children?: ReactNode; content?: ReactNode };
function capture(render: () => ReactNode) {
    let tree: ReactNode;
    function Capture() {
        tree = render();
        return tree;
    }
    const markup = renderToStaticMarkup(<Capture />);
    return { markup, nodes: () => descendants(tree) };
}
function descendants(node: ReactNode): ReactElement<ElementProps>[] {
    return Children.toArray(node).flatMap((child) => {
        if (!isValidElement<ElementProps>(child)) return [];
        return [child, ...descendants(child.props.children), ...descendants(child.props.content)];
    });
}
const MODELS: VzModelOption[] = [
    { id: "a", name: "Model A", vendor: "Studio", desc: "标准", cost: 8 },
    { id: "off", name: "Unavailable", vendor: "Studio", desc: "维护", cost: 12, disabled: true },
    { id: "b", name: "Model B", vendor: "Studio", desc: "高清", cost: 16 },
];

describe("isolated showcase control contracts", () => {
    it("keeps icon geometry when a caller supplies an additional class", () => {
        const markup = renderToStaticMarkup(<VzIconButton icon={Copy} label="复制" className="custom-toolbar-action" />);
        expect(markup).toContain("vz-btn--icon");
        expect(markup).toContain("custom-toolbar-action");
        expect(markup).toContain('aria-label="复制"');
    });
    it("renders an empty model picker as a disabled, readable control", () => {
        const markup = renderToStaticMarkup(<VzModelPicker models={[]} value="" onChange={vi.fn()} />);
        expect(markup).toContain("暂无可用模型");
        expect(markup).toContain("disabled");
    });
    it("gives the model list an associated trigger and keyboard navigation", () => {
        const picker = capture(() => VzModelPicker({ models: MODELS, value: "a", onChange: vi.fn() }));
        const trigger = picker.nodes().find((node) => node.props.className === "vz-model-trigger");
        const list = picker.nodes().find((node) => node.props.role === "listbox");
        expect(trigger?.props["aria-controls"]).toBe(list?.props.id);
        expect(trigger?.props.onKeyDown).toBeTypeOf("function");
        expect(list?.props.onKeyDown).toBeTypeOf("function");
        expect(picker.markup).toContain('aria-haspopup="listbox"');
    });
    it("selects an enabled model with Enter and ignores disabled options", () => {
        const onChange = vi.fn();
        const picker = capture(() => VzModelPicker({ models: MODELS, value: "a", onChange }));
        const options = picker.nodes().filter((node) => node.props.role === "option");
        const enabledKey = options[2]?.props.onKeyDown as ((event: { key: string; preventDefault: () => void }) => void) | undefined;
        expect(enabledKey).toBeTypeOf("function");
        enabledKey?.({ key: "Enter", preventDefault: vi.fn() });
        expect(onChange).toHaveBeenCalledWith("b");
        onChange.mockClear();
        const disabledClick = options[1]?.props.onClick as (() => void) | undefined;
        disabledClick?.();
        expect(onChange).not.toHaveBeenCalled();
    });
    it("uses native radio inputs for the ratio group, including disabled and selected state", () => {
        const markup = renderToStaticMarkup(<VzParamPicker value={{ ratio: "4:3", quality: "高清", count: 2, strength: 55, hd: true }} onChange={vi.fn()} disabled />);
        expect((markup.match(/type="radio"/g) ?? []).length).toBeGreaterThanOrEqual(5);
        expect(markup).toMatch(/<input(?=[^>]*type="radio")(?=[^>]*value="4:3")(?=[^>]*checked="")[^>]*>/);
        expect(markup).toContain('aria-label="画面比例"');
    });
    it("groups each button variant into labelled state cards instead of a flat table", () => {
        const markup = renderToStaticMarkup(<SectionControls />);
        expect(markup).toContain('aria-label="主按钮状态"');
        expect(markup).toContain('aria-label="次按钮状态"');
        expect(markup).toContain("vz-state-card");
        expect(markup).toContain("Selected");
        expect(markup).not.toContain('role="table"');
    });
    it("clearly marks prompt assistance as local mock behavior and wires both utility actions", () => {
        const prompt = capture(() => VzPromptEditor({ value: "银色山脉", onChange: vi.fn() }));
        expect(prompt.markup).toContain("本地演示");
        for (const label of ["提示词库", "翻译为英文"]) {
            const button = prompt.nodes().find((node) => node.props.label === label);
            expect(button?.props.onClick).toBeTypeOf("function");
        }
    });
    it("lets a local template be inserted without making an API request", () => {
        const onChange = vi.fn();
        const prompt = capture(() => VzPromptEditor({ value: "", onChange, maxLength: 24 }));
        const template = prompt.nodes().find((node) => node.props["data-prompt-template"]);
        expect(template).toBeDefined();
        const insert = template?.props.onClick as (() => void) | undefined;
        insert?.();
        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange.mock.calls[0][0].length).toBeLessThanOrEqual(24);
    });
});
