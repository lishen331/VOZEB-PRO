import { readFileSync } from "node:fs";
import path from "node:path";

import postcss from "postcss";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SectionFoundation } from "@/app/ui-showcase/_components/section-foundation";
import { describe, expect, it } from "vitest";

import { getVozebDsAntTheme } from "./vozeb-ds-theme";

const stylePath = path.resolve(process.cwd(), "src/app/styles/vozeb-ds");
const css = (file: string) => postcss.parse(readFileSync(path.join(stylePath, file), "utf8"));
const tokensCss = css("tokens.css");

type Palette = Record<string, string>;
type Color = { channels: number[]; alpha: number };

function palette(dark: boolean): Palette {
    const result: Palette = {};
    tokensCss.walkRules((rule) => {
        if (rule.selector !== ".vz-ds" && (dark || rule.selector !== '.vz-ds[data-vz-theme="light"]')) return;
        rule.walkDecls(/^--vz-/, (decl) => {
            result[decl.prop] = decl.value;
        });
    });
    return result;
}

function value(tokens: Palette, key: string): string {
    const token = tokens[key];
    expect(token, `missing design token ${key}`).toBeDefined();
    const alias = token?.match(/^var\((--vz-[\w-]+)\)$/);
    return alias ? value(tokens, alias[1]) : token;
}

