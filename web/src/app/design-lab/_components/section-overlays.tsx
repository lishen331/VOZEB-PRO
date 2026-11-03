"use client";

import { Drawer, Modal, Popover, Tooltip } from "antd";
import { CheckCircle2, Info, Layers, PanelRight, Share2, SlidersHorizontal, Trash2, TriangleAlert, XCircle } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import { LabAlert, LabButton, LabIconButton, LabInput, LabProgress, LabSectionTitle, LabTag } from "@/components/vz-lab";

import { useLab } from "./lab-context";

export function SectionOverlays() {
    const { getContainer, toast } = useLab();
    const [modal, setModal] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [drawer, setDrawer] = useState(false);
    const [progress, setProgress] = useState(32);
    const deleteTimer = useRef<number | undefined>(undefined);

    useEffect(() => {
        const id = window.setInterval(() => setProgress((p) => (p >= 100 ? 8 : p + 4)), 600);
        return () => {
            window.clearInterval(id);
            window.clearTimeout(deleteTimer.current);
        };
    }, []);

    const doDelete = () => {
        setDeleting(true);
        deleteTimer.current = window.setTimeout(() => {
            setDeleting(false);
            setConfirm(false);
            toast.success("已删除 3 个作品（本地演示），可在回收站恢复");
        }, 900);
    };

    return (
        <section id="vzl-sec-overlays" className="vzl-panel" style={{ scrollMarginTop: 80, display: "grid", gap: 32 }}>
            <div>
                <LabSectionTitle eyebrow="Overlays" title="Modal · Drawer · Popover · Tooltip" desc="浮层统一使用毛玻璃、大圆角、深阴影，遮罩带轻度模糊。" />
                <div className="vzl-row">
                    <LabButton variant="primary" icon={Share2} onClick={() => setModal(true)}>
                        打开弹窗
                    </LabButton>
                    <LabButton variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>
                        删除确认
                    </LabButton>
                    <LabButton icon={PanelRight} onClick={() => setDrawer(true)}>
                        打开抽屉
                    </LabButton>
                    <Popover
                        trigger="click"
                        placement="bottom"
                        title={<span className="vzl-h3">图层设置</span>}
                        content={
                            <div className="vzl-stack" style={{ width: "min(260px, calc(100vw - 64px))", gap: 10 }}>
                                <span className="vzl-caption">调整当前节点的不透明度。</span>
                                <LabProgress label="不透明度" value={72} />
                                <div className="vzl-row" style={{ justifyContent: "flex-end" }}>
                                    <LabButton size="sm" variant="primary">
                                        应用
                                    </LabButton>
                                </div>
                            </div>
                        }
                    >
                        <LabButton icon={Layers}>Popover</LabButton>
                    </Popover>
                    <Tooltip title="快捷键 ⌘ + /">
                        <LabButton variant="ghost" icon={Info}>
                            悬停查看 Tooltip
                        </LabButton>
                    </Tooltip>
                    <LabIconButton icon={SlidersHorizontal} label="图标按钮自带 Tooltip 与 aria-label" variant="secondary" />
                </div>
            </div>

            <div>
                <LabSectionTitle eyebrow="Feedback" title="Toast · Progress · 确认反馈" />
                <div className="vzl-grid" style={{ "--min": "260px", gap: 20 } as CSSProperties}>
                    <div className="vzl-stack" style={{ gap: 10 }}>
                        <span className="vzl-field__label">Toast</span>
                        <div className="vzl-row">
                            <LabButton size="sm" icon={CheckCircle2} onClick={() => toast.success("已保存到我的作品")}>
                                成功
                            </LabButton>
                            <LabButton size="sm" icon={TriangleAlert} onClick={() => toast.warning("积分余额不足 100")}>
                                警告
                            </LabButton>
                            <LabButton size="sm" icon={XCircle} onClick={() => toast.error("网络异常，请重试")}>
                                错误
                            </LabButton>
                            <LabButton
                                size="sm"
                                onClick={() => {
                                    toast.open({ key: "vzl-load", type: "loading", content: "正在导出 4K 视频…", duration: 0 });
                                    window.setTimeout(() => toast.open({ key: "vzl-load", type: "success", content: "导出完成", duration: 2 }), 1600);
                                }}
                            >
                                加载 → 完成
                            </LabButton>
                        </div>
                    </div>
                    <div className="vzl-stack" style={{ gap: 12 }}>
                        <span className="vzl-field__label">Progress</span>
                        <div className="vzl-stack" style={{ gap: 4 }}>
                            <div className="vzl-row vzl-between vzl-caption vzl-num">
                                <span>渲染中</span>
                                <span>{`${progress}%`}</span>
                            </div>
                            <LabProgress label="渲染进度" value={progress} />
                        </div>
                        <div className="vzl-stack" style={{ gap: 4 }}>
                            <span className="vzl-caption">排队（不确定进度）</span>
                            <LabProgress label="排队中" indeterminate />
                        </div>
                        <div className="vzl-row" style={{ gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 100 }}>
                                <LabProgress label="已完成" value={100} tone="success" />
                            </div>
                            <div style={{ flex: 1, minWidth: 100 }}>
                                <LabProgress label="失败" value={58} tone="danger" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Modal
                open={modal}
                onCancel={() => setModal(false)}
                getContainer={getContainer}
                title="分享作品"
                width={480}
                centered
                footer={
                    <div className="vzl-row" style={{ justifyContent: "flex-end" }}>
                        <LabButton variant="ghost" onClick={() => setModal(false)}>
                            取消
                        </LabButton>
                        <LabButton
                            variant="primary"
                            onClick={() => {
                                setModal(false);
                                toast.success("分享链接已复制（演示）");
                            }}
                        >
                            复制链接
                        </LabButton>
                    </div>
                }
            >
                <div className="vzl-stack" style={{ gap: 14, paddingTop: 8 }}>
                    <span className="vzl-body">生成一个只读链接，任何人都可以查看该作品。</span>
                    <LabInput label="链接有效期" defaultValue="7 天" />
                    <LabAlert tone="info">分享不会公开你的提示词和参考素材。</LabAlert>
                </div>
            </Modal>

            <Modal
                open={confirm}
                onCancel={() => !deleting && setConfirm(false)}
                getContainer={getContainer}
                width={400}
                centered
                closable={false}
                footer={
                    <div className="vzl-row" style={{ justifyContent: "flex-end" }}>
                        <LabButton variant="ghost" disabled={deleting} onClick={() => setConfirm(false)}>
                            取消
                        </LabButton>
                        <LabButton variant="danger" loading={deleting} onClick={doDelete}>
                            {deleting ? "删除中" : "确认删除"}
                        </LabButton>
                    </div>
                }
            >
                <div className="vzl-stack" style={{ gap: 10, justifyItems: "start" }}>
                    <span className="vzl-state__icon" style={{ color: "var(--vzl-danger)", background: "var(--vzl-danger-soft)" }}>
                        <Trash2 aria-hidden />
                    </span>
                    <span className="vzl-h2">删除 3 个作品？</span>
                    <span className="vzl-body">作品会移入回收站，30 天后永久删除。</span>
                </div>
            </Modal>

            <Drawer open={drawer} onClose={() => setDrawer(false)} getContainer={getContainer} title="高级参数" size={380} placement="right">
                <div className="vzl-stack" style={{ gap: 16 }}>
                    <LabInput label="随机种子" defaultValue="428193" hint="固定种子可复现结果" />
                    <LabInput label="负向提示词" placeholder="不希望出现的元素" />
                    <div className="vzl-row">
                        <LabTag tone="brand">实验功能</LabTag>
                        <LabTag>需要 Pro</LabTag>
                    </div>
                    <LabButton variant="primary" onClick={() => setDrawer(false)}>
                        保存参数
                    </LabButton>
                </div>
            </Drawer>
        </section>
    );
}
