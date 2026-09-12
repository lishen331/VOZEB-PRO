"use client";
import { PracticePromptEditor } from "./practice-prompt-editor";
import { App, Button, Select, Switch } from "antd";
import { Film } from "lucide-react";
import { useState } from "react";
import { practiceApi, type PracticeSession } from "@/services/api/practice";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { PracticeDurationField, PracticeSizeField, WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { PracticeMediaInput } from "./practice-media-input";
import { ModelField } from "./practice-storyboard-image-panel";
import { PracticeAssetPicker } from "./practice-asset-picker";

export function buildStoryboardVideoReferences(imageId: string, audioEnabled: boolean, audioId?: string) {
    return [imageId ? { type: "asset" as const, id: imageId, inputKey: "image" } : null, audioEnabled && audioId ? { type: "asset" as const, id: audioId, inputKey: "audio" } : null].filter(
        (reference): reference is { type: "asset"; id: string; inputKey: string } => Boolean(reference),
    );
}
export default function PracticeStoryboardVideoPanel({ capability, onCreated, defaultInput }: PracticePanelProps) {
    const { message } = App.useApp();
    const [prompt, setPrompt] = useState(() => defaultInput?.prompt ?? "");
    const [model, setModel] = useState(capability.models[0]?.id);
    const [image, setImage] = useState<UploadedImage | undefined>(() => defaultInput?.images?.image);
    const [audio, setAudio] = useState<UploadedFile>();
    const [audioHistory, setAudioHistory] = useState<PracticeSession[]>([]);
    const [audioSource, setAudioSource] = useState<"upload" | "history">("upload");
    const [audioHistoryLoading, setAudioHistoryLoading] = useState(false);
    const [selectedAudioId, setSelectedAudioId] = useState<string>();
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
    const selectAudioResult = async (id: string) => {
        const selected = audioHistory.find((session) => session.id === id);
        if (!selected?.result?.media?.url) return;
        setUploading(true);
        try {
            setAudio(await uploadMediaFile(selected.result.media.url, "audio"));
            setSelectedAudioId(id);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "引用配音失败");
        } finally {
            setUploading(false);
        }
    };
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => ({
        ...workflowFieldDefaults({ ...capability, inputSchema: capability.inputSchema.filter((field) => field.key !== "audioEnabled") }),
        ...(defaultInput?.workflowInput ?? {}),
    }));
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
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
    const submit = async () => {
        if (!prompt.trim() || !image?.storageKey || !model || busy || (audioEnabled && !audio?.storageKey)) return;
        setBusy(true);
        try {
            onCreated(
                (
                    await practiceApi.createSession({
                        module: "storyboard-video",
                        mode: "workflow",
                        title: "分镜视频练习",
                        workflowCode: "storyboard_shot_video",
                        input: { prompt: prompt.trim(), workflowCode: "storyboard_shot_video", ...workflowInput, audioEnabled },
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
    return (
        <div className="space-y-4">
            <ModelField capability={capability} value={model} onChange={setModel} />
            <PracticePromptEditor briefLabel="分镜脚本" label="视频提示词" value={prompt} onChange={setPrompt} disabled={busy} mode="video" />
            <PracticeMediaInput label="参考图片" accept="image/*" disabled={uploading} onChoose={(file) => void chooseImage(file)} url={image?.url} onRemove={() => setImage(undefined)}>
                <PracticeAssetPicker disabled={uploading} onSelect={setImage} label="从资产库选（分镜图）" />
            </PracticeMediaInput>
            <section aria-label="音频信息" className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">音频信息 / 台词配音</span>
                    <Switch aria-label="启用台词音频" checked={audioEnabled} onChange={setAudioEnabled} />
                </div>
                <p className="text-xs text-muted-foreground">关闭时生成无台词音频的视频；开启后可上传音频或引用已完成的配音。</p>
                {audioEnabled ? (
                    <>
                        <Select
                            aria-label="配音来源"
                            value={audioSource}
                            className="!w-full"
                            options={[
                                { value: "upload", label: "上传台词音频" },
                                { value: "history", label: "引用历史配音" },
                            ]}
                            onChange={(value) => {
                                setAudioSource(value);
                                setAudio(undefined);
                                setSelectedAudioId(undefined);
                                if (value === "history") void loadAudioHistory();
                            }}
                        />
                        {audioSource === "upload" ? (
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
                                {audio?.url ? <audio controls src={audio.url} className="w-full" /> : null}
                                {!audioHistoryLoading && !audioHistory.length ? <p className="text-xs text-muted-foreground">暂无已完成的配音，先去配音或改用上传。</p> : null}
                            </>
                        )}
                        <Button href="/practice/dubbing" target="_blank" size="small">
                            去配音
                        </Button>
                        <Button size="small" onClick={() => void loadAudioHistory()}>
                            刷新配音记录
                        </Button>
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
