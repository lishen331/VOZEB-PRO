"use client";

import { Checkbox, Segmented, Select, Switch, Tabs } from "antd";
import { Copy, Heart, Mail, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import type { VzForceState } from "@/components/vozeb-ds";
import { VzAlert, VzButton, VzIconButton, VzInput, VzModelTag, VzSearch, VzSectionTitle, VzStatusBadge, VzTag, VzTextarea } from "@/components/vozeb-ds";

const STATES: { key: string; force?: VzForceState; disabled?: boolean; loading?: boolean; selected?: boolean }[] = [
    { key: "Default" },
    { key: "Hover", force: "hover" },
    { key: "Active", force: "active" },
    { key: "Focus", force: "focus" },
    { key: "Disabled", disabled: true },
    { key: "Loading", loading: true },
    { key: "Selected", selected: true },
];

const VARIANTS = [
    { variant: "primary", label: "主按钮" },
    { variant: "secondary", label: "次按钮" },
    { variant: "ghost", label: "幽灵" },
    { variant: "link", label: "文字" },
    { variant: "danger", label: "危险" },
] as const;

export function SectionControls() {
    const [text, setText] = useState("一只在月光下奔跑的白狐");
    const [seg, setSeg] = useState<string | number>("图片");
    const [toggle, setToggle] = useState(true);
    const [fav, setFav] = useState(true);
    const [notice, setNotice] = useState("交互演示仅作用于本页，不修改业务数据。");

    return (
        <section id="vz-sec-controls" className="vz-panel" style={{ scrollMarginTop: 80, display: "grid", gap: 32 }}>
            <div>
                <VzSectionTitle eyebrow="Controls" title="按钮 · 状态矩阵" desc="按按钮类型分组展示状态。每个示例均保留独立标签，手机端也能清晰对照。" />
                <div className="vz-state-groups" aria-label="按钮状态矩阵">
                    {VARIANTS.map((item) => (
                        <MatrixRow key={item.variant} variant={item.variant} label={item.label} onAction={setNotice} />
                    ))}
                </div>
                <p className="vz-demo-notice" role="status" aria-live="polite">
                    {notice}
                </p>
                <div className="vz-row" style={{ marginTop: 20 }}>
                    <VzButton variant="primary" size="lg" icon={Sparkles} onClick={() => setNotice("已触发大号主按钮 · 本地演示")}>
                        大号主按钮
                    </VzButton>
                    <VzButton variant="secondary" size="sm" onClick={() => setNotice("已触发小号次按钮 · 本地演示")}>
                        小号次按钮
                    </VzButton>
                    <VzIconButton icon={Copy} label="复制提示词" variant="secondary" onClick={() => setNotice("复制状态已演示 · 不访问剪贴板")} />
                    <VzIconButton icon={Heart} label={fav ? "取消收藏" : "收藏"} selected={fav} onClick={() => setFav((v) => !v)} />
                    <VzIconButton icon={Trash2} label="删除" variant="danger" onClick={() => setNotice("删除动作已演示 · 未删除任何业务数据")} />
                    <VzIconButton icon={Mail} label="不可用" disabled />
                </div>
            </div>

            <div>
                <VzSectionTitle eyebrow="Inputs" title="输入控件" />
                <div className="vz-grid" style={{ "--min": "260px", gap: 20 } as React.CSSProperties}>
                    <VzInput label="项目名称" placeholder="例如：赛博少女海报" defaultValue="霓虹雨夜" hint="默认状态" />
                    <VzInput label="Hover" placeholder="悬停边框加强" force="hover" hint="边框亮度提升" />
                    <VzInput label="Focus" placeholder="聚焦光环" force="focus" hint="品牌色光环 + 背景提亮" />
                    <VzInput label="邮箱" defaultValue="hello@vozeb" status="error" hint="邮箱格式不正确" />
                    <VzInput label="项目标识" defaultValue="neon-girl" status="warning" hint="该标识与已有项目相似" />
                    <VzInput label="邀请码" defaultValue="VZ-2026-AI" status="success" hint="邀请码有效，奖励 200 积分" />
                    <VzInput label="已锁定字段" defaultValue="不可编辑" disabled hint="Disabled" />
                    <VzSearch label="搜索" placeholder="搜索作品、模型、提示词" />
                </div>
                <div style={{ marginTop: 20 }}>
                    <VzTextarea label="多行提示词" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} hint="支持换行 · 内容仅在当前样板中保留" />
                </div>
            </div>

            <div>
                <VzSectionTitle eyebrow="Selection" title="选择类控件" desc="复用 Ant Design，通过嵌套 ConfigProvider 与作用域样式换肤。" />
                <div className="vz-grid" style={{ "--min": "260px", gap: 20 } as React.CSSProperties}>
                    <div className="vz-stack" style={{ gap: 8 }}>
                        <span className="vz-field__label">Select</span>
                        <Select
                            defaultValue="cinematic"
                            style={{ width: "100%" }}
                            options={[
                                { value: "cinematic", label: "电影感" },
                                { value: "anime", label: "日系动画" },
                                { value: "ink", label: "国风水墨" },
                                { value: "3d", label: "3D 渲染", disabled: true },
                            ]}
                        />
                        <Select status="error" placeholder="必选项未选择" style={{ width: "100%" }} options={[{ value: "a", label: "选项 A" }]} />
                        <Select disabled defaultValue="locked" style={{ width: "100%" }} options={[{ value: "locked", label: "Disabled" }]} />
                    </div>
                    <div className="vz-stack" style={{ gap: 8 }}>
                        <span className="vz-field__label">Segmented</span>
                        <Segmented block value={seg} onChange={setSeg} options={["图片", "视频", "音频"]} />
                        <Segmented block disabled options={["Disabled", "状态"]} />
                        <span className="vz-field__label" style={{ marginTop: 8 }}>
                            Checkbox / Switch
                        </span>
                        <div className="vz-row" style={{ gap: 16 }}>
                            <Checkbox defaultChecked>自动保存</Checkbox>
                            <Checkbox indeterminate>部分选择</Checkbox>
                            <Checkbox disabled>禁用</Checkbox>
                        </div>
                        <div className="vz-row" style={{ gap: 16 }}>
                            <Switch checked={toggle} onChange={setToggle} aria-label="公开作品" />
                            <span className="vz-caption">{toggle ? "作品公开" : "仅自己可见"}</span>
                            <Switch loading defaultChecked aria-label="加载中" />
                            <Switch disabled aria-label="禁用" />
                        </div>
                    </div>
                    <div className="vz-stack" style={{ gap: 8, minWidth: 0 }}>
                        <span className="vz-field__label">Tabs</span>
                        <Tabs
                            defaultActiveKey="all"
                            items={[
                                { key: "all", label: "全部", children: <span className="vz-caption">全部作品 128</span> },
                                { key: "img", label: "图片", children: <span className="vz-caption">图片 96</span> },
                                { key: "video", label: "视频", children: <span className="vz-caption">视频 24</span> },
                                { key: "off", label: "草稿", disabled: true },
                            ]}
                        />
                    </div>
                </div>
            </div>

            <div>
                <VzSectionTitle eyebrow="Tags" title="标签 · 状态徽章 · 模型标签" />
                <div className="vz-stack" style={{ gap: 14 }}>
                    <div className="vz-row">
                        <VzTag>默认</VzTag>
                        <VzTag tone="brand">品牌</VzTag>
                        <VzTag tone="accent">强调</VzTag>
                        <VzTag tone="success">成功</VzTag>
                        <VzTag tone="warning">警告</VzTag>
                        <VzTag tone="danger">错误</VzTag>
                        <VzTag tone="info">信息</VzTag>
                        <VzTag style={{ maxWidth: 160 }} title="超长标签会被省略而不是撑破布局">
                            超长标签会被省略而不是撑破布局
                        </VzTag>
                    </div>
                    <div className="vz-row">
                        <VzStatusBadge status="queued" />
                        <VzStatusBadge status="running" />
                        <VzStatusBadge status="success" />
                        <VzStatusBadge status="warning" />
                        <VzStatusBadge status="failed" />
                        <VzStatusBadge status="info" />
                    </div>
                    <div className="vz-row">
                        <VzModelTag name="Seedream 4.5" vendor="ByteDance" />
                        <VzModelTag name="GPT Image 2" vendor="OpenAI" />
                        <VzModelTag name="Kling 2.5" vendor="Kuaishou" />
                        <VzModelTag name="Veo 3.1" vendor="Google" />
                    </div>
                    <div className="vz-grid" style={{ "--min": "260px", gap: 10 } as React.CSSProperties}>
                        <VzAlert tone="success" title="已保存">
                            项目已同步到云端。
                        </VzAlert>
                        <VzAlert tone="warning" title="积分不足">
                            剩余积分仅够生成 2 次。
                        </VzAlert>
                        <VzAlert tone="danger" title="上传失败">
                            文件超过 20MB 限制。
                        </VzAlert>
                        <VzAlert tone="info" title="提示">
                            高峰时段排队时间可能增加。
                        </VzAlert>
                    </div>
                </div>
            </div>
        </section>
    );
}

function MatrixRow({ variant, label, onAction }: { variant: (typeof VARIANTS)[number]["variant"]; label: string; onAction: (message: string) => void }) {
    return (
        <div className="vz-state-group" role="group" aria-label={`${label}状态`}>
            <span className="vz-state-group__title">{label}</span>
            <div className="vz-state-samples">
                {STATES.map((state) => (
                    <div key={state.key} className="vz-state-card">
                        <span className="vz-state-label">{state.key}</span>
                        <VzButton variant={variant} size="sm" force={state.force} disabled={state.disabled} loading={state.loading} selected={state.selected} onClick={() => onAction(`${label} · ${state.key} 已触发（本地演示）`)}>
                            {state.loading ? "处理中" : state.selected ? "已选择" : "生成"}
                        </VzButton>
                    </div>
                ))}
            </div>
        </div>
    );
}
