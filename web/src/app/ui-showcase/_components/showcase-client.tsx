"use client";

import { ConfigProvider, Drawer, message } from "antd";
import { Bell, Clapperboard, FolderOpen, Image as ImageIcon, LayoutGrid, Menu, Moon, Music, Palette, Plus, Settings, Sparkles, Sun, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { VzButton, VzIconButton, VzProgress, VzSearch, VzTag } from "@/components/vozeb-ds";
import { getVozebDsAntTheme } from "@/lib/vozeb-ds-theme";

import { SectionCards } from "./section-cards";
import { SectionControls } from "./section-controls";
import { SectionFoundation } from "./section-foundation";
import { SectionOverlays } from "./section-overlays";
import { SectionResponsive } from "./section-responsive";
import { SectionWorkflow } from "./section-workflow";
import { ShowcaseCtx } from "./showcase-context";

const NAV = [
    {
        group: "创作",
        items: [
            { id: "workflow", label: "图片创作", icon: ImageIcon },
            { id: "video", label: "视频创作", icon: Clapperboard, tag: "新" },
            { id: "audio", label: "配音与音乐", icon: Music },
        ],
    },
    {
        group: "设计系统",
        items: [
            { id: "foundation", label: "基础 Token", icon: Palette },
            { id: "controls", label: "控件与状态", icon: LayoutGrid },
            { id: "responsive", label: "响应式", icon: Wand2 },
        ],
    },
    {
        group: "资源",
        items: [
            { id: "assets", label: "我的素材", icon: FolderOpen },
            { id: "settings", label: "设置", icon: Settings },
        ],
    },
];
const SECTION_ALIASES: Record<string, string> = { video: "cards", audio: "cards", assets: "cards", settings: "foundation" };
const SEARCH_SECTIONS = [
    { id: "workflow", label: "创作工作台", words: ["图片", "创作", "提示词", "模型", "生成"] },
    { id: "cards", label: "卡片与媒体结果", words: ["视频", "音频", "音乐", "素材", "结果", "卡片"] },
    { id: "foundation", label: "基础 Token", words: ["设置", "主题", "基础", "颜色", "token"] },
    { id: "controls", label: "控件与状态", words: ["控件", "按钮", "输入", "选择"] },
    { id: "overlays", label: "浮层与反馈", words: ["弹窗", "通知", "浮层", "反馈", "分享"] },
    { id: "responsive", label: "响应式示例", words: ["手机", "平板", "响应", "设备", "尺寸"] },
];

function SideNav({ active, onNavigate, onQuota }: { active: string; onNavigate: (id: string) => void; onQuota: () => void }) {
    return (
        <>
            <div className="vz-brand">
                <span className="vz-brand__mark">
                    <Sparkles aria-hidden />
                </span>
                <span>VOZEB Studio</span>
            </div>
            <nav aria-label="工作区导航" style={{ display: "grid", gap: 2, width: "100%" }}>
                {NAV.map((group) => (
                    <div key={group.group} style={{ display: "grid", gap: 2, justifyItems: "center" }}>
                        <span className="vz-nav-group vz-eyebrow" style={{ justifySelf: "stretch" }}>
                            {group.group}
                        </span>
                        {group.items.map((item) => (
                            <button key={item.id} type="button" className="vz-nav-item" aria-current={active === item.id ? "page" : undefined} aria-label={item.label} title={item.label} onClick={() => onNavigate(item.id)}>
                                <item.icon aria-hidden />
                                <span>{item.label}</span>
                                {item.tag ? <VzTag tone="accent">{item.tag}</VzTag> : null}
                            </button>
                        ))}
                    </div>
                ))}
            </nav>
            <div className="vz-side__foot" style={{ width: "100%" }}>
                <div className="vz-quota">
                    <div className="vz-row" style={{ justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>示例配额</span>
                        <span className="vz-caption vz-num">49.6%</span>
                    </div>
                    <VzProgress label="示例配额 · 非真实余额" value={49.6} />
                    <span className="vz-caption">仅用于展示样式，不读取账户余额。</span>
                    <VzButton size="sm" variant="secondary" icon={Plus} onClick={onQuota}>
                        查看配额样式
                    </VzButton>
                </div>
            </div>
        </>
    );
}

export function ShowcaseClient() {
    const rootRef = useRef<HTMLDivElement>(null);
    const [dark, setDark] = useState(true);
    const [active, setActive] = useState("workflow");
    const [navOpen, setNavOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [notice, setNotice] = useState("独立视觉样板 · 本地 Mock，不连接业务账户或生成接口");
    const getContainer = useCallback(() => rootRef.current ?? document.body, []);
    const [toast, toastHolder] = message.useMessage({ getContainer, top: 72, maxCount: 4 });
    const ctx = useMemo(() => ({ getContainer, toast, dark }), [getContainer, toast, dark]);
    useEffect(() => {
        const focusSearch = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                rootRef.current?.querySelector<HTMLInputElement>('input[aria-label="全局搜索"]')?.focus();
            }
        };
        window.addEventListener("keydown", focusSearch);
        return () => window.removeEventListener("keydown", focusSearch);
    }, []);
    const navigate = (id: string) => {
        setActive(id);
        setNavOpen(false);
        document.getElementById(`vz-sec-${SECTION_ALIASES[id] ?? id}`)?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    };
    const quota = () => {
        navigate("settings");
        setNotice("当前为示例配额，不提供充值或读取真实积分。");
        toast.info("配额样式演示 · 不发起支付或充值");
    };
    const searchLocal = () => {
        const term = search.trim().toLocaleLowerCase();
        if (!term) {
            toast.info("输入组件名称后按 Enter，例如：模型、按钮、手机。");
            return;
        }
        const match = SEARCH_SECTIONS.find((section) => section.words.some((word) => word.includes(term) || term.includes(word)));
        if (match) {
            navigate(match.id);
            setNotice(`本地搜索：已定位「${match.label}」`);
            toast.info(`已定位${match.label} · 仅搜索当前样板`);
        } else {
            setNotice(`本地样板未匹配「${search.trim()}」，可试试：模型、按钮、手机。`);
            toast.info("未找到对应组件，可试试：模型、按钮、手机。");
        }
    };
    return (
        <ConfigProvider theme={getVozebDsAntTheme(dark)} getPopupContainer={getContainer}>
            <ShowcaseCtx.Provider value={ctx}>
                <div ref={rootRef} className="vz-ds" data-vz-theme={dark ? "dark" : "light"}>
                    {toastHolder}
                    <div className="vz-shell">
                        <aside className="vz-side vz-glass" aria-label="侧边栏">
                            <SideNav active={active} onNavigate={navigate} onQuota={quota} />
                        </aside>
                        <div className="vz-main">
                            <header className="vz-top vz-glass">
                                <VzIconButton className="vz-menu-btn" icon={Menu} label="打开导航" onClick={() => setNavOpen(true)} />
                                <span className="vz-h3" style={{ whiteSpace: "nowrap" }}>
                                    VOZEB Studio
                                </span>
                                <VzTag tone="brand" className="vz-hide-sm">
                                    Preview v0.1
                                </VzTag>
                                <div className="vz-top__search" style={{ marginLeft: 12 }}>
                                    <VzSearch
                                        placeholder="搜索组件，按 Enter 定位"
                                        aria-label="全局搜索"
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" && !event.nativeEvent.isComposing) searchLocal();
                                        }}
                                    />
                                </div>
                                <div className="vz-top__actions">
                                    <VzIconButton icon={dark ? Sun : Moon} label={dark ? "切换到浅色" : "切换到深色"} onClick={() => setDark((value) => !value)} />
                                    <VzIconButton
                                        icon={Bell}
                                        label="通知"
                                        className="vz-hide-sm"
                                        onClick={() => {
                                            setNotice("本地通知：视觉组件已准备就绪，没有读取真实消息。");
                                            toast.info("本地通知示例：视觉组件已准备就绪");
                                        }}
                                    />
                                    <span className="vz-avatar" aria-label="演示账户" title="演示账户 · 未读取真实用户">
                                        VZ
                                    </span>
                                </div>
                            </header>
                            <main className="vz-content">
                                <div className="vz-preview-note" role="status" aria-live="polite">
                                    <span className="vz-preview-note__dot" aria-hidden />
                                    <span>{notice}</span>
                                    <VzTag tone="brand">LOCAL PREVIEW</VzTag>
                                </div>
                                <SectionWorkflow />
                                <SectionFoundation />
                                <SectionControls />
                                <SectionCards />
                                <SectionOverlays />
                                <SectionResponsive />
                            </main>
                        </div>
                    </div>
                    <Drawer open={navOpen} onClose={() => setNavOpen(false)} placement="left" size={280} getContainer={getContainer} title={null} closable={false} styles={{ body: { padding: "16px 12px", display: "flex", flexDirection: "column" } }}>
                        <SideNav active={active} onNavigate={navigate} onQuota={quota} />
                    </Drawer>
                </div>
            </ShowcaseCtx.Provider>
        </ConfigProvider>
    );
}
