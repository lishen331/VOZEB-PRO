import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SectionCards } from "@/app/ui-showcase/_components/section-cards";
import { createLocalAudioFixture, VzAudioPreview, VzMediaCard, VzResultCard } from "./media";

type Props = Record<string, unknown> & { children?: ReactNode; action?: ReactNode };
function nodes(node: ReactNode): ReactElement<Props>[] {
    return Children.toArray(node).flatMap((child) => (isValidElement<Props>(child) ? [child, ...nodes(child.props.children), ...nodes(child.props.action)] : []));
}
function capture(render: () => ReactNode) {
    let tree: ReactNode;
    function Capture() {
        tree = render();
        return tree;
    }
    const markup = renderToStaticMarkup(<Capture />);
    return { markup, nodes: nodes(tree!) };
}
function action(tree: ReturnType<typeof capture>, label: string) {
    const node = tree.nodes.find((item) => item.props.label === label || item.props["aria-label"] === label);
    expect(node, `Missing action ${label}`).toBeDefined();
    return node!;
}

describe("isolated media interactions", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });
    it("does not select a card when a descendant button handles Enter", () => {
        const onSelect = vi.fn();
        const card = capture(() => VzMediaCard({ src: "/demo.webp", title: "样图", meta: "本地素材", onSelect }));
        const owner = {};
        (card.nodes[0].props.onKeyDown as (event: object) => void)({ key: "Enter", target: {}, currentTarget: owner, preventDefault: vi.fn() });
        expect(onSelect).not.toHaveBeenCalled();
    });
    it.each(["Enter", " "])("selects the card itself with %s and exposes a selection label", (key) => {
        const onSelect = vi.fn();
        const card = capture(() => VzMediaCard({ src: "/demo.webp", title: "样图", meta: "本地素材", selected: true, onSelect }));
        const owner = {};
        const preventDefault = vi.fn();
        (card.nodes[0].props.onKeyDown as (event: object) => void)({ key, target: owner, currentTarget: owner, preventDefault });
        expect(onSelect).toHaveBeenCalledOnce();
        expect(preventDefault).toHaveBeenCalledOnce();
        expect(card.markup).toContain('aria-label="选择作品：样图"');
        expect(card.markup).toContain('aria-pressed="true"');
    });
    it("does not advertise a non-selectable preview as a selectable card", () => {
        const card = capture(() => VzMediaCard({ src: "/demo.webp", title: "样图", meta: "本地素材" }));
        expect(card.nodes[0].props.interactive).toBe(false);
        expect(card.nodes[0].props.onClick).toBeUndefined();
    });
    it("does not let a portal preview click select its originating card", () => {
        const onSelect = vi.fn();
        const card = capture(() => VzMediaCard({ src: "/demo.webp", title: "样图", meta: "本地素材", onSelect }));
        (card.nodes[0].props.onClick as (event: object) => void)({ currentTarget: { contains: () => false }, target: {} });
        expect(onSelect).not.toHaveBeenCalled();
    });
    it("makes favorite a toggle and wires zoom without selecting", () => {
        const onSelect = vi.fn();
        const card = capture(() => VzMediaCard({ src: "/demo.webp", title: "样图", meta: "本地素材", onSelect }));
        expect(action(card, "收藏").props["aria-pressed"]).toBe(false);
        const stopPropagation = vi.fn();
        (action(card, "放大预览").props.onClick as (event: object) => void)({ stopPropagation });
        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(onSelect).not.toHaveBeenCalled();
        expect(card.nodes.find((node) => node.props.title === "样图" && "getContainer" in node.props)).toBeDefined();
    });
    it("downloads a local media file through a real download link", async () => {
        const click = vi.fn();
        const link = { href: "", download: "", click, remove: vi.fn() };
        vi.stubGlobal("document", { createElement: () => link, body: { appendChild: vi.fn() } });
        const card = capture(() => VzMediaCard({ src: "/demo.webp", title: "样图", meta: "本地素材" }));
        await (action(card, "下载").props.onClick as (event: object) => unknown)({ stopPropagation: vi.fn() });
        expect(link.href).toBe("/demo.webp");
        expect(link.download).toBeTruthy();
        expect(click).toHaveBeenCalledOnce();
    });
    it("wires result preview and download instead of showing no-op buttons", () => {
        const card = capture(() => VzResultCard({ status: "success", src: "/demo.webp", prompt: "海报", model: { name: "Model", vendor: "Studio" } }));
        expect(action(card, "放大预览").props.onClick).toBeTypeOf("function");
        expect(action(card, "下载原图").props.onClick).toBeTypeOf("function");
    });
    it("disables unavailable retries while keeping supplied retry actions live", () => {
        const retry = vi.fn();
        const props = { status: "failed" as const, prompt: "海报", model: { name: "Model", vendor: "Studio" } };
        const unavailable = capture(() => VzResultCard(props));
        expect(unavailable.nodes.find((node) => node.props.children === "重新生成")?.props.disabled).toBe(true);
        expect(unavailable.markup).toContain("状态样例");
        const available = capture(() => VzResultCard({ ...props, onRetry: retry }));
        (available.nodes.find((node) => node.props.children === "重新生成")?.props.onClick as () => void)();
        expect(retry).toHaveBeenCalledOnce();
    });
    it("uses a real audio element and native seek control, not a playback timer", () => {
        const player = capture(() => VzAudioPreview({ title: "本地音景" }));
        const audio = player.nodes.find((node) => node.type === "audio");
        expect(audio).toBeDefined();
        for (const event of ["onTimeUpdate", "onPlay", "onPause", "onEnded", "onError"]) expect(audio?.props[event]).toBeTypeOf("function");
        expect(player.nodes.find((node) => node.type === "input" && node.props.type === "range")?.props["aria-label"]).toBe("播放进度");
        expect(player.markup).toContain("本地合成样音");
        expect(player.markup).not.toContain("配音 · 女声");
        expect(player.markup).toContain("00:00");
    });
    it("limits the decorative shimmer to running results", () => {
        const props = { prompt: "本地预览", model: { name: "Mock", vendor: "Studio" } };
        expect(renderToStaticMarkup(<VzResultCard {...props} status="running" />)).toContain('data-running="true"');
        expect(renderToStaticMarkup(<VzResultCard {...props} status="failed" />)).not.toContain('data-running="true"');
        expect(renderToStaticMarkup(<VzResultCard {...props} status="success" />)).not.toContain('data-running="true"');
    });
    it("gives empty, filtered and error state examples real local actions", () => {
        const section = capture(() => SectionCards());
        for (const label of ["开始创作", "清除筛选", "重试"]) expect(section.nodes.find((node) => node.props.children === label)?.props.onClick).toBeTypeOf("function");
    });
    it("creates valid non-silent local WAV bytes without an upstream request", async () => {
        const fixture = createLocalAudioFixture(0.5);
        const bytes = await fixture.arrayBuffer();
        const data = new DataView(bytes);
        expect(fixture.type).toBe("audio/wav");
        expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
        expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
        expect(data.getUint32(24, true)).toBe(16000);
        expect(data.getUint32(40, true)).toBe(bytes.byteLength - 44);
        expect(new Int16Array(bytes.slice(44)).some((sample) => sample !== 0)).toBe(true);
    });
    it("uses the audio element for actual playback and seeking", async () => {
        const player = capture(() => VzAudioPreview({ title: "样音", src: "/fixture.wav" }));
        const audio = player.nodes.find((node) => node.type === "audio")!;
        const media = { paused: true, ended: false, currentTime: 0, play: vi.fn().mockResolvedValue(undefined) };
        (audio.props.ref as { current: typeof media }).current = media;
        await (action(player, "播放").props.onClick as () => Promise<void>)();
        expect(media.play).toHaveBeenCalledOnce();
        const seek = player.nodes.find((node) => node.type === "input" && node.props.type === "range")!;
        (seek.props.onChange as (event: object) => void)({ target: { value: "4.2" } });
        expect(media.currentTime).toBe(4.2);
    });
});
