"use client";

import { useMemo, useState } from "react";
import { Input, Popover, Select, Tabs } from "antd";
import { ChevronDown, Search } from "lucide-react";
import useSWR from "swr";

import type { AudioParamOption } from "@/lib/audio-model-params";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CustomVoice } from "@/lib/server/custom-voice-store";
import { useVoicePreview, VoicePreviewButton } from "@/components/voice-preview";

const ALL_GROUPS = "__all__";

/**
 * 音色分类按用户选音色时真正会问的维度来分：性别、年龄、风格、用途、语种。
 * 判定依据是每项 option 已有的 search 文本（名称 + 性别 + 特质 + 语种 + 场景），
 * 关键词取自 qwen-voice-catalog 里实际出现的 trait / scene / lang 值，不新增数据；
 * 目录里一条都命不中的分类不会出现在下拉里。
 */
const VOICE_FACETS: Array<{ value: string; label: string; match: (search: string) => boolean }> = [
    { value: "female", label: "女声", match: (s) => /（女|·女）/.test(s) },
    { value: "male", label: "男声", match: (s) => /（男|·男）/.test(s) },
    { value: "child", label: "童声 / 萌系", match: (s) => /童|萌|软糯|撒娇|可爱/.test(s) },
    { value: "mature", label: "御姐 / 成熟", match: (s) => /御姐|成熟|知性|磁性|电台质感/.test(s) },
    { value: "gentle", label: "温柔治愈", match: (s) => /温柔|温婉|亲和|治愈/.test(s) },
    { value: "lively", label: "活泼爽朗", match: (s) => /活泼|爽朗|灵动|朝气|清亮|活力/.test(s) },
    { value: "broadcast", label: "播音 / 新闻", match: (s) => /播音|新闻播报|陈述|播报/.test(s) },
    { value: "reading", label: "有声阅读", match: (s) => /有声阅读|有声书|古风|叙事|沉浸/.test(s) },
    { value: "ecommerce", label: "电商直播", match: (s) => /电商直播|直播带货|直播/.test(s) },
    { value: "anime", label: "动漫 / 角色", match: (s) => /动漫配音|角色音|游戏|动漫/.test(s) },
    { value: "companion", label: "情感陪伴", match: (s) => /情感陪伴|社交互动|客服|助手/.test(s) },
    { value: "dialect", label: "方言", match: (s) => /方言|东北|四川|粤语|台湾|闽南|上海话/.test(s) },
    { value: "english", label: "英语", match: (s) => /英文|英语|english/.test(s) },
    {
        value: "foreign",
        label: "小语种",
        match: (s) =>
            /小语种|保加利亚语|荷兰语|匈牙利语|罗马尼亚语|丹麦语|克罗地亚语|希腊语|捷克语|挪威语|瑞典语|印地语|芬兰语|乌尔都语|塞尔维亚语|西班牙语|立陶宛语|拉脱维亚语|土耳其语|波斯语|希伯来语|蒙古语|斯洛文尼亚语|阿塞拜疆语|波兰语|加泰罗尼亚语|高棉语|葡萄牙语|老挝语|格鲁吉亚语|南非荷兰语|尼泊尔语|白俄罗斯语|马拉雅拉姆语|卢森堡语|阿尔巴尼亚语|韩语|日语|法语|德语|俄语|意大利语|泰语|越南语|马来语|印尼语|阿拉伯语/.test(
                s,
            ),
    },
];

type VoiceSelectorProps = {
    value: string;
    presetVoices: AudioParamOption[];
    model: string;
    theme: CanvasTheme;
    onChange: (value: string) => void;
    /** 多人对话角色卡片里用紧凑版。 */
    compact?: boolean;
};

/**
 * 音色下拉框：收起时只占一行，点开后浮层里放分类、搜索和两个标签页。
 * 自定义音色只有两个来源（设计后存为我的音色、克隆自动入库），这里不再提供创建入口。
 */
