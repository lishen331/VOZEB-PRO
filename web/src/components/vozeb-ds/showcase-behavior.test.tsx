import type { ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SectionResponsive } from "@/app/ui-showcase/_components/section-responsive";
import { VzGenerateButton } from "./generate-button";
import { VzUploadZone } from "./upload-zone";

vi.mock("@/app/ui-showcase/_components/showcase-context", () => ({ useShowcase: () => ({ toast: { info: vi.fn(), success: vi.fn() }, getContainer: vi.fn() }) }));

type Props = Record<string, unknown> & { children?: ReactNode };
function nodes(node: ReactNode): ReactElement<Props>[] {
    return Children.toArray(node).flatMap((child) => (isValidElement<Props>(child) ? [child, ...nodes(child.props.children)] : []));
}
function capture(render: () => ReactNode) {
    let tree: ReactNode;
    function Capture() {
        tree = render();
        return tree;
    }
    const markup = renderToStaticMarkup(<Capture />);
    return { markup, elements: () => nodes(tree) };
}

describe("isolated showcase generation and local upload", () => {
    it("disables running generation instead of accepting duplicate clicks", () => {
        const markup = renderToStaticMarkup(<VzGenerateButton status="running" progress={30} />);
        expect(markup).toContain('disabled=""');
        expect(markup).toContain('aria-busy="true"');
    });
    it("makes a completed generation explicitly repeatable", () => {
        const markup = renderToStaticMarkup(<VzGenerateButton status="success" />);
        expect(markup).toContain("再次生成");
    });
    it("resets the file input so the same file can be selected again", () => {
        const onAdd = vi.fn();
        const zone = capture(() => VzUploadZone({ items: [], onAdd }));
        const input = zone.elements().find((node) => node.type === "input");
        const target = { value: "chosen.png", files: [new File(["demo"], "chosen.png", { type: "image/png" })] };
        (input?.props.onChange as (event: unknown) => void)({ target, currentTarget: target });
        expect(onAdd).toHaveBeenCalledOnce();
        expect(target.value).toBe("");
    });
    it("does not turn a child keyboard action into a second file chooser", () => {
        const zone = capture(() => VzUploadZone({ items: [] }));
        const upload = zone.elements().find((node) => node.props.className === "vz-upload");
        const preventDefault = vi.fn();
        (upload?.props.onKeyDown as (event: unknown) => void)({ key: "Enter", target: {}, currentTarget: {}, preventDefault });
        expect(preventDefault).not.toHaveBeenCalled();
    });
    it("provides a real click entry to reference preview", () => {
        const markup = renderToStaticMarkup(<VzUploadZone items={[{ id: "ref", src: "/style-thumbs/anime.jpg", name: "角色参考", status: "done" }]} />);
        expect(markup).toContain('aria-label="预览 角色参考"');
    });
    it("does not embed a page blocked by the existing frame security policy", () => {
        const markup = renderToStaticMarkup(<SectionResponsive />);
        expect(markup).not.toContain("<iframe");
        expect(markup).toContain("尺寸示意");
    });
});
