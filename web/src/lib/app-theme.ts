import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#171717",
        primaryHover: "#000000",
        primaryText: "#ffffff",
        menuBg: "#f5f5f5",
        menuText: "#171717",
        selectActiveBg: "#f4f5f7",
        selectSelectedBg: "transparent",
        selectText: "#171717",
        selectBorder: "#c9ced5",
        selectOutline: "rgba(32, 36, 42, 0.08)",
        selectShadow: "0 8px 24px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04)",
        tableSelectedBg: "rgba(17, 17, 17, 0.05)",
        tableSelectedHoverBg: "rgba(17, 17, 17, 0.08)",
        layoutBg: "#fafbfc",
        containerBg: "#ffffff",
        border: "#e5e8ec",
        text: "#20242a",
        textSecondary: "#697381",
    },
    dark: {
        primary: "#fafafa",
        primaryHover: "#ffffff",
        primaryText: "#171717",
        menuBg: "#262626",
        menuText: "#fafafa",
        selectActiveBg: "#262b31",
        selectSelectedBg: "transparent",
        selectText: "#fafafa",
        selectBorder: "#464c55",
        selectOutline: "rgba(255, 255, 255, 0.08)",
        selectShadow: "0 12px 28px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.18)",
        tableSelectedBg: "rgba(255, 255, 255, 0.08)",
        tableSelectedHoverBg: "rgba(255, 255, 255, 0.12)",
        layoutBg: "#111316",
        containerBg: "#181b20",
        border: "#2b3037",
        text: "#f3f5f7",
        textSecondary: "#9aa3af",
    },
};

/*
 * 布鲁伽马品牌色（与 components/gamma-ui/gamma-tokens.css 同源）。
 * 画布编辑器不走品牌主题，仍用上面的 neutral，保持定稿 UI。
 */
const gamma = {
    light: {
        primary: "#0050f5",
        primaryHover: "#1663ff",
        primaryText: "#ffffff",
        menuBg: "rgba(0, 80, 245, 0.08)",
        menuText: "#0050f5",
        selectActiveBg: "rgba(16, 38, 84, 0.05)",
        selectSelectedBg: "transparent",
        selectText: "#0b1530",
        selectBorder: "rgba(0, 80, 245, 0.45)",
        selectOutline: "rgba(0, 80, 245, 0.12)",
        selectShadow: "0 12px 32px rgba(16, 38, 84, 0.12), 0 2px 6px rgba(16, 38, 84, 0.05)",
        tableSelectedBg: "rgba(0, 80, 245, 0.06)",
        tableSelectedHoverBg: "rgba(0, 80, 245, 0.1)",
        layoutBg: "#f3f6fb",
        containerBg: "#ffffff",
        elevatedBg: "#ffffff",
        border: "rgba(16, 38, 84, 0.14)",
        borderSecondary: "rgba(16, 38, 84, 0.08)",
        text: "#0b1530",
        textSecondary: "#46526e",
        link: "#0047d9",
        success: "#0f9f63",
        warning: "#b86e00",
        error: "#e5294b",
    },
    dark: {
        primary: "#0050f5",
        primaryHover: "#1663ff",
        primaryText: "#ffffff",
        menuBg: "rgba(40, 235, 250, 0.12)",
        menuText: "#28ebfa",
        selectActiveBg: "rgba(255, 255, 255, 0.06)",
        selectSelectedBg: "transparent",
        selectText: "#f1f5ff",
        selectBorder: "rgba(40, 235, 250, 0.45)",
        selectOutline: "rgba(40, 235, 250, 0.12)",
        selectShadow: "0 16px 40px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)",
        tableSelectedBg: "rgba(40, 235, 250, 0.08)",
        tableSelectedHoverBg: "rgba(40, 235, 250, 0.12)",
        layoutBg: "#04060c",
        containerBg: "#0d121e",
        elevatedBg: "#131a29",
        border: "rgba(140, 175, 255, 0.16)",
        borderSecondary: "rgba(140, 175, 255, 0.08)",
        text: "#f1f5ff",
        textSecondary: "#9ba8c4",
        link: "#6a9dff",
        success: "#23d18b",
        warning: "#ffb547",
        error: "#ff4d6d",
    },
};

