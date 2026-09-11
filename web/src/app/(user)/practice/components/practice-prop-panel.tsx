"use client";
import { PracticePromptEditor } from "./practice-prompt-editor";

import { App, Button } from "antd";
import { Box } from "lucide-react";
import { useState } from "react";
import { practiceApi } from "@/services/api/practice";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { PracticeSizeField, WorkflowFormFields, WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { PracticeMediaInput } from "./practice-media-input";
import { ModelField } from "./practice-storyboard-image-panel";
import { PracticeAssetPicker } from "./practice-asset-picker";

export default function PracticePropPanel({ capability, onCreated }: PracticePanelProps) {
    const { message } = App.useApp();
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
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败，请重试");
        } finally {
            setUploading(false);
        }
    };
    const submit = async () => {
        if (!prompt.trim() || !model || busy) return;
        setBusy(true);
        try {
            onCreated(
                (
                    await practiceApi.createSession({
                        module: "prop",
                        mode: "workflow",
                        title: "道具练习",
                        workflowCode: "prop_main_view",
                        input: { prompt: prompt.trim(), workflowCode: "prop_main_view", ...workflowInput },
                        references: image?.storageKey ? [{ type: "asset", id: image.storageKey, inputKey: "referenceImage" }] : [],
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
            <PracticePromptEditor briefLabel="道具设定" label="道具描述" value={prompt} onChange={setPrompt} disabled={busy} mode="image">
                <PracticeMediaInput label="道具参考图（可选）" accept="image/*" disabled={uploading} onChoose={(file) => void chooseImage(file)} url={image?.url} onRemove={() => setImage(undefined)}>
                        <PracticeAssetPicker dramaAssetType="prop" disabled={uploading} onSelect={setImage} />
                    </PracticeMediaInput>
            </PracticePromptEditor>
            <PracticeSizeField capability={capability} value={workflowInput} onChange={(patch) => setWorkflowInput((current) => ({ ...current, ...patch }))} />
            <WorkflowFormFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <Button type="primary" block size="large" icon={<Box className="size-4" />} loading={busy || uploading} disabled={!capability.available || !model || !prompt.trim()} onClick={() => void submit()}>
                生成道具图
            </Button>
        </div>
    );
}
