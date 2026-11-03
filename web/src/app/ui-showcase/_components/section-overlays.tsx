"use client";

import { Drawer, Modal, Popover, Slider, Tooltip } from "antd";
import { CheckCircle2, Info, Layers, PanelRight, Share2, SlidersHorizontal, Trash2, TriangleAlert, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { VzAlert, VzButton, VzIconButton, VzInput, VzProgress, VzSectionTitle, VzTag } from "@/components/vozeb-ds";

import { useShowcase } from "./showcase-context";

export function SectionOverlays() {
    const { getContainer, toast } = useShowcase();
    const timers = useRef({ progress: undefined as number | undefined, confirm: undefined as number | undefined, export: undefined as number | undefined });
    const mounted = useRef(true);
    const linkInput = useRef<HTMLTextAreaElement>(null);
    const [modal, setModal] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [drawer, setDrawer] = useState(false);
    const [popover, setPopover] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressRunning, setProgressRunning] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [opacity, setOpacity] = useState(72);
    const [seed, setSeed] = useState("428193");
    const [negative, setNegative] = useState("");
    const [shareLink, setShareLink] = useState("");
    const [copyError, setCopyError] = useState(false);
    const [savedNote, setSavedNote] = useState("所有浮层与通知均为本地演示，不保存业务数据。");

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            Object.values(timers.current).forEach((timer) => window.clearTimeout(timer));
        };
    }, []);
    const startProgress = () => {
        if (progressRunning) return;
        setProgressRunning(true);
        setProgress(0);
        const step = (next: number) => {
            timers.current.progress = window.setTimeout(() => {
                setProgress(next);
                if (next < 100) step(next + 20);
                else {
                    setProgressRunning(false);
                    toast.success("本地进度演示完成 · 未渲染或上传文件");
                }
            }, 300);
        };
        step(20);
    };
    const stopProgress = () => {
        window.clearTimeout(timers.current.progress);
        setProgressRunning(false);
    };
    const cancelConfirm = () => {
        window.clearTimeout(timers.current.confirm);
        setDeleting(false);
        setConfirm(false);
    };
    const doDelete = () => {
        if (deleting) return;
        setDeleting(true);
        timers.current.confirm = window.setTimeout(() => {
            setDeleting(false);
            setConfirm(false);
            toast.success("删除确认演示完成 · 未删除任何作品");
        }, 900);
    };
    const copyLink = async () => {
        const link = `${window.location.origin}/ui-showcase`;
        setShareLink(link);
        try {
            await navigator.clipboard.writeText(link);
            if (!mounted.current) return;
            setCopyError(false);
            toast.success("样板地址已复制 · 非作品分享链接");
        } catch {
            if (!mounted.current) return;
            setCopyError(true);
            linkInput.current?.focus();
            linkInput.current?.select();
            toast.warning("复制不可用，请在地址框中手动复制");
        }
    };

    return (
        <section id="vz-sec-overlays" className="vz-panel" style={{ scrollMarginTop: 80, display: "grid", gap: 32 }}>
            <div>
                <VzSectionTitle eyebrow="Overlays" title="Modal · Drawer · Popover · Tooltip" desc="玻璃浮层、稳定焦点与明确反馈。这里只演示组件，不创建分享、删除或计费记录。" />
                <div className="vz-row">
                    <VzButton
                        variant="primary"
                        icon={Share2}
                        onClick={() => {
                            setShareLink(`${window.location.origin}/ui-showcase`);
                            setCopyError(false);
                            setModal(true);
                        }}
                    >
                        打开弹窗
                    </VzButton>
                    <VzButton variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>
                        删除确认
                    </VzButton>
                    <VzButton variant="secondary" icon={PanelRight} onClick={() => setDrawer(true)}>
                        打开抽屉
                    </VzButton>
                    <Popover
                        trigger="click"
                        placement="bottom"
                        open={popover}
                        onOpenChange={setPopover}
                        title={<span className="vz-h3">图层设置 · 本地</span>}
                        content={
                            <div className="vz-stack" style={{ width: "min(260px, calc(100vw - 64px))", gap: 10 }}>
                                <span className="vz-caption">调整示例图层的不透明度，不影响业务节点。</span>
                                <Slider value={opacity} onChange={setOpacity} min={0} max={100} ariaLabelForHandle="示例图层不透明度" />
                                <VzProgress label="不透明度" value={opacity} />
                                <VzButton
                                    size="sm"
                                    variant="primary"
                                    onClick={() => {
                                        setPopover(false);
                                        setSavedNote(`示例图层不透明度：${opacity}% · 仅本页有效`);
                                        toast.success("已应用本地图层示例");
                                    }}
                                >
                                    应用
                                </VzButton>
                            </div>
                        }
                    >
                        <VzButton variant="secondary" icon={Layers}>
                            Popover
                        </VzButton>
                    </Popover>
                    <Tooltip title="Tooltip：为操作提供简洁说明">
                        <VzButton variant="ghost" icon={Info} onClick={() => toast.info("Tooltip 支持悬停与键盘聚焦 · 本地说明")}>
                            悬停查看 Tooltip
                        </VzButton>
                    </Tooltip>
                    <VzIconButton icon={SlidersHorizontal} label="图标按钮自带 Tooltip 与 aria-label" variant="secondary" onClick={() => setDrawer(true)} />
                </div>
                <p className="vz-demo-notice" role="status" aria-live="polite">
                    {savedNote}
                </p>
            </div>
            <div>
                <VzSectionTitle eyebrow="Feedback" title="Toast · Progress · 确认反馈" />
                <div className="vz-grid" style={{ "--min": "260px", gap: 20 } as React.CSSProperties}>
                    <div className="vz-stack" style={{ gap: 10 }}>
                        <span className="vz-field__label">Toast</span>
                        <div className="vz-row">
                            <VzButton size="sm" variant="secondary" icon={CheckCircle2} onClick={() => toast.success("成功反馈示例 · 未保存业务数据")}>
                                成功
                            </VzButton>
                            <VzButton size="sm" variant="secondary" icon={TriangleAlert} onClick={() => toast.warning("警告反馈示例 · 非真实余额提醒")}>
                                警告
                            </VzButton>
                            <VzButton size="sm" variant="secondary" icon={XCircle} onClick={() => toast.error("错误反馈示例 · 当前未发生网络请求")}>
                                错误
                            </VzButton>
                            <VzButton
                                size="sm"
                                variant="secondary"
                                loading={exporting}
                                onClick={() => {
                                    if (exporting) return;
                                    setExporting(true);
                                    toast.open({ key: "vz-export-demo", type: "loading", content: "本地加载反馈演示…", duration: 0 });
                                    timers.current.export = window.setTimeout(() => {
                                        setExporting(false);
                                        toast.open({ key: "vz-export-demo", type: "success", content: "演示完成 · 未导出文件", duration: 2 });
                                    }, 1600);
                                }}
                            >
                                加载 → 完成
                            </VzButton>
                        </div>
                    </div>
                    <div className="vz-stack" style={{ gap: 12 }}>
                        <span className="vz-field__label">Progress · 手动触发</span>
                        <div className="vz-row vz-caption vz-num" style={{ justifyContent: "space-between" }}>
                            <span>{progressRunning ? "本地进度演示中" : progress === 100 ? "演示完成" : "等待开始"}</span>
                            <span>{`${progress}%`}</span>
                        </div>
                        <VzProgress label="渲染进度" value={progress} />
                        <div className="vz-row">
                            <VzButton size="sm" variant="secondary" data-progress-start disabled={progressRunning} onClick={startProgress}>
                                {progress === 100 ? "重新演示" : "开始进度演示"}
                            </VzButton>
                            {progressRunning ? (
                                <VzButton size="sm" variant="ghost" onClick={stopProgress}>
                                    停止演示
                                </VzButton>
                            ) : null}
                        </div>
                        <div className="vz-stack" style={{ gap: 4 }}>
                            <span className="vz-caption">不确定进度（运行时演示）</span>
                            <VzProgress label="排队示例" value={0} indeterminate={progressRunning} />
                        </div>
                        <div className="vz-row" style={{ gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 100 }}>
                                <VzProgress label="已完成" value={100} tone="success" />
                            </div>
                            <div style={{ flex: 1, minWidth: 100 }}>
                                <VzProgress label="失败" value={58} tone="danger" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <Modal
                open={modal}
                onCancel={() => setModal(false)}
                getContainer={getContainer}
                title="分享弹窗 · 本地演示"
                width={480}
                centered
                footer={
                    <div className="vz-row" style={{ justifyContent: "flex-end" }}>
                        <VzButton variant="ghost" onClick={() => setModal(false)}>
                            取消
                        </VzButton>
                        <VzButton variant="primary" onClick={copyLink}>
                            复制链接
                        </VzButton>
                    </div>
                }
            >
                <div className="vz-stack" style={{ gap: 14, paddingTop: 8 }}>
                    <span className="vz-body">这里复制当前视觉样板地址，不生成作品分享链接。</span>
                    <label className="vz-field">
                        <span className="vz-field__label">样板地址</span>
                        <textarea ref={linkInput} readOnly rows={2} className="vz-share-link" value={shareLink} aria-label="可手动复制的样板地址" />
                    </label>
                    {copyError ? <VzAlert tone="warning">请选中上方地址，使用系统复制操作。</VzAlert> : <VzAlert tone="info">不会公开作品、提示词或参考素材。</VzAlert>}
                </div>
            </Modal>
            <Modal
                open={confirm}
                onCancel={cancelConfirm}
                getContainer={getContainer}
                width={400}
                centered
                closable={false}
                footer={
                    <div className="vz-row" style={{ justifyContent: "flex-end" }}>
                        <VzButton variant="ghost" onClick={cancelConfirm}>
                            取消
                        </VzButton>
                        <VzButton variant="danger" loading={deleting} onClick={doDelete}>
                            {deleting ? "删除中" : "确认删除"}
                        </VzButton>
                    </div>
                }
            >
                <div className="vz-stack" style={{ gap: 10, justifyItems: "start" }}>
                    <span className="vz-state__icon" style={{ color: "var(--vz-danger)", background: "var(--vz-danger-soft)" }}>
                        <Trash2 aria-hidden />
                    </span>
                    <span className="vz-h2">演示删除确认？</span>
                    <span className="vz-body">仅展示危险操作的确认与加载反馈，不删除任何真实作品。</span>
                </div>
            </Modal>
            <Drawer open={drawer} onClose={() => setDrawer(false)} getContainer={getContainer} title="高级参数 · 本地演示" size={380} placement="right">
                <div className="vz-stack" style={{ gap: 16 }}>
                    <VzInput label="随机种子" value={seed} onChange={(event) => setSeed(event.target.value)} hint="仅保留当前页面的示例值" />
                    <VzInput label="负向提示词" value={negative} onChange={(event) => setNegative(event.target.value)} placeholder="不希望出现的元素" />
                    <div className="vz-row">
                        <VzTag tone="brand">本地示例</VzTag>
                        <VzTag>不保存业务数据</VzTag>
                    </div>
                    <VzButton
                        variant="primary"
                        onClick={() => {
                            setDrawer(false);
                            setSavedNote(`已保留本地参数示例 · 种子 ${seed || "未设置"}${negative ? " · 已填写负向提示词" : ""}`);
                            toast.success("本地参数示例已应用 · 刷新后恢复默认");
                        }}
                    >
                        保存参数
                    </VzButton>
                </div>
            </Drawer>
        </section>
    );
}
