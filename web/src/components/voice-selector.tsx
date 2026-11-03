"use client";

import { useMemo, useState } from "react";
import { Button, Input, Select, Tabs } from "antd";
import { Plus, Search } from "lucide-react";
import useSWR from "swr";

import type { AudioParamOption } from "@/lib/audio-model-params";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CustomVoice } from "@/lib/server/custom-voice-store";
import { CreateVoiceModal } from "@/components/create-voice-modal";

/** 当前模型是否支持自定义音色，由 /api/custom-voices/capabilities 决定。 */
export type VoiceCapabilities = {
    enabled: boolean;
    channelId?: string;
};

type VoiceSelectorProps = {
    value: string;
    presetVoices: AudioParamOption[];
    model: string;
    theme: CanvasTheme;
    onChange: (value: string) => void;
};

const ALL_GROUPS = "__all__";

export function VoiceSelector({ value, presetVoices, model, theme, onChange }: VoiceSelectorProps) {
    const [activeTab, setActiveTab] = useState<"preset" | "mine" | "shared">("preset");
    const [searchText, setSearchText] = useState("");
    const [group, setGroup] = useState(ALL_GROUPS);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const { data: customVoicesData, mutate } = useSWR<{ voices: CustomVoice[] }>(`/api/custom-voices?ttsModel=${encodeURIComponent(model)}`, (url: string) => fetch(url).then((res) => res.json()), { refreshInterval: 10000 });
    const { data: capabilities } = useSWR<{ enabled: boolean }>(`/api/custom-voices/capabilities?ttsModel=${encodeURIComponent(model)}`, (url: string) => fetch(url).then((res) => res.json()));

    const customVoices = customVoicesData?.voices || [];
    const myVoices = customVoices.filter((v) => v.status === "ready" || v.status === "creating");
    const sharedVoices = customVoices.filter((v) => v.shared && v.status === "ready");

    // 千问 600+ 音色按官方分类分组，分类来自 option.group；MiniMax 没有 group，此时不显示筛选框。
    const groupOptions = useMemo(() => {
        const names = [...new Set(presetVoices.map((voice) => voice.group).filter(Boolean))] as string[];
        return names.length ? [{ value: ALL_GROUPS, label: "全部" }, ...names.map((name) => ({ value: name, label: name }))] : [];
    }, [presetVoices]);
    const activeGroup = groupOptions.some((option) => option.value === group) ? group : ALL_GROUPS;

    const searchTerms = searchText.trim().toLowerCase();

    const filteredPresetVoices = useMemo(() => {
        return presetVoices.filter((voice) => {
            if (activeGroup !== ALL_GROUPS && voice.group !== activeGroup) return false;
            if (!searchTerms) return true;
            return (voice.search || voice.label).toLowerCase().includes(searchTerms);
        });
    }, [presetVoices, activeGroup, searchTerms]);

    const filteredMyVoices = useMemo(() => {
        if (!searchTerms) return myVoices;
        return myVoices.filter((voice) => voice.name.toLowerCase().includes(searchTerms));
    }, [myVoices, searchTerms]);

    const filteredSharedVoices = useMemo(() => {
        if (!searchTerms) return sharedVoices;
        return sharedVoices.filter((voice) => voice.name.toLowerCase().includes(searchTerms));
    }, [sharedVoices, searchTerms]);

    const handleVoiceSelect = (voiceValue: string) => {
        onChange(voiceValue);
    };

    const tabItems = [
        { key: "preset", label: `音色库 (${filteredPresetVoices.length})` },
        { key: "mine", label: `我的音色 (${filteredMyVoices.length})` },
        { key: "shared", label: `共享音色 (${filteredSharedVoices.length})` },
    ];

    return (
        <div className="w-full space-y-3" style={{ color: theme.node.text }}>
            <div className="flex items-center justify-between gap-2">
                {activeTab === "preset" && groupOptions.length > 1 ? (
                    <Select size="small" value={activeGroup} options={groupOptions} popupMatchSelectWidth={false} styles={{ popup: { root: { zIndex: 1305 } } }} style={{ minWidth: 96, maxWidth: 150 }} onChange={(next) => setGroup(next)} />
                ) : null}
                <Input
                    prefix={<Search className="size-4" style={{ color: theme.node.muted }} />}
                    placeholder="搜索音色"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ borderColor: theme.node.stroke, background: theme.node.fill }}
                    className="flex-1"
                />
                {capabilities?.enabled ? (
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setShowCreateModal(true)}>
                        创建音色
                    </Button>
                ) : null}
            </div>

            <Tabs activeKey={activeTab} items={tabItems} onChange={(key) => setActiveTab(key as typeof activeTab)} />

            <div className="thin-scrollbar max-h-[400px] space-y-1.5 overflow-y-auto">
                {activeTab === "preset" && (
                    <>
                        {filteredPresetVoices.length === 0 ? (
                            <div className="py-8 text-center text-sm" style={{ color: theme.node.muted }}>
                                未找到匹配的音色
                            </div>
                        ) : (
                            filteredPresetVoices.map((voice) => <VoiceItem key={voice.value} name={voice.label} value={voice.value} preview={voice.preview} selected={value === voice.value} theme={theme} onClick={() => handleVoiceSelect(voice.value)} />)
                        )}
                    </>
                )}

                {activeTab === "mine" && (
                    <>
                        {filteredMyVoices.length === 0 ? (
                            <div className="py-8 text-center text-sm" style={{ color: theme.node.muted }}>
                                {myVoices.length === 0 ? "还没有自定义音色" : "未找到匹配的音色"}
                            </div>
                        ) : (
                            filteredMyVoices.map((voice) => <CustomVoiceItem key={voice.id} voice={voice} selected={value === `custom:${voice.id}`} theme={theme} onClick={() => handleVoiceSelect(`custom:${voice.id}`)} onRefresh={() => mutate()} />)
                        )}
                    </>
                )}

                {activeTab === "shared" && (
                    <>
                        {filteredSharedVoices.length === 0 ? (
                            <div className="py-8 text-center text-sm" style={{ color: theme.node.muted }}>
                                {sharedVoices.length === 0 ? "暂无共享音色" : "未找到匹配的音色"}
                            </div>
                        ) : (
                            filteredSharedVoices.map((voice) => <CustomVoiceItem key={voice.id} voice={voice} selected={value === `custom:${voice.id}`} theme={theme} onClick={() => handleVoiceSelect(`custom:${voice.id}`)} onRefresh={() => mutate()} />)
                        )}
                    </>
                )}
            </div>

            <CreateVoiceModal
                open={showCreateModal}
                model={model}
                onClose={() => setShowCreateModal(false)}
                onSuccess={() => {
                    mutate();
                    setActiveTab("mine");
                }}
            />
        </div>
    );
}

