"use client";
import { PracticePromptEditor } from "./practice-prompt-editor";
import { App, Button, Switch } from "antd";
import { Film } from "lucide-react";
import { useState } from "react";
import { practiceApi } from "@/services/api/practice";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { PracticeMediaInput } from "./practice-media-input";
import { ModelField } from "./practice-storyboard-image-panel";

export function buildStoryboardVideoReferences(imageId: string, audioEnabled: boolean, audioId?: string) {
    return [imageId ? { type: "asset" as const, id: imageId, inputKey: "image" } : null, audioEnabled && audioId ? { type: "asset" as const, id: audioId, inputKey: "audio" } : null].filter(
        (reference): reference is { type: "asset"; id: string; inputKey: string } => Boolean(reference),
    );
}
export default function PracticeStoryboardVideoPanel({ capability, onCreated }: PracticePanelProps) {
    const { message } = App.useApp();
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState(capability.models[0]?.id);
    const [image, setImage] = useState<UploadedImage>();
    const [audio, setAudio] = useState<UploadedFile>();
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => workflowFieldDefaults({ ...capability, inputSchema: capability.inputSchema.filter((field) => field.key !== "audioEnabled") }));
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
            <PracticeMediaInput label="参考图片" accept="image/*" disabled={uploading} onChoose={(file) => void chooseImage(file)} url={image?.url} onRemove={() => setImage(undefined)} />
            <PracticeMediaInput label="台词音频" accept="audio/*" disabled={uploading || !audioEnabled} onChoose={(file) => void chooseAudio(file)} url={audio?.url} onRemove={() => setAudio(undefined)} />
            <label className="flex items-center justify-between gap-3 border border-border p-3 text-sm font-medium">
                启用台词音频
                <Switch checked={audioEnabled} onChange={setAudioEnabled} />
            </label>
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
