import { readFileSync } from "node:fs";
import type { ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SectionOverlays } from "./section-overlays";
import { SectionResponsive } from "./section-responsive";
import { ShowcaseClient } from "./showcase-client";
import { ShowcaseCtx } from "./showcase-context";

type ElementProps = Record<string, unknown> & { children?: ReactNode; content?: ReactNode; footer?: ReactNode };
const toast = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(), open: vi.fn(), destroy: vi.fn() };
function descendants(node: ReactNode): ReactElement<ElementProps>[] {
    return Children.toArray(node).flatMap((child) => {
        if (!isValidElement<ElementProps>(child)) return [];
        return [child, ...descendants(child.props.children), ...descendants(child.props.content), ...descendants(child.props.footer)];
    });
}
function capture(render: () => ReactNode) {
    let tree: ReactNode;
    function Capture() {
        tree = render();
        return tree;
    }
    const markup = renderToStaticMarkup(
        <ShowcaseCtx.Provider value={{ toast: toast as never, getContainer: () => null as never, dark: true }}>
            <Capture />
        </ShowcaseCtx.Provider>,
    );
    return { markup, nodes: () => descendants(tree) };
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("showcase-only page interactions", () => {
    it("renders a container-based device sketch without requesting a framed page", () => {
        const markup = renderToStaticMarkup(<SectionResponsive />);
        expect(markup).not.toContain("<iframe");
        expect(markup).toContain("尺寸示意");
        expect(markup).toContain("vz-device-sketch");
        expect(markup).toContain("390");
        expect(markup).toContain("430");
        expect(markup).toContain("834");
    });
    it("does not start a perpetual progress interval on mount", () => {
        const source = readFileSync(new URL("./section-overlays.tsx", import.meta.url), "utf8");
        expect(source).not.toContain("setInterval");
        expect(source).toContain("clearTimeout");
        const page = capture(() => SectionOverlays());
        const start = page.nodes().find((node) => node.props["data-progress-start"]);
        expect(start?.props.onClick).toBeTypeOf("function");
    });
    it("copies the real preview address before reporting success", async () => {
        const page = capture(() => SectionOverlays());
        const action = page.nodes().find((node) => node.props.children === "复制链接");
        const copy = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("window", { location: { origin: "https://preview.example" } });
        vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
        await (action?.props.onClick as () => Promise<void>)();
        expect(copy).toHaveBeenCalledWith("https://preview.example/ui-showcase");
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("复制"));
    });
    it("keeps clipboard failure actionable without claiming a successful copy", async () => {
        const page = capture(() => SectionOverlays());
        const action = page.nodes().find((node) => node.props.children === "复制链接");
        vi.stubGlobal("window", { location: { origin: "https://preview.example" } });
        vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
        await (action?.props.onClick as () => Promise<void>)();
        expect(toast.success).not.toHaveBeenCalled();
        expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("手动"));
    });
    it("cancels the pending local confirmation when its dialog is dismissed", () => {
        const page = capture(() => SectionOverlays());
        const confirmation = page.nodes().find((node) => node.props.closable === false);
        const actions = descendants(confirmation?.props.footer);
        const confirmAction = actions.find((node) => node.props.children === "确认删除");
        const cancelAction = actions.find((node) => node.props.children === "取消");
        vi.useFakeTimers();
        vi.stubGlobal("window", { setTimeout, clearTimeout });
        (confirmAction?.props.onClick as () => void)();
        (cancelAction?.props.onClick as () => void)();
        vi.advanceTimersByTime(1000);
        expect(toast.success).not.toHaveBeenCalled();
    });
    it("maps resource navigation onto existing preview sections", () => {
        const page = capture(() => ShowcaseClient());
        const nav = page.nodes().find((node) => node.props.onNavigate);
        const lookup = vi.fn().mockReturnValue({ scrollIntoView: vi.fn() });
        vi.stubGlobal("document", { getElementById: lookup });
        vi.stubGlobal("window", {});
        const navigate = nav?.props.onNavigate as (id: string) => void;
        navigate("assets");
        navigate("settings");
        expect(lookup.mock.calls.map(([id]) => id)).toEqual(["vz-sec-cards", "vz-sec-foundation"]);
    });
    it("labels the account/quota as mock and provides notification and search handlers", () => {
        const page = capture(() => ShowcaseClient());
        expect(page.markup).toContain("示例配额");
        expect(page.markup).toContain("演示账户");
        expect(page.markup).not.toContain("充值积分");
        const notifications = page.nodes().find((node) => node.props.label === "通知");
        expect(notifications?.props.onClick).toBeTypeOf("function");
        const search = page.nodes().find((node) => node.props["aria-label"] === "全局搜索");
        expect(search?.props.onKeyDown).toBeTypeOf("function");
    });
});