function color(input: string): Color {
    if (/^#[a-f\d]{6}$/i.test(input))
        return {
            channels: input
                .slice(1)
                .match(/../g)!
                .map((part) => Number.parseInt(part, 16)),
            alpha: 1,
        };
    const rgba = input.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
    if (!rgba) throw new Error(`Unsupported contrast fixture color: ${input}`);
    return { channels: rgba.slice(1, 4).map(Number), alpha: rgba[4] === undefined ? 1 : Number(rgba[4]) };
}

function over(front: Color, back: Color): Color {
    return { channels: front.channels.map((channel, index) => channel * front.alpha + back.channels[index] * (1 - front.alpha)), alpha: 1 };
}

function luminance(input: Color): number {
    return input.channels
        .map((channel) => channel / 255)
        .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(front: Color, back: Color): number {
    const foreground = luminance(over(front, back));
    const background = luminance(back);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
}

function declarations(file: string, selector: string): Palette {
    const result: Palette = {};
    css(file).walkRules((rule) => {
        if (!rule.selectors.includes(selector)) return;
        rule.walkDecls((decl) => {
            result[decl.prop] = decl.value;
        });
    });
    return result;
}

const THEMES = [
    { dark: true, name: "dark" },
    { dark: false, name: "light" },
];
const SURFACES = ["--vz-surface-1", "--vz-surface-2", "--vz-surface-3"];
const SEMANTICS = ["accent", "success", "warning", "danger", "info"];

describe.each(THEMES)("VOZEB showcase contrast ($name)", ({ dark }) => {
    const tokens = palette(dark);

    it.each(["--vz-text-1", "--vz-text-2", "--vz-text-3"])("keeps ordinary text %s at least 4.5:1 on every solid surface", (key) => {
        for (const surface of SURFACES) expect(contrast(color(value(tokens, key)), color(value(tokens, surface))), `${key} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    });

    it.each(SEMANTICS)("keeps %s state text legible on solid and tinted surfaces", (semantic) => {
        for (const surface of SURFACES) {
            const background = color(value(tokens, surface));
            const foreground = color(value(tokens, `--vz-${semantic}-text`));
            expect(contrast(foreground, background), `${semantic} on ${surface}`).toBeGreaterThanOrEqual(4.5);
            expect(contrast(foreground, over(color(value(tokens, `--vz-${semantic}-soft`)), background)), `${semantic} soft on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
    });

    it.each(["--vz-control-border", "--vz-focus-color"])("keeps identifying control marker %s at least 3:1", (key) => {
        for (const surface of SURFACES) expect(contrast(color(value(tokens, key)), color(value(tokens, surface))), `${key} on ${surface}`).toBeGreaterThanOrEqual(3);
    });

    it.each(["--vz-gradient", "--vz-gradient-success", "--vz-gradient-danger"])("keeps button text readable across %s including hover and cost pills", (key) => {
        const stops = value(tokens, key).match(/#[a-f\d]{6}/gi) ?? [];
        expect(stops.length).toBeGreaterThanOrEqual(2);
        const text = color(value(tokens, "--vz-text-on-brand"));
        for (const stop of stops) {
            const background = color(stop);
            expect(contrast(text, background), `${key} ${stop}`).toBeGreaterThanOrEqual(4.5);
            const hovered = { ...background, channels: background.channels.map((channel) => Math.min(255, channel * 1.04)) };
            expect(contrast(text, hovered), `${key} hovered ${stop}`).toBeGreaterThanOrEqual(4.5);
            expect(contrast(text, over({ channels: [255, 255, 255], alpha: 0.06 }, hovered)), `${key} highlighted ${stop}`).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("maps AntD text, markers and semantic text to the same local palette", () => {
        const config = getVozebDsAntTheme(dark);
        expect(config.token?.colorTextTertiary).toBe(value(tokens, "--vz-text-3"));
        expect(config.token?.colorTextPlaceholder).toBe(value(tokens, "--vz-text-3"));
        expect(config.token?.colorBorder).toBe(value(tokens, "--vz-control-border"));
        expect(config.token?.colorSuccessText).toBe(value(tokens, "--vz-success-text"));
        expect(config.token?.colorWarningText).toBe(value(tokens, "--vz-warning-text"));
        expect(config.token?.colorErrorText).toBe(value(tokens, "--vz-danger-text"));
        expect(config.token?.colorInfoText).toBe(value(tokens, "--vz-info-text"));
    });
});

describe("VOZEB showcase foundation contracts", () => {
    it("defines a reusable 4px / 8px spacing scale and typography tokens", () => {
        const tokens = palette(true);
        for (const step of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]) expect(value(tokens, `--vz-space-${step}`)).toBe(`${step * 4}px`);
        for (const [key, size] of Object.entries({ xs: 12, sm: 13, md: 14, lg: 16, xl: 20, "2xl": 24, "3xl": 32 })) expect(value(tokens, `--vz-text-size-${key}`)).toBe(`${size}px`);
        expect(Number(value(tokens, "--vz-leading-body"))).toBeGreaterThanOrEqual(1.5);
        expect(Number(value(tokens, "--vz-leading-heading"))).toBeGreaterThanOrEqual(1.2);
    });

    it("owns a viewport scroll container and does not erase fallback keyboard focus", () => {
        const root = declarations("tokens.css", ".vz-ds");
        expect(root.height).toBe("100dvh");
        expect(root["overflow-y"]).toBe("auto");
        expect(root.position).toBe("relative");
        const focus = declarations("tokens.css", ".vz-ds :focus-visible");
        expect(focus.outline).toContain("var(--vz-focus-color)");
        expect(focus["outline-offset"]).toBeDefined();
    });

    it("uses separate interactive borders without raising decorative surfaces", () => {
        for (const [file, selector] of [
            ["fields.css", ".vz-ds .vz-input"],
            ["workbench.css", ".vz-ds .vz-model-trigger"],
            ["workbench.css", ".vz-ds .vz-prompt"],
            ["workbench.css", ".vz-ds .vz-ratio"],
            ["feedback.css", ".vz-ds .vz-upload"],
        ]) {
            const styles = declarations(file, selector);
            expect(`${styles.border ?? ""} ${styles["border-color"] ?? ""}`, selector).toContain("var(--vz-control-border)");
        }
        expect(value(palette(true), "--vz-border")).toContain("0.08");
    });

    it("preserves identifying borders when a prompt chip is hovered or a danger button is idle", () => {
        expect(declarations("workbench.css", ".vz-ds .vz-chip:hover:not(:disabled)")["border-color"]).toBe("var(--vz-focus-color)");
        expect(declarations("controls.css", ".vz-ds .vz-btn--danger")["border-color"]).toBe("var(--vz-danger-text)");
    });

    it("marks selected segments and unchecked switches without relying on low-contrast fills", () => {
        expect(declarations("antd.css", ".vz-ds .ant-segmented .ant-segmented-item-selected")["box-shadow"]).toContain("var(--vz-control-border)");
        expect(declarations("antd.css", ".vz-ds .ant-switch:not(.ant-switch-checked)")["box-shadow"]).toContain("var(--vz-control-border)");
    });
    it("keeps the truly disabled running generator visually active", () => {
        const running = declarations("generate.css", '.vz-ds .vz-gen[data-status="running"]');
        expect(running.opacity).toBe("1");
        expect(running.filter).toBe("none");
    });
    it("gives local toast text an explicit theme color despite the global dark ancestor", () => {
        expect(declarations("antd.css", ".vz-ds .ant-message .ant-message-notice-content").color).toBe("var(--vz-text-1)");
    });

    it("shows the actual spacing, typography and semantic text token contracts", () => {
        const markup = renderToStaticMarkup(createElement(SectionFoundation));
        for (const token of ["--vz-space-1", "--vz-space-16", "--vz-text-size-md", "--vz-leading-body", "--vz-control-border", "--vz-success-text"]) expect(markup).toContain(token);
    });

    it("keeps CSS selectors scoped to the preview", () => {
        for (const file of ["tokens.css", "controls.css", "generate.css", "fields.css", "feedback.css", "workbench.css", "antd.css"])
            css(file).walkRules((rule) => {
                if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
                expect(
                    rule.selectors.every((selector) => selector.startsWith(".vz-ds")),
                    `${file}: ${rule.selector}`,
                ).toBe(true);
            });
    });
});
