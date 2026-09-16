"use client";

import { useMemo } from "react";
import { Alert, Button, Checkbox, Form, Input, Select, Switch, Tag } from "antd";
import type { AuthSettings } from "@/lib/auth/store";
import type { AdminDashboardController } from "./use-admin-dashboard-controller";
import { SCRIPT_AGENT_TOOL_NAMES } from "@/lib/server/script-practice-agent-tools";
import { DEFAULT_PRACTICE_SCRIPT_SETTINGS } from "@/lib/server/practice-script-settings";
import { AdminPracticeScriptAgent } from "./admin-practice-script-agent";

const DEFAULT_PRACTICE_MODULE_VISIBILITY = {
    character: true,
    scene: true,
    prop: true,
    "storyboard-image": true,
    "storyboard-video": true,
    dubbing: true,
} as const;

const SCRIPT_PRACTICE_SKILLS = [
    { value: "script-structure", label: "剧本结构" },
    { value: "dialogue-polish", label: "对白润色" },
    { value: "continuity-check", label: "连续性检查" },
    { value: "conflict-enhancement", label: "冲突增强" },
] as const;

export function buildPracticeSettingsPatch(settings: Pick<AuthSettings, "practiceScriptSettings" | "practiceModuleVisibility">) {
    return { practiceScriptSettings: settings.practiceScriptSettings, practiceModuleVisibility: settings.practiceModuleVisibility };
}

export function practiceScriptModelOptions(settings: Pick<AuthSettings, "logicalModels">) {
    return settings.logicalModels.filter((model) => model.enabled && model.capability === "text").map((model) => ({ value: model.id, label: model.name || model.id }));
}

export function practiceScriptChannelOptions(settings: Pick<AuthSettings, "logicalModels" | "systemChannels">, modelId: string) {
    const model = settings.logicalModels.find((item) => item.id === modelId && item.enabled && item.capability === "text");
    if (!model) return [];
    const channelIds = new Set(model.bindings.filter((binding) => binding.enabled).map((binding) => binding.channelId));
    return settings.systemChannels.filter((channel) => channel.enabled && channel.purpose !== "production" && channelIds.has(channel.id)).map((channel) => ({ value: channel.id, label: channel.name || channel.id }));
}