type VoiceItemProps = {
    name: string;
    value: string;
    preview?: string;
    selected: boolean;
    theme: CanvasTheme;
    onClick: () => void;
};

function VoiceItem({ name, preview, selected, theme, onClick }: VoiceItemProps) {
    return (
        <div
            className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-opacity-50"
            style={{
                background: selected ? theme.node.fill : "transparent",
                borderLeft: selected ? `3px solid ${theme.node.text}` : "3px solid transparent",
            }}
            onClick={onClick}
        >
            <span className="text-sm">{name}</span>
            {preview && <VoicePreviewButton url={preview} theme={theme} />}
        </div>
    );
}

type CustomVoiceItemProps = {
    voice: CustomVoice;
    selected: boolean;
    theme: CanvasTheme;
    onClick: () => void;
    onRefresh: () => void;
};

function CustomVoiceItem({ voice, selected, theme, onClick, onRefresh }: CustomVoiceItemProps) {
    const isCreating = voice.status === "creating";
    const expiresIn = voice.expiresAt ? getExpiresInDays(voice.expiresAt) : null;
    const showExpiry = expiresIn !== null && expiresIn <= 7;

    return (
        <div
            className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-opacity-50"
            style={{
                background: selected ? theme.node.fill : "transparent",
                borderLeft: selected ? `3px solid ${theme.node.text}` : "3px solid transparent",
                opacity: isCreating ? 0.6 : 1,
            }}
            onClick={onClick}
        >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm">{voice.name}</span>
                    {voice.shared && (
                        <span className="shrink-0 text-xs" style={{ color: theme.node.muted }}>
                            (共享)
                        </span>
                    )}
                </div>
                {isCreating && (
                    <span className="text-xs" style={{ color: theme.node.muted }}>
                        创建中...
                    </span>
                )}
                {showExpiry && !isCreating && <span className="text-xs text-orange-500">{expiresIn}天后过期</span>}
            </div>
            {voice.previewUrl && !isCreating && <VoicePreviewButton url={voice.previewUrl} theme={theme} />}
            {isCreating && (
                <Button
                    size="small"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRefresh();
                    }}
                >
                    刷新
                </Button>
            )}
        </div>
    );
}

function VoicePreviewButton({ url, theme }: { url: string; theme: CanvasTheme }) {
    const [playing, setPlaying] = useState(false);

    const handlePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (playing) {
            setPlaying(false);
            return;
        }
        const audio = new Audio(url);
        audio.onended = () => setPlaying(false);
        audio.onerror = () => setPlaying(false);
        setPlaying(true);
        audio.play().catch(() => setPlaying(false));
    };

    return (
        <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-opacity-20" style={{ background: playing ? theme.node.fill : "transparent" }} onClick={handlePlay}>
            {playing ? "⏸" : "▶️"}
        </button>
    );
}

function getExpiresInDays(expiresAt: string): number {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
