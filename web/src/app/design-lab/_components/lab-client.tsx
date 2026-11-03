"use client";

import { ConfigProvider, Drawer, message } from "antd";
import { Bell, Clapperboard, FolderOpen, Image as ImageIcon, LayoutGrid, Layers, Menu, Moon, Music, Palette, Plus, Smartphone, Sparkles, Sun } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { LabButton, LabIconButton, LabProgress, LabSearch, LabTag } from "@/components/vz-lab";
import { getVzLabAntTheme } from "@/lib/vz-lab-theme";

import { LabCtx } from "./lab-context";
import { SectionCards } from "./section-cards";
import { SectionControls } from "./section-controls";
import { SectionFoundation } from "./section-foundation";
import { SectionOverlays } from "./section-overlays";
import { SectionResponsive } from "./section-responsive";
import { SectionWorkflow } from "./section-workflow";

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
            { id: "cards", label: "卡片与媒体", icon: FolderOpen },
            { id: "overlays", label: "浮层与反馈", icon: Layers },
            { id: "responsive", label: "响应式", icon: Smartphone },
        ],
    },
];
const TARGET: Record<string, string> = { video: "cards", audio: "cards" };

function SideNav({ active, onNavigate }: { active: string; onNavigate: (id: string) => void }) {
    return (
        <>
            <div className="vzl-brand">
                <span className="vzl-brand__mark">
                    <Sparkles aria-hidden />
                </span>
                <span>VOZEB Studio</span>
            </div>
            <nav aria-label="工作区导航" style={{ display: "grid", gap: 2, width: "100%", justifyItems: "center" }}>
                {NAV.map((group) => (
                    <div key={group.group} style={{ display: "grid", gap: 2, width: "100%", justifyItems: "center" }}>
                        <span className="vzl-nav-group vzl-eyebrow" style={{ justifySelf: "stretch" }}>
                            {group.group}
                        </span>
                        {group.items.map((item) => (
                            <button key={item.id} type="button" className="vzl-nav" aria-current={active === item.id ? "page" : undefined} aria-label={item.label} title={item.label} onClick={() => onNavigate(item.id)}>
                                <item.icon aria-hidden />
                                <span>{item.label}</span>
                                {item.tag ? <LabTag tone="accent">{item.tag}</LabTag> : null}
                            </button>
                        ))}
                    </div>
                ))}
            </nav>
            <div className="vzl-quota">
                <div className="vzl-row vzl-between">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>积分余额</span>
                    <span className="vzl-caption vzl-num">2,480 / 5,000</span>
                </div>
                <LabProgress label="积分余额" value={49.6} />
                <LabButton size="sm" icon={Plus}>
                    充值积分
                </LabButton>
            </div>
        </>
    );
}

export function LabClient() {
    const root = useRef<HTMLDivElement>(null);
    const [dark, setDark] = useState(true);
    const [active, setActive] = useState("workflow");
    const [navOpen, setNavOpen] = useState(false);
    const getContainer = useCallback(() => root.current ?? document.body, []);
    const [toast, holder] = message.useMessage({ getContainer, top: 72, maxCount: 3 });
    const ctx = useMemo(() => ({ getContainer, toast }), [getContainer, toast]);

    const navigate = (id: string) => {
        setActive(id);
        setNavOpen(false);
        document.getElementById(`vzl-sec-${TARGET[id] ?? id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <ConfigProvider theme={getVzLabAntTheme(dark)} getPopupContainer={getContainer}>
            <LabCtx.Provider value={ctx}>
                <div ref={root} className="vzl" data-vzl-theme={dark ? "dark" : "light"}>
                    {holder}
                    <div className="vzl-shell">
                        <aside className="vzl-side vzl-glass" aria-label="侧边栏">
                            <SideNav active={active} onNavigate={navigate} />
                        </aside>
                        <div className="vzl-main">
                            <header className="vzl-top vzl-glass">
                                <LabIconButton className="vzl-menu-btn" icon={Menu} label="打开导航" onClick={() => setNavOpen(true)} />
                                <span className="vzl-h3" style={{ whiteSpace: "nowrap" }}>
                                    Design Lab
                                </span>
                                <LabTag tone="brand" className="vzl-hide-sm">
                                    视觉样板 v0.1
                                </LabTag>
                                <div className="vzl-top__search">
                                    <LabSearch placeholder="搜索作品、素材、提示词" aria-label="全局搜索" />
                                </div>
                                <div className="vzl-top__actions">
                                    <LabIconButton icon={dark ? Sun : Moon} label={dark ? "切换到浅色" : "切换到深色"} onClick={() => setDark((v) => !v)} />
                                    <LabIconButton icon={Bell} label="通知" className="vzl-hide-sm" />
                                    <span className="vzl-avatar" role="img" aria-label="当前用户">
                                        VZ
                                    </span>
                                </div>
                            </header>
                            <main className="vzl-content">
                                <SectionWorkflow />
                                <SectionFoundation />
                                <SectionControls />
                                <SectionCards />
                                <SectionOverlays />
                                <SectionResponsive />
                            </main>
                        </div>
                    </div>
                    <Drawer open={navOpen} onClose={() => setNavOpen(false)} placement="left" size={280} getContainer={getContainer} closable={false} styles={{ body: { padding: "16px 12px", display: "flex", flexDirection: "column" } }}>
                        <SideNav active={active} onNavigate={navigate} />
                    </Drawer>
                </div>
            </LabCtx.Provider>
        </ConfigProvider>
    );
}
