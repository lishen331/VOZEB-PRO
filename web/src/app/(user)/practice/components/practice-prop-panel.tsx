"use client";

import { Button, Input } from "antd";
import { Box } from "lucide-react";
import { useState } from "react";
import { practiceApi } from "@/services/api/practice";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { WorkflowFormFields, WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { ModelField } from "./practice-storyboard-image-panel";

export default function PracticePropPanel({ capability, onCreated }: PracticePanelProps) {
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState(capability.models[0]?.id);
    const [image, setImage] = useState<UploadedImage>();
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => workflowFieldDefaults(capability));
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const chooseImage = async (file?: File) => {
        if (!file || !file.type.startsWith("image/")) return;
        setUploading(true);
        try { setImage(await uploadImage(file)); } finally { setUploading(false); }
    };
    const submit = async () => {
        if (!prompt.trim() || !model || busy) return;
        setBusy(true);
        try { onCreated((await practiceApi.createSession({ module: "prop", mode: "workflow", title: "道具练习", workflowCode: "prop_main_view", input: { prompt: prompt.trim(), workflowCode: "prop_main_view", ...workflowInput }, references: image?.storageKey ? [{ type: "asset", id: image.storageKey, inputKey: "referenceImage" }] : [], logicalModelId: model, clientRequestId: crypto.randomUUID() })).session); }
        finally { setBusy(false); }
    };
    return <div className="space-y-4">
        <ModelField capability={capability} value={model} onChange={setModel} />
        <label className="block text-sm font-medium">道具参考图（可选）<input type="file" accept="image/*" disabled={uploading} onChange={(event) => void chooseImage(event.target.files?.[0])} className="mt-2 block w-full text-sm" />{image ? <img src={image.url} alt="已选择的道具参考图" className="mt-2 max-h-48 w-full object-contain" /> : null}</label>
        <label className="block text-sm font-medium">道具描述<Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} autoSize={{ minRows: 5, maxRows: 10 }} className="!mt-2" placeholder="描述材质、结构、用途和外观" /></label>
        <WorkflowFormFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
        <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
        <Button type="primary" icon={<Box className="size-4" />} loading={busy || uploading} disabled={!capability.available || !model || !prompt.trim()} onClick={() => void submit()}>生成道具图</Button>
    </div>;
}
