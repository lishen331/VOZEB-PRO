"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Heart } from "lucide-react";

import "@/components/gamma-ui/gamma-tokens.css";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaLogo } from "@/components/gamma-ui/gamma-logo";
import { GammaLightbox, GammaModal, GammaToastStack } from "@/components/gamma-ui/gamma-overlays";
import { GammaRail, GammaSection } from "@/components/gamma-ui/gamma-shell";
import { GammaFontSwitcher, GammaThemeToggle } from "@/components/gamma-ui/gamma-theme";
import { GAMMA_RAIL_ITEMS } from "@/app/bluegamma/gamma-nav";
import { useGammaDemo } from "@/app/bluegamma/use-gamma-demo";
import { DesignCards, DesignMotionSpecs, DesignOverlays } from "@/app/bluegamma/design/design-cards";
import { DesignButtons, DesignControls, DesignMorphIcons } from "@/app/bluegamma/design/design-components";
import { DesignBrand, DesignColors, DesignTypeAndRadius } from "@/app/bluegamma/design/design-foundations";
import { DesignData } from "@/app/bluegamma/design/design-data";
import { DesignFonts } from "@/app/bluegamma/design/design-fonts";
import { DesignGlass } from "@/app/bluegamma/design/design-glass";
import { DesignNavIcons } from "@/app/bluegamma/design/design-icons";
import { DesignInteractions } from "@/app/bluegamma/design/design-interactions";
import { DesignLayout } from "@/app/bluegamma/design/design-layout";
import { DesignForms } from "@/app/bluegamma/design/design-forms";
import { DesignStateSpecs } from "@/app/bluegamma/design/design-state-specs";
import { DesignMorphLab } from "@/app/bluegamma/design/design-morph-lab";
import { DesignAppleMaterial, DesignHeroButtons, DesignStates } from "@/app/bluegamma/design/design-showpieces";
import { GammaMajorTabs } from "@/components/gamma-ui/gamma-major-tabs";
import { cn } from "@/lib/utils";

const TOC = [
    { id: "brand", label: "品牌" },
    { id: "colors", label: "色彩" },
    { id: "fonts", label: "字体方案" },
    { id: "type", label: "字阶与圆角" },
    { id: "layout", label: "布局与栅格" },
    { id: "buttons", label: "按钮" },
    { id: "nav-icons", label: "导航图标" },
    { id: "morph", label: "形变图标" },
    { id: "morph-lab", label: "任意图标形变" },
    { id: "states", label: "状态" },
    { id: "hero-buttons", label: "醒目点击位" },
    { id: "material", label: "苹果风材质" },
    { id: "majors", label: "专业切换" },
    { id: "forms", label: "表单 · 选择 · 上传" },
    { id: "state-specs", label: "状态规范" },
    { id: "controls", label: "表单控件" },
    { id: "data", label: "数据展示" },
    { id: "cards", label: "卡片" },
    { id: "glass", label: "液态玻璃" },
    { id: "overlays", label: "反馈与浮层" },
    { id: "interactions", label: "交互动效" },
    { id: "motion", label: "动效规范" },
];

const SCROLL_ROOT_ID = "gm-design-scroll";

/** 目录高亮跟随滚动 */
function useActiveSection() {
    const [active, setActive] = useState(TOC[0].id);
    useEffect(() => {
        const root = document.getElementById(SCROLL_ROOT_ID);
        if (!root) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
                if (visible) setActive(visible.target.id);
            },
            { root, rootMargin: "-10% 0px -70% 0px" },
        );
        TOC.forEach((item) => {
            const node = document.getElementById(item.id);
            if (node) observer.observe(node);
        });
        return () => observer.disconnect();
    }, []);
    return active;
}

