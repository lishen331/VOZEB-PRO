"use client";

import { Checkbox, Segmented, Select, Switch, Tabs } from "antd";
import { Copy, Heart, Mail, Sparkles, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";

import type { LabForce } from "@/components/vz-lab";
import { LabAlert, LabButton, LabIconButton, LabInput, LabModelTag, LabSearch, LabSectionTitle, LabStatusBadge, LabTag, LabTextarea } from "@/components/vz-lab";

const STATES: { key: string; force?: LabForce; disabled?: boolean; loading?: boolean }[] = [
    { key: "Default" },
    { key: "Hover", force: "hover" },
    { key: "Active", force: "active" },
    { key: "Focus", force: "focus" },
    { key: "Disabled", disabled: true },
    { key: "Loading", loading: true },
];
const VARIANTS = [
    ["primary", "主按钮"],
    ["secondary", "次按钮"],
    ["ghost", "幽灵按钮"],
    ["link", "文字按钮"],
    ["danger", "危险按钮"],
] as const;
const grid = (min: string, gap = 20) => ({ "--min": min, gap }) as CSSProperties;

export function SectionControls() {
    const [text, setText] = useState("一只在月光下奔跑的白狐");
    const [seg, setSeg] = useState<string | number>("图片");
    const [pub, setPub] = useState(true);
    const [fav, setFav] = useState(true);

    return (
        <section id="vzl-sec-controls" className="vzl-panel" style={{ scrollMarginTop: 80, display: "grid", gap: 32 }}>
            <div>
                <LabSectionTitle eyebrow="Controls" title="按钮 · 状态矩阵" desc="每列固定展示一种状态；按钮本身仍可真实 hover、点击和 Tab 聚焦。窄屏可横向滑动矩阵。" />
                <div className="vzl-matrix-wrap">
                    <div className="vzl-matrix">
                        <span />
                        {STATES.map((s) => (
                            <span key={s.key} className="vzl-state-label">
                                {s.key}
                            </span>
                        ))}
                        {VARIANTS.map(([variant, label]) => (
                            <MatrixRow key={variant} variant={variant} label={label} />
                        ))}
                    </div>
                </div>
                <div className="vzl-row" style={{ marginTop: 20 }}>
                    <LabButton variant="primary" size="lg" icon={Sparkles}>
                        大号主按钮
                    </LabButton>
                    <LabButton size="sm">小号次按钮</LabButton>
                    <LabIconButton icon={Copy} label="复制提示词" variant="secondary" />
                    <LabIconButton icon={Heart} label={fav ? "取消收藏" : "收藏"} selected={fav} onClick={() => setFav((v) => !v)} />
                    <LabIconButton icon={Trash2} label="删除" variant="danger" />
                    <LabIconButton icon={Mail} label="不可用" disabled />
                </div>
            </div>

            <div>
                <LabSectionTitle eyebrow="Inputs" title="输入控件" />
                <div className="vzl-grid" style={grid("260px")}>
                    <LabInput label="项目名称" defaultValue="霓虹雨夜" hint="默认" />
                    <LabInput label="Hover" placeholder="悬停时边框加强" force="hover" hint="边框亮度提升" />
                    <LabInput label="Focus" placeholder="聚焦光环" force="focus" hint="品牌色光环 + 背景提亮" />
                    <LabInput label="邮箱" defaultValue="hello@vozeb" status="error" hint="邮箱格式不正确" />
                    <LabInput label="项目标识" defaultValue="neon-girl" status="warning" hint="与已有项目相似" />
                    <LabInput label="邀请码" defaultValue="VZ-2026-AI" status="success" hint="邀请码有效" />
                    <LabInput label="已锁定字段" defaultValue="不可编辑" disabled hint="Disabled" />
                    <LabSearch label="搜索框" placeholder="搜索作品、模型、提示词" />
                </div>
                <div style={{ marginTop: 20 }}>
                    <LabTextarea label="多行提示词" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} hint="Shift + Enter 换行" />
                </div>
            </div>

            <div>
                <LabSectionTitle eyebrow="Selection" title="选择类控件" desc="复用 Ant Design，通过嵌套 ConfigProvider + .vzl 作用域样式换肤。" />
                <div className="vzl-grid" style={grid("260px")}>
                    <div className="vzl-stack" style={{ gap: 8 }}>
                        <span className="vzl-field__label">Select</span>
                        <Select
                            aria-label="风格"
                            defaultValue="cinematic"
                            style={{ width: "100%" }}
                            options={[
                                { value: "cinematic", label: "电影感" },
                                { value: "anime", label: "日系动画" },
                                { value: "ink", label: "国风水墨" },
                                { value: "3d", label: "3D 渲染（不可用）", disabled: true },
                            ]}
                        />
                        <Select aria-label="必选项" status="error" placeholder="必选项未选择" style={{ width: "100%" }} options={[{ value: "a", label: "选项 A" }]} />
                        <Select aria-label="禁用" disabled defaultValue="locked" style={{ width: "100%" }} options={[{ value: "locked", label: "Disabled" }]} />
                    </div>
                    <div className="vzl-stack" style={{ gap: 8 }}>
                        <span className="vzl-field__label">Segmented</span>
                        <Segmented block value={seg} onChange={setSeg} options={["图片", "视频", "音频"]} />
                        <Segmented block disabled options={["Disabled", "状态"]} />
                        <span className="vzl-field__label" style={{ marginTop: 8 }}>
                            Checkbox / Switch
                        </span>
                        <div className="vzl-row" style={{ gap: 16 }}>
                            <Checkbox defaultChecked>自动保存</Checkbox>
                            <Checkbox indeterminate>部分选择</Checkbox>
                            <Checkbox disabled>禁用</Checkbox>
                        </div>
                        <div className="vzl-row" style={{ gap: 12 }}>
                            <Switch checked={pub} onChange={setPub} aria-label="公开作品" />
                            <span className="vzl-caption" style={{ minWidth: 64 }}>
                                {pub ? "作品公开" : "仅自己可见"}
                            </span>
                            <Switch loading defaultChecked aria-label="加载中" />
                            <Switch disabled aria-label="禁用" />
                        </div>
                    </div>
                    <div className="vzl-stack" style={{ gap: 8, minWidth: 0 }}>
                        <span className="vzl-field__label">Tabs</span>
                        <Tabs
                            defaultActiveKey="all"
                            items={[
                                { key: "all", label: "全部", children: <span className="vzl-caption">全部作品 128</span> },
                                { key: "img", label: "图片", children: <span className="vzl-caption">图片 96</span> },
                                { key: "video", label: "视频", children: <span className="vzl-caption">视频 24</span> },
                                { key: "draft", label: "草稿", disabled: true },
                            ]}
                        />
                    </div>
                </div>
            </div>

            <div>
                <LabSectionTitle eyebrow="Tags" title="标签 · 状态徽章 · 模型标签" />
                <div className="vzl-stack" style={{ gap: 14 }}>
                    <div className="vzl-row">
                        <LabTag>默认</LabTag>
                        <LabTag tone="brand">品牌</LabTag>
                        <LabTag tone="accent">强调</LabTag>
                        <LabTag tone="success">成功</LabTag>
                        <LabTag tone="warning">警告</LabTag>
                        <LabTag tone="danger">错误</LabTag>
                        <LabTag tone="info">信息</LabTag>
                        <LabTag style={{ maxWidth: 160 }} title="超长标签会省略而不是撑破布局">
                            超长标签会省略而不是撑破布局
                        </LabTag>
                    </div>
                    <div className="vzl-row">
                        <LabStatusBadge status="queued" />
                        <LabStatusBadge status="running" />
                        <LabStatusBadge status="success" />
                        <LabStatusBadge status="warning" />
                        <LabStatusBadge status="failed" />
                        <LabStatusBadge status="draft" />
                    </div>
                    <div className="vzl-row">
                        <LabModelTag name="Seedream 4.5" vendor="ByteDance" />
                        <LabModelTag name="GPT Image 2" vendor="OpenAI" />
                        <LabModelTag name="Kling 2.5" vendor="Kuaishou" />
                        <LabModelTag name="Veo 3.1" vendor="Google" />
                    </div>
                    <div className="vzl-grid" style={grid("260px", 10)}>
                        <LabAlert tone="success" title="已保存">
                            项目已同步到云端。
                        </LabAlert>
                        <LabAlert tone="warning" title="积分不足">
                            剩余积分仅够生成 2 次。
                        </LabAlert>
                        <LabAlert tone="danger" title="上传失败">
                            文件超过 20MB 限制。
                        </LabAlert>
                        <LabAlert tone="info" title="提示">
                            高峰时段排队时间可能增加。
                        </LabAlert>
                    </div>
                </div>
            </div>
        </section>
    );
}

function MatrixRow({ variant, label }: { variant: (typeof VARIANTS)[number][0]; label: string }) {
    return (
        <>
            <span className="vzl-caption">{label}</span>
            {STATES.map((s) => (
                <LabButton key={s.key} variant={variant} size="sm" force={s.force} disabled={s.disabled} loading={s.loading} aria-label={`${label} ${s.key}`}>
                    {s.loading ? "处理中" : "生成"}
                </LabButton>
            ))}
        </>
    );
}
