"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Switch, message } from "antd";
import { DEFAULT_DRAMA_LAB_UI_FEATURES, DRAMA_LAB_UI_FEATURES, type DramaLabUiFeatureId } from "@/lib/feature-modules";

type Settings = { featureModules?: Record<string, boolean>; settingsRevision?: number };
const groups: Array<[string, Array<[string, string, string]>]> = [
    [
        "剧本与项目",
        [
            ["projectEntry", "项目入口", "新建项目、项目详情页"],
            ["novelImport", "导入小说/剧本", "TXT/MD 导入与章节识别"],
            ["episodeManagement", "分集管理", "新增、删除、排序"],
            ["storyGeneration", "故事生成", "按配置生成多集剧本"],
        ],
    ],
    [
        "资产准备",
        [
            ["assetPreparation", "资产准备入口", "进入角色、场景、道具管理"],
            ["assetExtraction", "资产提取", "一键提取角色、场景、道具"],
            ["assetReferenceLibrary", "素材库引用", "从素材库添加与设置主参考图"],
            ["assetGeneration", "资产生成与编辑", "AI 生图、上传、编辑弹窗"],
        ],
    ],
    [
        "分镜生成",
        [
            ["storyboardCount", "分镜数量", "增减数量与 AI 自动决定"],
            ["storyboardDuration", "视频总时长", "增减时长与 AI 自动决定"],
            ["storyboardFirstLast", "首尾帧参考图", "启用首尾帧模式"],
            ["storyboardClassic", "经典分镜", "启用经典分镜模式"],
            ["storyboardUniversal", "全能分镜", "启用全能分镜模式"],
            ["storyboardVoiceover", "生成解说旁白", "生成旁白内容"],
            ["storyboardExport", "导出", "导出 Excel 与 SRT"],
        ],
    ],
    [
        "分镜工作台",
        [
            ["workbenchAssetSelectors", "资产选择框", "场景、角色、道具选择"],
            ["workbenchImage", "分镜图", "生成、上传分镜图"],
            ["workbenchVideo", "分镜视频", "生成、上传分镜视频"],
            ["workbenchPromptEditor", "提示词编辑", "查看与编辑提示词弹窗"],
            ["workbenchDubbing", "设置配音", "对白与旁白配音"],
            ["workbenchAudioSplit", "按音频拆镜", "按音频自动拆分镜头"],
        ],
    ],
    [
        "审核与成片",
        [
            ["projectEntry", "审核入口", "内容审核状态"],
            ["storyboardExport", "项目导入导出", "完整项目数据导入导出"],
            ["storyGeneration", "一键全流程", "剧本到成片任务编排"],
        ],
    ],
];
export default function DramaLabFeaturesClient() {
    const router = useRouter();
    const [settings, setSettings] = useState<Settings>({ featureModules: { ...DEFAULT_DRAMA_LAB_UI_FEATURES } });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        fetch("/api/admin/settings")
            .then((r) => r.json())
            .then((x) => setSettings(x.settings || x))
            .finally(() => setLoading(false));
    }, []);
    const get = (id: DramaLabUiFeatureId) => settings.featureModules?.[id] !== false;
    const set = (id: DramaLabUiFeatureId, v: boolean) => setSettings((s) => ({ ...s, featureModules: { ...s.featureModules, [id]: v } }));
    async function save() {
        setSaving(true);
        try {
            const r = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ featureModules: settings.featureModules, settingsRevision: settings.settingsRevision ?? 1 }) });
            if (!r.ok) throw new Error();
            message.success("创作工坊显示配置已保存");
        } catch {
            message.error("保存失败，请刷新后重试");
        } finally {
            setSaving(false);
        }
    }
    function reset() {
        setSettings((s) => ({ ...s, featureModules: { ...s.featureModules, ...DEFAULT_DRAMA_LAB_UI_FEATURES } }));
    }
    return (
        <main className="h-screen overflow-y-auto bg-stone-50 p-6 text-stone-950">
            <div className="mx-auto max-w-6xl pb-12">
                <div className="mb-3">
                    <Button type="link" onClick={() => router.push("/admin?section=plugins")} className="!px-0">
                        ← 返回插件市场
                    </Button>
                </div>
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <div className="mb-2 text-sm text-stone-500">插件市场 / 创作工坊 / 独立配置</div>
                        <h1 className="text-2xl font-semibold">创作工坊配置</h1>
                        <p className="mt-1 text-sm text-stone-500">仅控制创作工坊前端入口、按钮和选择框的显示。</p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={reset}>恢复默认</Button>
                        <Button type="primary" loading={saving} onClick={save}>
                            保存配置
                        </Button>
                    </div>
                </div>
                <section className="mb-4 flex items-center justify-between rounded-xl border bg-white p-5">
                    <div>
                        <h2 className="text-lg font-semibold">创作工坊总开关</h2>
                        <p className="text-sm text-stone-500">关闭后隐藏创作工坊前台入口。</p>
                    </div>
                    <Switch checked={settings.featureModules?.["drama-lab"] !== false} onChange={(v) => set("drama-lab" as DramaLabUiFeatureId, v)} />
                </section>
                {groups.map(([name, items]) => (
                    <section key={name} className="mb-4 rounded-xl border bg-white">
                        <header className="border-b px-5 py-4">
                            <h2 className="font-semibold">{name}</h2>
                        </header>
                        <div className="grid gap-3 p-5 sm:grid-cols-2">
                            {items.map(([key, label, desc]) => (
                                <div key={key} className="rounded-lg border p-4">
                                    <div className="flex justify-between gap-3">
                                        <div>
                                            <div className="font-medium">{label}</div>
                                            <div className="mt-1 text-xs text-stone-500">{desc}</div>
                                        </div>
                                        <Switch loading={loading} checked={get(DRAMA_LAB_UI_FEATURES[key as keyof typeof DRAMA_LAB_UI_FEATURES])} onChange={(v) => set(DRAMA_LAB_UI_FEATURES[key as keyof typeof DRAMA_LAB_UI_FEATURES], v)} />
                                    </div>
                                    <div className="mt-3 border-t pt-3 text-xs text-stone-400">前端显示入口</div>
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </main>
    );
}