/** 社区 · 设计系统：布鲁伽马全套组件与动效的可交互规范页 */
export function GammaDesignView() {
    const demo = useGammaDemo();
    const { toast } = demo;
    const [modalOpen, setModalOpen] = useState(false);
    const [major, setMajor] = useState("fashion");
    const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);
    const active = useActiveSection();
    const notice = (message: string) => toast("info", message);

    return (
        <>
            <GammaRail
                items={GAMMA_RAIL_ITEMS}
                activeKey="design"
                onSelect={() => notice("该模块的新版页面正在设计中")}
                footer={
                    <>
                        <GammaFontSwitcher />
                        <GammaThemeToggle />
                    </>
                }
            />
            <main id={SCROLL_ROOT_ID} className="gm-scroll relative min-w-0 flex-1 overflow-y-auto scroll-smooth">
                <div aria-hidden className="gm-aurora pointer-events-none absolute -top-32 right-1/4 h-96 w-1/2 rounded-full bg-[var(--gm-blue)] blur-[120px]" style={{ opacity: "var(--gm-aurora-opacity)" }} />
                <div className="relative mx-auto flex max-w-[1360px] gap-10 px-8 pt-10 pb-24">
                    <div className="flex min-w-0 flex-1 flex-col gap-14">
                        <header className="flex flex-col gap-3">
                            <span className="text-xs font-medium tracking-[0.2em] text-[var(--gm-accent)] uppercase">Community · Design System</span>
                            <h1 className="text-[32px] leading-tight font-semibold">
                                布鲁伽马 <span className="gm-gradient-text">Gamma UI</span>
                            </h1>
                            <p className="max-w-2xl text-sm leading-relaxed text-[var(--gm-text-2)]">新版视觉的完整组件与动效规范。所有组件都可以直接点、拖、输入，看到的就是上线后的真实效果。</p>
                            <div className="mt-2 flex gap-2">
                                <GammaButton size="sm" shine confirmOnClick onClick={() => toast("success", "组件目录：src/components/gamma-ui")}>
                                    组件目录
                                </GammaButton>
                                <Link
                                    href="/bluegamma"
                                    className="inline-flex h-8 items-center rounded-[var(--gm-radius-sm)] px-3 text-[13px] font-medium ring-1 ring-[var(--gm-border-strong)] ring-inset transition-colors hover:text-[var(--gm-accent)] hover:ring-[var(--gm-accent)]"
                                >
                                    查看新版首页 →
                                </Link>
                            </div>
                        </header>

                        <GammaSection id="brand" title="品牌" description="Logo 与品牌调性">
                            <DesignBrand />
                        </GammaSection>
                        <GammaSection id="colors" title="色彩" description="点击色块复制色值">
                            <DesignColors />
                        </GammaSection>
                        <GammaSection id="fonts" title="字体方案" description="四套候选，点「应用到预览」即可整站切换">
                            <DesignFonts />
                        </GammaSection>
                        <GammaSection id="type" title="字阶与圆角">
                            <DesignTypeAndRadius />
                        </GammaSection>
                        <GammaSection id="layout" title="布局与栅格" description="五种页面骨架、间距阶梯与断点；排版新页面直接对照">
                            <DesignLayout />
                        </GammaSection>
                        <GammaSection id="buttons" title="按钮" description="参考 Watermelon UI：每个按钮都有按压、水波纹与状态反馈">
                            <DesignButtons onNotice={notice} />
                        </GammaSection>
                        <GammaSection id="nav-icons" title="导航图标" description="自绘品牌图标，点击看选中动效；左侧栏用的就是这一套">
                            <DesignNavIcons />
                        </GammaSection>
                        <GammaSection id="morph" title="形变图标" description="参考 morphicons：线条之间弹簧过渡，而不是硬切">
                            <DesignMorphIcons />
                        </GammaSection>
                        <GammaSection id="morph-lab" title="任意图标形变" description="对照 morphicons：任意两个 lucide 图标之间逐点弹簧插值，可调弹簧、速度、描边">
                            <DesignMorphLab />
                        </GammaSection>
                        <GammaSection id="states" title="状态" description="任务、提交、开关类图标的全部状态；切换都走形变，不硬切">
                            <DesignStates />
                        </GammaSection>
                        <GammaSection id="hero-buttons" title="醒目点击位" description="关键动作专用，一页最多一两个；其余按钮仍用标准按钮">
                            <DesignHeroButtons onNotice={notice} />
                        </GammaSection>
                        <GammaSection id="material" title="苹果风材质" description="连续曲率大圆角、极细高光描边、强模糊高饱和；控制中心 / Dock / 通知 / iOS 开关">
                            <DesignAppleMaterial onNotice={notice} />
                        </GammaSection>
                        <GammaSection id="majors" title="专业切换" description="12 个专业胶囊，选中项是一片滑动的发光玻璃；宽度不够时两端渐隐、出现翻页按钮">
                            <div className="rounded-[var(--gm-radius-xl)] bg-[var(--gm-bg-elevated)] p-4 ring-1 ring-[var(--gm-border)]">
                                <GammaMajorTabs value={major} onChange={setMajor} />
                            </div>
                        </GammaSection>
                        <GammaSection id="forms" title="表单 · 选择器 · 上传" description="以「新建课程」为例：校验时机（碰过才报、提交全报）、聚焦首个错误、字数、多选 / 标签、拖拽 / 粘贴上传与重传">
                            <DesignForms onNotice={notice} />
                        </GammaSection>
                        <GammaSection id="state-specs" title="状态规范" description="空 / 错 / 无权限 / 离线、生成排队与失败退款、积分不足、骨架屏、错误页、极端数据；所有页面直接套用">
                            <DesignStateSpecs onNotice={notice} />
                        </GammaSection>
                        <GammaSection id="controls" title="表单控件">
                            <DesignControls />
                        </GammaSection>
                        <GammaSection id="data" title="数据展示" description="头像、分页、文件、快捷键、骨架屏、时间线与可排序表格">
                            <DesignData />
                        </GammaSection>
                        <GammaSection id="cards" title="卡片" description="专业卡带鼠标聚光与 3D 倾斜；作品卡 hover 浮出「做同款」">
                            <DesignCards points={demo.points} onPreview={setPreview} onToast={toast} />
                        </GammaSection>
                        <GammaSection id="glass" title="液态玻璃" description="压在图片或液态光斑之上才看得出透光；浅色主题下底色自动加厚">
                            <DesignGlass />
                        </GammaSection>
                        <GammaSection id="overlays" title="反馈与浮层">
                            <DesignOverlays onToast={toast} onOpenModal={() => setModalOpen(true)} onPreview={setPreview} />
                        </GammaSection>
                        <GammaSection id="interactions" title="交互动效" description="布局之外的动态行为都在这里，替换组件时需一起带走">
                            <DesignInteractions />
                        </GammaSection>
                        <GammaSection id="motion" title="动效规范" description="统一参数，保证全站手感一致；系统开启「减少动态效果」时自动关闭">
                            <DesignMotionSpecs />
                        </GammaSection>
                    </div>

                    <aside aria-label="本页目录" className="sticky top-10 hidden h-fit w-44 shrink-0 xl:block">
                        <GammaLogo size={28} className="mb-6" />
                        <ul className="flex flex-col border-l border-[var(--gm-border-strong)]">
                            {TOC.map((item) => (
                                <li key={item.id}>
                                    <a
                                        href={`#${item.id}`}
                                        aria-current={active === item.id ? "true" : undefined}
                                        className={cn(
                                            "-ml-px block border-l-2 py-1.5 pl-4 text-[13px] transition-colors",
                                            active === item.id ? "border-[var(--gm-accent)] text-[var(--gm-accent)]" : "border-transparent text-[var(--gm-text-3)] hover:text-[var(--gm-text)]",
                                        )}
                                    >
                                        {item.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </aside>
                </div>
            </main>

            <GammaToastStack toasts={demo.toasts} onDismiss={demo.dismissToast} />
            <GammaLightbox
                src={preview?.src ?? null}
                title={preview?.title}
                onClose={() => setPreview(null)}
                actions={
                    <>
                        <GammaButton size="sm" variant="ghost" icon={<Heart className="size-4" />} onClick={() => toast("success", "已收藏")}>
                            收藏
                        </GammaButton>
                        <GammaButton size="sm" variant="glass" icon={<Download className="size-4" />} onClick={() => toast("success", "已开始下载（演示）")}>
                            下载
                        </GammaButton>
                    </>
                }
            />
            <GammaModal
                open={modalOpen}
                title="发布到灵感广场"
                description="发布后其他创作者可以看到并「做同款」，你可以随时撤回。"
                onClose={() => setModalOpen(false)}
                footer={
                    <>
                        <GammaButton variant="ghost" onClick={() => setModalOpen(false)}>
                            取消
                        </GammaButton>
                        <GammaButton
                            onClick={() => {
                                setModalOpen(false);
                                toast("success", "已发布到灵感广场");
                            }}
                        >
                            确认发布
                        </GammaButton>
                    </>
                }
            />
        </>
    );
}