export function AdminPracticeSection({ controller }: { controller: AdminDashboardController }) {
    const { settings, setSettings, settingsLoading, activeSection, saveSettings } = controller;
    const script = settings.practiceScriptSettings || DEFAULT_PRACTICE_SCRIPT_SETTINGS;
    const modelOptions = useMemo(() => practiceScriptModelOptions(settings), [settings]);
    const channelOptions = useMemo(() => practiceScriptChannelOptions(settings, script.defaultModelId), [settings, script.defaultModelId]);
    if (activeSection !== "practice") return null;
    const updateScript = (patch: Partial<AuthSettings["practiceScriptSettings"]>) => setSettings((current) => ({ ...current, practiceScriptSettings: { ...current.practiceScriptSettings, ...patch } }));
    const save = () => saveSettings((current) => buildPracticeSettingsPatch(current), "无限练习配置已保存");
    return (
        <section aria-label="无限练习配置" className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
                <h2 className="text-lg font-semibold">无限练习</h2>
                <p className="mt-1 text-sm text-zinc-500">单独配置无限练习的剧本大模型、Skill、Tool 和模块入口；不会影响商业创作。</p>
                <p className="mt-2 text-xs text-zinc-500">模型 API Key 仍在“模型渠道”中维护；本页只选择已绑定的无限练习渠道，不展示密钥。请先在模型渠道中完成密钥配置，再回到本页选择模型。</p>
                <Button className="mt-2" size="small" href="/admin?section=channels">
                    前往模型渠道配置 Key
                </Button>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium">模块状态</h3>
                            <p className="mt-1 text-xs text-zinc-500">关闭后隐藏用户端入口，已有项目不删除。</p>
                        </div>
                        <Switch checked={script.enabled} onChange={(enabled) => updateScript({ enabled })} />
                    </div>
                </div>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <h3 className="font-medium">剧本模型</h3>
                    <div className="mt-3 grid gap-3">
                        <Form.Item label="剧本生成模型" className="mb-0">
                            <Select value={script.defaultModelId || undefined} placeholder="选择文本逻辑模型" options={modelOptions} onChange={(value) => updateScript({ defaultModelId: value, endpointId: "" })} />
                        </Form.Item>
                        <Form.Item label="备用剧本模型" className="mb-0">
                            <Select
                                allowClear
                                value={script.fallbackModelId || undefined}
                                placeholder="可选"
                                options={modelOptions.filter((item) => item.value !== script.defaultModelId)}
                                onChange={(value) => updateScript({ fallbackModelId: value || "" })}
                            />
                        </Form.Item>
                        <Form.Item label="使用渠道" className="mb-0">
                            <Select allowClear value={script.endpointId || undefined} placeholder="自动选择可用渠道" options={channelOptions} onChange={(value) => updateScript({ endpointId: value || "" })} />
                        </Form.Item>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Form.Item label="默认语言" className="mb-0">
                                <Input value={script.defaultLanguage} onChange={(event) => updateScript({ defaultLanguage: event.target.value })} />
                            </Form.Item>
                            <Form.Item label="默认格式" className="mb-0">
                                <Select
                                    value={script.defaultFormat}
                                    options={[
                                        { value: "structured", label: "结构化剧本" },
                                        { value: "fountain", label: "Fountain" },
                                    ]}
                                    onChange={(value) => updateScript({ defaultFormat: value })}
                                />
                            </Form.Item>
                        </div>
                    </div>
                    {!script.defaultModelId ? (
                        <Alert className="mt-3" type="warning" showIcon message="尚未设置剧本生成模型，用户端将不可生成剧本。" />
                    ) : channelOptions.length ? (
                        <Tag className="mt-3" color="success">
                            已配置，可生成剧本
                        </Tag>
                    ) : (
                        <Alert className="mt-3" type="warning" showIcon message="该模型没有可用的无限练习渠道绑定。" />
                    )}
                </div>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 lg:col-span-2">
                    <h3 className="font-medium">剧本 Skills</h3>
                    <p className="mt-1 text-xs text-zinc-500">只控制剧本文本能力，不会把图片、视频或音频 Skill 暴露给剧本 Agent。</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <Checkbox.Group value={script.enabledSkills} onChange={(values) => updateScript({ enabledSkills: values as string[] })} options={[...SCRIPT_PRACTICE_SKILLS]} />
                    </div>
                </div>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 lg:col-span-2">
                    <h3 className="font-medium">剧本 Agent Tools</h3>
                    <p className="mt-1 text-xs text-zinc-500">仅允许剧本读写和版本工具，不提供媒体任务工具。</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        <Checkbox.Group value={script.enabledTools} onChange={(values) => updateScript({ enabledTools: values as string[] })} options={SCRIPT_AGENT_TOOL_NAMES.map((value) => ({ value, label: value }))} />
                    </div>
                </div>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 lg:col-span-2">
                    <h3 className="font-medium">前台模块显隐</h3>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {(["character", "scene", "prop", "storyboard-image", "storyboard-video", "dubbing"] as const).map((key) => (
                            <label key={key} className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                                <span>{{ character: "角色", scene: "场景", prop: "道具", "storyboard-image": "分镜图", "storyboard-video": "分镜视频", dubbing: "配音" }[key]}</span>
                                <Switch
                                    size="small"
                                    checked={settings.practiceModuleVisibility?.[key] !== false}
                                    onChange={(checked) =>
                                        setSettings((current) => ({ ...current, practiceModuleVisibility: { canvas: false, drama: false, ...DEFAULT_PRACTICE_MODULE_VISIBILITY, ...(current.practiceModuleVisibility || {}), [key]: checked } }))
                                    }
                                />
                            </label>
                        ))}
                    </div>
                </div>
            </div>
            <div className="border-t border-zinc-200 p-5 dark:border-zinc-800">
                <h3 className="mb-3 text-base font-semibold">多 Agent 独立模型配置</h3>
                <AdminPracticeScriptAgent settings={settings} />
            </div>
            <div className="flex justify-end border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
                <Button type="primary" loading={settingsLoading} onClick={() => void save()}>
                    保存无限练习配置
                </Button>
            </div>
        </section>
    );
}
