"use client";
import { Button, Input } from "antd";
import { Film } from "lucide-react";
import { useState } from "react";
import { practiceApi } from "@/services/api/practice";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { ModelField } from "./practice-storyboard-image-panel";

export function buildStoryboardVideoReferences(imageId: string, audioEnabled: boolean, audioId?: string) {
    return [
        imageId ? { type: "asset" as const, id: imageId, inputKey: "image" } : null,
        audioEnabled && audioId ? { type: "asset" as const, id: audioId, inputKey: "audio" } : null,
    ].filter((reference): reference is { type: "asset"; id: string; inputKey: string } => Boolean(reference));
}
export default function PracticeStoryboardVideoPanel({ capability, onCreated }: PracticePanelProps) {
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState(capability.models[0]?.id);
    const [image, setImage] = useState<UploadedImage>();
    const [audio, setAudio] = useState<UploadedFile>();
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => workflowFieldDefaults(capability));
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const chooseImage = async (file?: File) => {
        if (!file || !file.type.startsWith("image/")) return;
        setUploading(true);
        try {
            setImage(await uploadImage(file));
        } finally {
            setUploading(false);
        }
    };
    const chooseAudio = async (file?: File) => {
        if (!file || !file.type.startsWith("audio/")) return;
        setUploading(true);
        try { setAudio(await uploadMediaFile(file, "audio")); } finally { setUploading(false); }
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
                        input: { prompt: prompt.trim(), workflowCode: "storyboard_shot_video", audioEnabled, ...workflowInput },
                        references: buildStoryboardVideoReferences(image.storageKey, audioEnabled, audio?.storageKey),
                        logicalModelId: model,
                        clientRequestId: crypto.randomUUID(),
                    })
                ).session,
            );
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-4">
            <ModelField capability={capability} value={model} onChange={setModel} />
            <label className="block text-sm font-medium">
                参考图片
                <input type="file" accept="image/*" disabled={uploading} onChange={(event) => void chooseImage(event.target.files?.[0])} className="mt-2 block w-full text-sm" />
                {image ? <img src={image.url} alt="已选择的参考图片" className="mt-2 max-h-48 w-full object-contain" /> : null}
            </label>
            <label className="block text-sm font-medium">
                台词音频
                <input type="file" accept="audio/*" disabled={uploading || !audioEnabled} onChange={(event) => void chooseAudio(event.target.files?.[0])} className="mt-2 block w-full text-sm" />
                {audio ? <audio controls src={audio.url} className="mt-2 w-full" /> : null}
            </label>
            <label className="flex items-center justify-between gap-3 border border-border p-3 text-sm font-medium">
                启用台词音频
                <input type="checkbox" checked={audioEnabled} onChange={(event) => setAudioEnabled(event.target.checked)} />
            </label>
            <label className="block text-sm font-medium">
                视频提示词
                <Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} autoSize={{ minRows: 5, maxRows: 10 }} className="!mt-2" placeholder="描述镜头运动、节奏和画面变化" />
            </label>
            <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <Button type="primary" icon={<Film className="size-4" />} loading={busy || uploading} disabled={!capability.available || !model || !image?.storageKey || !prompt.trim() || (audioEnabled && !audio?.storageKey)} onClick={() => void submit()}>
                生成分镜视频
            </Button>
        </div>
    );
}