export function VoiceSelector({ value, presetVoices, model, theme, onChange, compact = false }: VoiceSelectorProps) {
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<"preset" | "mine">("preset");
    const [searchText, setSearchText] = useState("");
    const [group, setGroup] = useState(ALL_GROUPS);
    const preview = useVoicePreview();

    const { data: customVoicesData, mutate } = useSWR<{ voices: CustomVoice[] }>(open ? `/api/custom-voices?ttsModel=${encodeURIComponent(model)}` : null, (url: string) => fetch(url).then((res) => res.json()), {
        refreshInterval: open ? 8000 : 0,
        revalidateOnFocus: false,
    });

    const myVoices = (customVoicesData?.voices || []).filter((voice) => voice.saved !== false && (voice.status === "ready" || voice.status === "creating"));
    const currentCustom = value.startsWith("custom:") ? myVoices.find((voice) => `custom:${voice.id}` === value) : undefined;
    const currentLabel = currentCustom?.name || presetVoices.find((voice) => voice.value === value)?.label || value || "选择音色";
    const currentPreview = currentCustom?.previewUrl || presetVoices.find((voice) => voice.value === value)?.preview;

    const groupOptions = useMemo(() => {
        const searched = presetVoices.map((voice) => (voice.search || voice.label).toLowerCase());
        const facets = VOICE_FACETS.filter((facet) => searched.some((text) => facet.match(text)));
        return facets.length ? [{ value: ALL_GROUPS, label: "全部音色" }, ...facets.map(({ value: facet, label }) => ({ value: facet, label }))] : [];
    }, [presetVoices]);
    const activeGroup = groupOptions.some((option) => option.value === group) ? group : ALL_GROUPS;
    const searchTerms = searchText.trim().toLowerCase();

    const filteredPresetVoices = useMemo(() => {
        const facet = VOICE_FACETS.find((item) => item.value === activeGroup);
        return presetVoices.filter((voice) => {
            const searchable = (voice.search || voice.label).toLowerCase();
            if (facet && !facet.match(searchable)) return false;
            return !searchTerms || searchable.includes(searchTerms);
        });
    }, [presetVoices, activeGroup, searchTerms]);

    const filteredMyVoices = useMemo(() => (searchTerms ? myVoices.filter((voice) => voice.name.toLowerCase().includes(searchTerms)) : myVoices), [myVoices, searchTerms]);

    const select = (next: string) => {
        onChange(next);
        setOpen(false);
    };

    const panel = (
        <div className="w-[268px] space-y-2" style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-1.5">
                <Input
                    size="small"
                    prefix={<Search className="size-3.5" style={{ color: theme.node.muted }} />}
                    placeholder="搜索音色"
                    allowClear
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    style={{ borderColor: theme.node.stroke, background: theme.node.fill }}
                    className="min-w-0 flex-1"
                />
                {groupOptions.length > 1 && activeTab === "preset" ? (
                    <Select size="small" className="w-[104px] shrink-0" value={activeGroup} options={groupOptions} popupMatchSelectWidth={false} styles={{ popup: { root: { zIndex: 1305 } } }} onChange={setGroup} />
                ) : null}
            </div>

            <Tabs
                size="small"
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as typeof activeTab)}
                items={[
                    { key: "preset", label: `音色库 ${filteredPresetVoices.length}` },
                    { key: "mine", label: `我的音色 ${filteredMyVoices.length}` },
                ]}
            />

            <div className="thin-scrollbar max-h-[176px] space-y-px overflow-y-auto pr-0.5 text-[11px]">
                {activeTab === "preset" ? (
                    filteredPresetVoices.length ? (
                        filteredPresetVoices.map((voice) => (
                            <div
                                key={voice.value}
                                role="option"
                                aria-selected={value === voice.value}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                                style={{ background: value === voice.value ? theme.node.fill : undefined }}
                                onClick={() => select(voice.value)}
                            >
                                <span className="min-w-0 flex-1 truncate">{voice.label}</span>
                                {voice.preview ? <VoicePreviewButton url={voice.preview} preview={preview} theme={theme} /> : null}
                            </div>
                        ))
                    ) : (
                        <div className="py-6 text-center" style={{ color: theme.node.muted }}>
                            未找到匹配的音色
                        </div>
                    )
                ) : filteredMyVoices.length ? (
                    filteredMyVoices.map((voice) => {
                        const creating = voice.status === "creating";
                        const expiresIn = voice.expiresAt ? getExpiresInDays(voice.expiresAt) : null;
                        return (
                            <div
                                key={voice.id}
                                role="option"
                                aria-selected={value === `custom:${voice.id}`}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                                style={{ background: value === `custom:${voice.id}` ? theme.node.fill : undefined, opacity: creating ? 0.6 : 1 }}
                                onClick={() => (creating ? mutate() : select(`custom:${voice.id}`))}
                            >
                                <span className="min-w-0 flex-1 truncate">
                                    {voice.name}
                                    {creating ? <span className="ml-1 text-[10px]">创建中</span> : null}
                                    {!creating && expiresIn !== null && expiresIn <= 7 ? <span className="ml-1 text-[10px] text-orange-500">{expiresIn} 天后过期</span> : null}
                                </span>
                                {voice.previewUrl && !creating ? <VoicePreviewButton url={voice.previewUrl} preview={preview} theme={theme} /> : null}
                            </div>
                        );
                    })
                ) : (
                    <div className="px-2 py-6 text-center leading-5" style={{ color: theme.node.muted }}>
                        还没有自定义音色
                        <br />
                        用「设计」做声音，或连一个音频节点用「克隆」
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomLeft" arrow={false} zIndex={1305} content={panel} destroyOnHidden>
            <button
                type="button"
                aria-label={`选择音色，当前 ${currentLabel}`}
                aria-expanded={open}
                className={`flex w-full min-w-0 items-center gap-1.5 rounded-lg border px-2 text-left transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05] ${compact ? "h-7 text-[11px]" : "h-8 text-xs"}`}
                style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <span className="min-w-0 flex-1 truncate">{currentLabel}</span>
                {currentPreview ? <VoicePreviewButton url={currentPreview} preview={preview} theme={theme} /> : null}
                <ChevronDown className="size-3.5 shrink-0 opacity-60" />
            </button>
        </Popover>
    );
}

function getExpiresInDays(expiresAt: string): number {
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
