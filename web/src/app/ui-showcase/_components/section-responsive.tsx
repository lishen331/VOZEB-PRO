"use client";

import { Segmented } from "antd";
import { Image as ImageIcon, Menu, Sparkles, Upload } from "lucide-react";
import { useState } from "react";

import { VzButton, VzSectionTitle, VzTag } from "@/components/vozeb-ds";

import { IMG } from "./mock-data";

const DEVICES = [
    { key: "390", label: "手机 390", w: 390 },
    { key: "430", label: "手机 430", w: 430 },
    { key: "834", label: "平板 834", w: 834 },
];
const RULES = [
    ["≥ 1280px", "侧栏展开，双栏创作工作区"],
    ["1101–1279px", "侧栏收为图标导航，保留 Tooltip"],
    ["768–1100px", "工作区单栏，控件按可用宽度重排"],
    ["< 768px", "侧栏改为抽屉，生成按钮通栏"],
];

export function SectionResponsive() {
    const [device, setDevice] = useState("390");
    const current = DEVICES.find((item) => item.key === device) ?? DEVICES[0];
    return (
        <section id="vz-sec-responsive" className="vz-panel" style={{ scrollMarginTop: 80 }}>
            <VzSectionTitle eyebrow="Responsive" title="响应式示例" desc="同页容器尺寸示意，展示手机和平板的组件重排；实际响应式效果请直接调整浏览器窗口验收。" />
            <div className="vz-grid" style={{ "--min": "200px", gap: 10, marginBottom: 20 } as React.CSSProperties}>
                {RULES.map(([bp, rule]) => (
                    <div key={bp} className="vz-card" style={{ padding: 14, display: "grid", gap: 4 }}>
                        <VzTag tone="brand" className="vz-num" style={{ justifySelf: "start" }}>
                            {bp}
                        </VzTag>
                        <span className="vz-caption">{rule}</span>
                    </div>
                ))}
            </div>
            <div className="vz-device-selector">
                <Segmented block aria-label="示意设备尺寸" value={device} onChange={(next) => setDevice(String(next))} options={DEVICES.map((item) => ({ value: item.key, label: item.label }))} />
            </div>
            <div className="vz-device-frame" style={{ width: current.w }}>
                <div className="vz-device-sketch" aria-label={`${current.label}工作台尺寸示意`}>
                    <DeviceWorkbench />
                </div>
            </div>
            <p className="vz-caption vz-device-note">{`${current.w}px 目标宽度 · 当可用空间更小时自动收缩，不嵌入页面、不创建业务任务。`}</p>
        </section>
    );
}

function DeviceWorkbench() {
    const [saved, setSaved] = useState(false);

    return (
        <>
            <div className="vz-mini-top">
                <Menu aria-hidden />
                <span>VOZEB Studio</span>
                <VzTag tone="brand">示意</VzTag>
            </div>
            <div className="vz-mini-workspace">
                <div className="vz-mini-panel">
                    <span className="vz-eyebrow">图片创作 · 本地示意</span>
                    <h3 className="vz-h3">把想法变成画面</h3>
                    <div className="vz-mini-model">
                        <Sparkles aria-hidden />
                        <span>视觉模型</span>
                        <VzTag>示例</VzTag>
                    </div>
                    <div className="vz-mini-upload">
                        <Upload aria-hidden />
                        <span>参考素材区域</span>
                        <small>手机端保持大触控区域</small>
                    </div>
                    <label className="vz-field">
                        <span className="vz-field__label">提示词</span>
                        <textarea className="vz-mini-prompt" defaultValue="雨后的城市，温柔的霓虹，电影级光线。" rows={3} aria-label="尺寸示意提示词" />
                    </label>
                    <div className="vz-mini-params">
                        <VzTag tone="brand">16:9</VzTag>
                        <VzTag>高清</VzTag>
                        <VzTag>2 张</VzTag>
                    </div>
                    <VzButton
                        variant="primary"
                        icon={Sparkles}
                        className="vz-mini-generate"
                        onClick={() => {
                            setSaved(true);
                        }}
                    >
                        {saved ? "已预览反馈" : "预览生成反馈"}
                    </VzButton>
                </div>
                <div className="vz-mini-result">
                    <div className="vz-mini-result__head">
                        <ImageIcon aria-hidden />
                        <span>结果预览</span>
                        <VzTag tone="success">示例</VzTag>
                    </div>
                    <img src={IMG.a} alt="尺寸示意：AI 创作示例图片" />
                    <div className="vz-mini-result__foot">
                        <span className="vz-caption">大圆角 · 清晰层级 · 稳定触控</span>
                        <VzTag>16:9</VzTag>
                    </div>
                </div>
            </div>
        </>
    );
}