const GAMMA_FONT_FAMILY = `"MiSans VF", "Inter Variable", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;

function brandTokens(dark: boolean): ThemeConfig["token"] {
    const color = dark ? gamma.dark : gamma.light;
    return {
        colorLink: color.link,
        colorBgElevated: color.elevatedBg,
        colorBorderSecondary: color.borderSecondary,
        colorSuccess: color.success,
        colorWarning: color.warning,
        colorError: color.error,
        fontFamily: GAMMA_FONT_FAMILY,
        borderRadius: 10,
        borderRadiusLG: 14,
    };
}

/**
 * 布鲁伽马的 antd 组件皮肤：对齐 gamma-ui 的按钮、分段、标签页、开关、浮层。
 * 渐变、玻璃这类 token 表达不了的部分在 app/styles/global-gamma-skin.css（html.gm-app 作用域）。
 */
function brandComponents(dark: boolean): ThemeConfig["components"] {
    const color = dark ? gamma.dark : gamma.light;
    const accent = dark ? "#28ebfa" : "#0050f5";
    const accentSoft = dark ? "rgba(40, 235, 250, 0.12)" : "rgba(0, 80, 245, 0.08)";
    const wash = dark ? "rgba(255, 255, 255, 0.04)" : "rgba(16, 38, 84, 0.04)";
    const washStrong = dark ? "rgba(255, 255, 255, 0.08)" : "rgba(16, 38, 84, 0.07)";
    const surface2 = dark ? "#131a29" : "#f6f8fc";
    const surface3 = dark ? "#1b2335" : "#e8eef8";
    return {
        Button: {
            primaryShadow: "none",
            defaultShadow: "none",
            dangerShadow: "none",
            fontWeight: 500,
            defaultBg: "transparent",
            defaultBorderColor: color.border,
            defaultColor: color.text,
            defaultHoverBg: washStrong,
            defaultHoverBorderColor: accent,
            defaultHoverColor: accent,
            textHoverBg: washStrong,
            borderRadius: 10,
            borderRadiusLG: 12,
            borderRadiusSM: 8,
        },
        Segmented: {
            trackBg: surface2,
            trackPadding: 3,
            itemColor: color.textSecondary,
            itemHoverColor: color.text,
            itemHoverBg: wash,
            itemSelectedBg: surface3,
            itemSelectedColor: color.text,
            itemActiveBg: washStrong,
            borderRadius: 10,
            borderRadiusSM: 8,
        },
        Tabs: {
            inkBarColor: accent,
            itemColor: color.textSecondary,
            itemHoverColor: color.text,
            itemSelectedColor: color.text,
            itemActiveColor: accent,
        },
        Switch: {
            colorPrimary: "#0050f5",
            colorPrimaryHover: "#1663ff",
        },
        Checkbox: {
            borderRadiusSM: 5,
        },
        Input: {
            activeBorderColor: accent,
            hoverBorderColor: color.border,
            activeShadow: `0 0 0 4px ${accentSoft}`,
            borderRadius: 10,
        },
        InputNumber: {
            activeBorderColor: accent,
            activeShadow: `0 0 0 4px ${accentSoft}`,
            borderRadius: 10,
        },
        Modal: {
            contentBg: color.containerBg,
            headerBg: "transparent",
            footerBg: "transparent",
            titleFontSize: 18,
            borderRadiusLG: 22,
        },
        Drawer: {
            colorBgElevated: color.elevatedBg,
        },
        Popover: {
            borderRadiusLG: 14,
        },
        Dropdown: {
            borderRadiusLG: 12,
            controlItemBgHover: washStrong,
        },
        Tooltip: {
            colorBgSpotlight: dark ? "#eef4ff" : "#0b1530",
            colorTextLightSolid: dark ? "#0b1530" : "#f1f5ff",
            borderRadius: 8,
        },
        Tag: {
            defaultBg: wash,
            defaultColor: color.textSecondary,
            borderRadiusSM: 999,
        },
        Pagination: {
            itemActiveBg: accentSoft,
            itemActiveColor: accent,
            itemActiveColorHover: accent,
            borderRadius: 8,
        },
        Table: {
            headerBg: surface2,
            headerColor: color.textSecondary,
            headerSplitColor: "transparent",
            rowHoverBg: wash,
            borderColor: color.borderSecondary,
            headerBorderRadius: 14,
        },
        Message: {
            contentBg: surface2,
            borderRadiusLG: 999,
        },
        Menu: {
            itemActiveBg: color.menuBg,
            itemHoverBg: washStrong,
            itemSelectedBg: color.menuBg,
            itemSelectedColor: color.menuText,
            itemBorderRadius: 10,
        },
    };
}

/** brand=true 时用布鲁伽马品牌主题；默认（画布编辑器）保持原中性主题 */
export function getAntThemeConfig(dark: boolean, options: { brand?: boolean } = {}): ThemeConfig {
    const brand = options.brand === true;
    const color = brand ? (dark ? gamma.dark : gamma.light) : dark ? neutral.dark : neutral.light;

    const base: ThemeConfig = {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: `${brand ? "bluegamma" : "vozeb-pro"}-${dark ? "dark" : "light"}` },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            colorBgLayout: color.layoutBg,
            colorBgContainer: color.containerBg,
            colorBorder: color.border,
            colorText: color.text,
            colorTextSecondary: color.textSecondary,
            borderRadius: 8,
            ...(brand ? brandTokens(dark) : {}),
        },
        components: {
            Button: {
                primaryShadow: "none",
            },
            Menu: {
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.menuText,
                darkItemHoverBg: neutral.dark.menuBg,
                darkItemSelectedBg: neutral.dark.menuBg,
                darkItemSelectedColor: neutral.dark.menuText,
            },
            Select: {
                activeBorderColor: color.selectBorder,
                activeOutlineColor: color.selectOutline,
                borderRadiusLG: 8,
                borderRadiusSM: 6,
                boxShadowSecondary: color.selectShadow,
                controlItemBgActiveHover: color.selectSelectedBg,
                hoverBorderColor: color.selectBorder,
                optionActiveBg: color.selectActiveBg,
                optionHeight: 32,
                optionPadding: "5px 10px",
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
                optionSelectedFontWeight: 400,
            },
            Cascader: {
                borderRadiusLG: 8,
                borderRadiusSM: 6,
                boxShadowSecondary: color.selectShadow,
                controlItemBgHover: color.selectActiveBg,
                optionPadding: "5px 10px",
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
                optionSelectedFontWeight: 400,
            },
            TreeSelect: {
                borderRadiusLG: 8,
                borderRadiusSM: 6,
                boxShadowSecondary: color.selectShadow,
                nodeHoverBg: color.selectActiveBg,
                nodeHoverColor: color.selectText,
                nodeSelectedBg: color.selectSelectedBg,
                nodeSelectedColor: color.selectText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
    if (!brand) return base;
    // 品牌组件皮肤逐个组件合并进基础配置（同名组件的已有字段保留，品牌字段覆盖）
    const extra = brandComponents(dark) || {};
    const components: NonNullable<ThemeConfig["components"]> = { ...base.components };
    for (const key of Object.keys(extra) as (keyof typeof extra)[]) {
        components[key] = { ...(components[key] as object), ...(extra[key] as object) } as never;
    }
    return { ...base, components };
}
