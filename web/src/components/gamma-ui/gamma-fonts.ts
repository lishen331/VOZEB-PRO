/*
 * 字体方案候选。woff2 切片与样式表已自托管在 /public/fonts/<dir>，
 * 都按 unicode-range 切片，浏览器只下载页面实际用到的那几片。
 */

export interface GammaFontOption {
    id: string;
    name: string;
    /** 正文字体族（含兜底） */
    body: string;
    /** 标题展示字体族 */
    display: string;
    mood: string;
    note: string;
    /** 该方案需要加载的样式表 */
    sheets: readonly string[];
    license: string;
    recommended?: boolean;
}

const FALLBACK = `"PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;

const SHEET = {
    misans: "/fonts/misans/MiSansVF.min.css",
    inter: "/fonts/inter/wght.css",
    noto: "/fonts/noto-sans-sc/wght.css",
    manrope: "/fonts/manrope/wght.css",
    geist: "/fonts/geist/wght.css",
    geistMono: "/fonts/geist-mono/wght.css",
    smiley: "/fonts/smiley-sans/result.css",
    lxgwRegular: "/fonts/lxgw-wenkai/lxgwwenkai-regular.css",
    lxgwBold: "/fonts/lxgw-wenkai/lxgwwenkai-bold.css",
} as const;

export const GAMMA_MONO_FAMILY = `"Geist Mono Variable", ui-monospace, monospace`;

export const GAMMA_FONT_OPTIONS: readonly GammaFontOption[] = [
    {
        id: "misans",
        name: "MiSans + Inter",
        body: `"MiSans VF", "Inter Variable", ${FALLBACK}`,
        display: `"MiSans VF", "Inter Variable", ${FALLBACK}`,
        mood: "现代 · 克制 · 科技感",
        note: "小米开源的现代黑体，字形干净、字重连续可变，中英混排对齐好。最贴近品牌调性，推荐作为默认。",
        sheets: [SHEET.misans, SHEET.inter, SHEET.geistMono],
        license: "MiSans 字体许可（可免费商用，需保留署名）· Inter OFL-1.1",
        recommended: true,
    },
    {
        id: "misans-smiley",
        name: "得意黑标题 + MiSans 正文",
        body: `"MiSans VF", "Inter Variable", ${FALLBACK}`,
        display: `"Smiley Sans Oblique", "MiSans VF", ${FALLBACK}`,
        mood: "张扬 · 运动 · 海报感",
        note: "标题用得意黑（倾斜、紧凑、冲击力强），正文仍是 MiSans。适合首页大标题和营销位，不建议用在正文。",
        sheets: [SHEET.smiley, SHEET.misans, SHEET.inter, SHEET.geistMono],
        license: "得意黑 OFL-1.1 · MiSans 字体许可",
    },
    {
        id: "noto",
        name: "Noto Sans SC + Geist",
        body: `"Noto Sans SC Variable", ${FALLBACK}`,
        display: `"Geist Variable", "Noto Sans SC Variable", ${FALLBACK}`,
        mood: "中性 · 稳妥 · 可读性优先",
        note: "Google 思源黑体，字符覆盖最全，长段落最耐读；标题配 Geist，偏理性。教育场景的稳妥选择。",
        sheets: [SHEET.noto, SHEET.geist, SHEET.geistMono],
        license: "OFL-1.1，可商用",
    },
    {
        id: "lxgw",
        name: "霞鹜文楷 + Manrope",
        body: `"LXGW WenKai", ${FALLBACK}`,
        display: `"Manrope Variable", "LXGW WenKai", ${FALLBACK}`,
        mood: "书写 · 人文 · 东方感",
        note: "楷体风格开源字体，有手写笔意，适合陶瓷艺术、新中式等东方意象的专题页。字形偏宽，信息密度低一些。",
        sheets: [SHEET.lxgwRegular, SHEET.lxgwBold, SHEET.manrope, SHEET.geistMono],
        license: "OFL-1.1，可商用",
    },
];

export const GAMMA_DEFAULT_FONT_ID = GAMMA_FONT_OPTIONS[0].id;

export function gammaFontById(id: string) {
    return GAMMA_FONT_OPTIONS.find((option) => option.id === id) ?? GAMMA_FONT_OPTIONS[0];
}

/** 已插入过的样式表，避免重复插入 <link> */
const loadedSheets = new Set<string>();

export function loadGammaFontSheets(option: GammaFontOption) {
    if (typeof document === "undefined") return;
    for (const href of option.sheets) {
        if (loadedSheets.has(href)) continue;
        loadedSheets.add(href);
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.append(link);
    }
}
