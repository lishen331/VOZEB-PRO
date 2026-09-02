"use client";
import { Button, Input } from "antd";
import { Film } from "lucide-react";
import { useState } from "react";
import { practiceApi } from "@/services/api/practice";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { ModelField } from "./practice-storyboard-image-panel";
export default function PracticeStoryboardVideoPanel({ capability, onCreated }: PracticePanelProps) {
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState(capability.models[0]?.id);
    const [image, setImage] = useState<UploadedImage>();
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
    const submit = async () => {
        if (!prompt.trim() || !image?.storageKey || !model || busy) return;
        setBusy(true);
        try {
            onCreated(
                (
                    await practiceApi.createSession({
                        module: "storyboard-video",
                        mode: "workflow",
                        title: "分镜视频练习",
                        input: { prompt: prompt.trim(), ...workflowInput },
                        references: [{ type: "asset", id: image.storageKey }],
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
                视频提示词
                <Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} autoSize={{ minRows: 5, maxRows: 10 }} className="!mt-2" placeholder="描述镜头运动、节奏和画面变化" />
            </label>
            <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <Button type="primary" icon={<Film className="size-4" />} loading={busy || uploading} disabled={!capability.available || !model || !image?.storageKey || !prompt.trim()} onClick={() => void submit()}>
                生成分镜视频
            </Button>
        </div>
    );
}
