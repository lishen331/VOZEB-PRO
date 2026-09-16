"use client";
import { PracticePromptEditor } from "./practice-prompt-editor";
import { App, Button, Select, Switch } from "antd";
import { Film } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { practiceApi, type PracticeSession } from "@/services/api/practice";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { PracticeDurationField, PracticeSizeField, WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { PracticeMediaInput } from "./practice-media-input";
import { ModelField } from "./practice-storyboard-image-panel";
import { PracticeAssetPicker } from "./practice-asset-picker";

export type PracticeVideoVoicePreset = { value: string; label: string; sourceUrl: string; previewUrl: string };

export const DEFAULT_STORYBOARD_VIDEO_VOICE: PracticeVideoVoicePreset = {
    value: "builtin:default-storyboard-audio.flac",
    label: "默认台词音色",
    sourceUrl: "/practice-assets/default-storyboard-audio.flac",
    previewUrl: "/practice-assets/default-storyboard-audio.flac",
};

const DEMO_VIDEO_VOICE_CATALOG = [
    ["派蒙", "f", "https://dmaigc.oss-cn-guangzhou.aliyuncs.com/source/20260624215904294523603589857175/intent-2c4ab41f23bb469283a6d0e5f6561e27/item-e602a81e7f8943fa8e4767f6bbcd1eb4/wav"],
    ["胡桃", "f", "https://dmaigc.oss-cn-guangzhou.aliyuncs.com/source/20260624215904294523603589857175/intent-1df8b9849c7f4b69ad00923cf6aef72c/item-8a4a53c8cfb04bb38e2107bff0f1ac88/wav"],
    ["傲娇御姐", "f", "https://dmaigc.oss-cn-guangzhou.aliyuncs.com/source/20260624215904294523603589857175/intent-6fcb784a7eec412cb118d3d6e4199758/item-6aba9d285b164c1f8bb5210ae91067b5/wav"],
    ["湖南甜妹", "f", "https://dmaigc.oss-cn-guangzhou.aliyuncs.com/source/20260624215904294523603589857175/intent-9fa24998a709478eac649ceaff304193/item-f8db5dc1c01747f19d1f7203ca11ad94/wav"],
    ["知性女解说", "f", "https://dmaigc.oss-cn-guangzhou.aliyuncs.com/source/20260624215904294523603589857175/intent-ddaca50157c5415c8d4de7ee9df79dc6/item-068dd9b346ca4fb5ac24b9068f38be68/wav"],
    ["宣传片女声", "f", "https://dmaigc.oss-cn-guangzhou.aliyuncs.com/source/20260624215904294523603589857175/intent-3e4cceb3f92141f490d5f41e5a973350/item-339d0503b8cd49b4b6fb99e80e8572a3/wav"],
    ["低沉男声", "m", "https://dmaigc.oss-cn-guangzhou.aliyuncs.com/source/20260624215904294523603589857175/intent-43b128ecb8064b88a9fcc3e013aba870/item-b67ab459fe454e3494b280603ead45aa/wav"],
    ["沉稳高管", "m", "https://dmaigc.oss-cn-guangzhou.aliyuncs.com/source/20260624215904294523603589857175/intent-2d10bbca4a7649968793f92c15f6cf80/item-33265ecda0c64cfe9851a2eaeb4afcba/wav"],
    ["纪录片男声", "m", "https://dmaigc.oss-cn-guangzhou.aliyuncs.com/source/20260624215904294523603589857175/intent-777c0854f19e42cb9a2507c772153f12/item-072c2ae337674f2a94bf3c770360ebc3/wav"],
    ["奶声萌娃", "m", "https://dmaigc.oss-cn-guangzhou.aliyuncs.com/source/20260624215904294523603589857175/intent-4afacfefe8204d40979912e73d70487f/item-169d3e7f7374486bb2ec262160b3226f/wav"],
] as const;

export const PRACTICE_VIDEO_VOICE_PRESETS: PracticeVideoVoicePreset[] = [
    DEFAULT_STORYBOARD_VIDEO_VOICE,
    ...DEMO_VIDEO_VOICE_CATALOG.map(([name, gender, sourceUrl]) => ({ value: sourceUrl, label: `${name} · ${gender === "f" ? "女" : "男"}`, sourceUrl, previewUrl: sourceUrl })),
];

export function buildStoryboardVideoReferences(imageId: string, audioEnabled: boolean, audioId?: string) {
    return [imageId ? { type: "asset" as const, id: imageId, inputKey: "image" } : null, audioEnabled && audioId ? { type: "asset" as const, id: audioId, inputKey: "audio" } : null].filter(
        (reference): reference is { type: "asset"; id: string; inputKey: string } => Boolean(reference),
    );
}

export function buildStoryboardVideoAudioInput(audioEnabled: boolean, audioId?: string) {
    return { audioEnabled, ...(audioEnabled && audioId ? { audio: audioId } : {}) };
}

export default function PracticeStoryboardVideoPanel({ capability, onCreated, defaultInput }: PracticePanelProps) {
    const { message } = App.useApp();
    const [prompt, setPrompt] = useState(() => defaultInput?.prompt ?? "");
    const [model, setModel] = useState(capability.models[0]?.id);
    const [image, setImage] = useState<UploadedImage | undefined>(() => defaultInput?.images?.image);
    const [audio, setAudio] = useState<UploadedFile>();
    const [audioHistory, setAudioHistory] = useState<PracticeSession[]>([]);
    const [audioSource, setAudioSource] = useState<"preset" | "upload" | "history">("preset");
    const [selectedVoice, setSelectedVoice] = useState(DEFAULT_STORYBOARD_VIDEO_VOICE.value);
    const [audioHistoryLoading, setAudioHistoryLoading] = useState(false);
    const [selectedAudioId, setSelectedAudioId] = useState<string>();
    const audioLoadRequest = useRef(0);
    const audioPresetLoadKey = useRef<string | undefined>(undefined);
    const [audioEnabled, setAudioEnabled] = useState(() => defaultInput?.workflowInput?.audioEnabled !== false);
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => ({
        ...workflowFieldDefaults({ ...capability, inputSchema: capability.inputSchema.filter((field) => field.key !== "audioEnabled") }),
        ...(defaultInput?.workflowInput ?? {}),
    }));
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);

    const loadAudioHistory = async () => {
        if (audioHistoryLoading) return;
        setAudioHistoryLoading(true);
        try {
            const history = await practiceApi.listSessions({ module: "dubbing", pageSize: 24 });
            setAudioHistory(history.sessions.filter((session) => session.status === "success" && session.result?.media?.kind === "audio"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "配音记录读取失败");
        } finally {
            setAudioHistoryLoading(false);
        }
    };

    const loadPresetAudio = useCallback(
        async (value: string) => {
            const preset = PRACTICE_VIDEO_VOICE_PRESETS.find((item) => item.value === value);
            if (!preset || audioPresetLoadKey.current === value) return;
            audioPresetLoadKey.current = value;
            const requestId = ++audioLoadRequest.current;
            setUploading(true);
            try {
                const uploaded = await uploadMediaFile(preset.sourceUrl, "audio");
                if (requestId === audioLoadRequest.current) setAudio(uploaded);
            } catch (error) {
                if (requestId === audioLoadRequest.current) {
                    audioPresetLoadKey.current = undefined;
                    message.error(error instanceof Error ? error.message : "预置音色加载失败");
                }
            } finally {
                if (requestId === audioLoadRequest.current) setUploading(false);
            }
        },
        [message],
    );

    useEffect(() => {
        if (audioEnabled && audioSource === "preset") void loadPresetAudio(selectedVoice);
    }, [audioEnabled, audioSource, loadPresetAudio, selectedVoice]);

    const selectAudioResult = async (id: string) => {
        const selected = audioHistory.find((session) => session.id === id);
        if (!selected?.result?.media?.url) return;
        const requestId = ++audioLoadRequest.current;
        setUploading(true);
        try {
            const uploaded = await uploadMediaFile(selected.result.media.url, "audio");
            if (requestId === audioLoadRequest.current) {
                setAudio(uploaded);
                setSelectedAudioId(id);
            }
        } catch (error) {
            if (requestId === audioLoadRequest.current) message.error(error instanceof Error ? error.message : "引用配音失败");
        } finally {
            if (requestId === audioLoadRequest.current) setUploading(false);
        }
    };

    const chooseImage = async (file?: File) => {
        if (!file || !file.type.startsWith("image/")) return;
        setUploading(true);
        try {
            setImage(await uploadImage(file));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败，请重试");
        } finally {
            setUploading(false);
        }
    };

    const chooseAudio = async (file?: File) => {
        if (!file || !file.type.startsWith("audio/")) return;
        setUploading(true);
        try {
            setAudio(await uploadMediaFile(file, "audio"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败，请重试");
        } finally {
            setUploading(false);
        }
    };

    const chooseAudioSource = (value: string) => {
        ++audioLoadRequest.current;
        audioPresetLoadKey.current = undefined;
        setSelectedAudioId(undefined);
        setAudio(undefined);
        if (value === "none") {
            setAudioEnabled(false);
            return;
        }
        setAudioEnabled(true);
        if (value === "custom") {
            setAudioSource("upload");
            return;
        }
        if (value === "history") {
            setAudioSource("history");
            void loadAudioHistory();
            return;
        }
        setAudioSource("preset");
        setSelectedVoice(value);
    };

    const toggleAudio = (enabled: boolean) => {
        setAudioEnabled(enabled);
        if (!enabled) {
            ++audioLoadRequest.current;
            audioPresetLoadKey.current = undefined;
            setAudio(undefined);
            setSelectedAudioId(undefined);
            return;
        }
        if (audioSource === "history") void loadAudioHistory();
    };

    const submit = async () => {
        if (!prompt.trim() || !image?.storageKey || !model || busy || uploading || (audioEnabled && !audio?.storageKey)) return;
        setBusy(true);
        try {
            const audioInput = buildStoryboardVideoAudioInput(audioEnabled, audio?.storageKey);
            onCreated(
                (
                    await practiceApi.createSession({
                        module: "storyboard-video",
                        mode: "workflow",
                        title: "分镜视频练习",
                        workflowCode: "storyboard_shot_video",
                        input: { prompt: prompt.trim(), workflowCode: "storyboard_shot_video", ...workflowInput, ...audioInput },
                        references: buildStoryboardVideoReferences(image.storageKey, audioEnabled, audio?.storageKey),
                        logicalModelId: model,
                        clientRequestId: crypto.randomUUID(),
                    })
                ).session,
            );
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败，请重试");
        } finally {
            setBusy(false);
        }
    };

    const audioChoice = audioSource === "preset" ? selectedVoice : audioSource === "history" ? "history" : "custom";
    return (
        <div className="space-y-4">
            <ModelField capability={capability} value={model} onChange={setModel} />
            <PracticePromptEditor briefLabel="分镜脚本" label="视频提示词" value={prompt} onChange={setPrompt} disabled={busy} mode="video" />
            <PracticeMediaInput label="分镜图（必需）" accept="image/*" disabled={uploading} onChoose={(file) => void chooseImage(file)} url={image?.url} onRemove={() => setImage(undefined)}>
                <PracticeAssetPicker disabled={uploading} onSelect={setImage} label="从资产库选（分镜图）" />
            </PracticeMediaInput>
            <section aria-label="音频信息" className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">音频信息 / 台词配音</span>
                    <Switch aria-label="启用台词音频" checked={audioEnabled} onChange={toggleAudio} />
                </div>
                <p className="text-xs text-muted-foreground">参考 Demo：选择默认音色、平台音色、历史配音或自定义音频；关闭时生成无台词音频的视频。</p>
                {audioEnabled ? (
                    <>
                        <Select
                            aria-label="配音音色"
                            value={audioChoice}
                            className="!w-full"
                            options={[
                                ...PRACTICE_VIDEO_VOICE_PRESETS.map((voice) => ({ value: voice.value, label: voice.label })),
                                { value: "history", label: "引用历史配音" },
                                { value: "custom", label: "自定义上传" },
                                { value: "none", label: "不使用音频" },
                            ]}
                            onChange={chooseAudioSource}
                        />
                        {audioSource === "preset" ? (
                            <>
                                {audio?.url ? <audio controls preload="metadata" src={audio.url} className="w-full" /> : null}
                                <p className="text-xs text-muted-foreground">{audio ? "音色已准备好，生成的视频会带上这段台词音频。" : uploading ? "正在准备音色…" : "请选择音色以准备台词音频。"}</p>
                            </>
                        ) : audioSource === "upload" ? (
                            <PracticeMediaInput label="台词音频" accept="audio/*" disabled={uploading} onChoose={(file) => void chooseAudio(file)} url={audio?.url} onRemove={() => setAudio(undefined)} />
                        ) : (
                            <>
                                <Select
                                    aria-label="历史配音"
                                    className="!w-full"
                                    loading={audioHistoryLoading || uploading}
                                    value={selectedAudioId}
                                    placeholder="选择已完成的配音"
                                    options={audioHistory.map((session) => ({ value: session.id, label: `${session.title} · ${new Date(session.createdAt).toLocaleString()}` }))}
                                    onChange={(id) => void selectAudioResult(id)}
                                />
                                {audio?.url ? <audio controls preload="metadata" src={audio.url} className="w-full" /> : null}
                                {!audioHistoryLoading && !audioHistory.length ? <p className="text-xs text-muted-foreground">暂无已完成的配音，先去配音或改用上传。</p> : null}
                            </>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <Button href="/practice/dubbing" target="_blank" size="small">
                                去配音
                            </Button>
                            <Button size="small" onClick={() => void loadAudioHistory()}>
                                刷新配音记录
                            </Button>
                        </div>
                    </>
                ) : null}
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
                <PracticeSizeField capability={capability} value={workflowInput} onChange={(patch) => setWorkflowInput((current) => ({ ...current, ...patch }))} />
                <PracticeDurationField capability={capability} value={workflowInput} onChange={(duration) => setWorkflowInput((current) => ({ ...current, duration }))} />
            </div>
            <WorkflowOptionalFields
                capability={{ ...capability, inputSchema: capability.inputSchema.filter((field) => field.key !== "audioEnabled") }}
                value={workflowInput}
                onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))}
            />
            <Button
                type="primary"
                block
                size="large"
                icon={<Film className="size-4" />}
                loading={busy || uploading}
                disabled={!capability.available || !model || !image?.storageKey || !prompt.trim() || (audioEnabled && !audio?.storageKey)}
                onClick={() => void submit()}
            >
                生成分镜视频
            </Button>
        </div>
    );
}
