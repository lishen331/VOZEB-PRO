"use client";

import { Button, Input, Segmented } from "antd";
import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { practiceApi } from "@/services/api/practice";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { type PracticePanelProps, WorkflowFormFields, WorkflowOptionalFields, workflowFieldDefaults } from "./practice-panel-types";
import { ModelField } from "./practice-storyboard-image-panel";

export default function PracticeCharacterPanel({ capability, onCreated }: PracticePanelProps) {
    const canMultiView = capability.workflowOptions?.some((option) => option.code === "character_multi_view") === true;
    const [view, setView] = useState<"main" | "multi">("main");
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState(capability.models[0]?.id);
    const [image, setImage] = useState<UploadedImage>();
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => workflowFieldDefaults(capability));
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const workflowCode = view === "multi" ? "character_multi_view" : "character_main_view";
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
        if (!prompt.trim() || !model || busy || (view === "multi" && !image?.storageKey)) return;
        setBusy(true);
        try {
            onCreated(
                (
                    await practiceApi.createSession({
                        module: "character",
                        mode: "workflow",
                        title: "角色练习",
                        workflowCode,
                        input: { prompt: prompt.trim(), workflowCode, ...workflowInput },
                        references: image?.storageKey ? [{ type: "asset", id: image.storageKey, inputKey: "referenceImage" }] : [],
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
                角色视图
                <Segmented
                    value={view}
                    onChange={(value) => setView(value as "main" | "multi")}
                    options={[
                        { label: "主形象", value: "main" },
                        { label: "多视图", value: "multi", disabled: !canMultiView },
                    ]}
                    className="!mt-2"
                />
            </label>
            <label className="block text-sm font-medium">
                主形象参考图{view === "multi" ? "（必需）" : "（可选）"}
                <input type="file" accept="image/*" disabled={uploading} onChange={(event) => void chooseImage(event.target.files?.[0])} className="mt-2 block w-full text-sm" />
                {image ? <img src={image.url} alt="已选择的角色参考图" className="mt-2 max-h-48 w-full object-contain" /> : null}
            </label>
            <label className="block text-sm font-medium">
                角色描述
                <Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} autoSize={{ minRows: 5, maxRows: 10 }} className="!mt-2" placeholder="描述外观、服装、气质和视觉风格" />
            </label>
            <WorkflowFormFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <Button type="primary" icon={<ImagePlus className="size-4" />} loading={busy || uploading} disabled={!capability.available || !model || !prompt.trim() || (view === "multi" && !image?.storageKey)} onClick={() => void submit()}>
                生成角色图
            </Button>
        </div>
    );
}
