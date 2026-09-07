"use client";
import { PracticePromptEditor } from "./practice-prompt-editor";
import { PracticeMediaInput } from "./practice-media-input";
import { App, Button, Select } from "antd";
import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { IpReferencePicker } from "@/components/ip-library/ip-reference-picker";
import { IP_REFERENCE_ENTRY_VISIBLE } from "@/lib/ip-library-domain";
import { practiceApi } from "@/services/api/practice";
import { WorkflowFormFields, WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { uploadImage, type UploadedImage } from "@/services/image-storage";

export function buildStoryboardImageReferences(sceneId: string, assetIds: string[]) {
    return [sceneId ? { type: "asset" as const, id: sceneId, inputKey: "sceneImage" } : null, ...assetIds.slice(0, 3).map((id, index) => (id ? { type: "asset" as const, id, inputKey: `characterPropImage${index + 1}` } : null))].filter(
        (reference): reference is { type: "asset"; id: string; inputKey: string } => Boolean(reference),
    );
}
export default function PracticeStoryboardImagePanel({ capability, ipReferences, onIpReferencesChange, onCreated }: PracticePanelProps) {
    const { message } = App.useApp();
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState(capability.models[0]?.id);
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => workflowFieldDefaults(capability));
    const [busy, setBusy] = useState(false);
    const [scene, setScene] = useState<UploadedImage>();
    const [assets, setAssets] = useState<Array<UploadedImage | undefined>>([]);
    const [uploading, setUploading] = useState(false);
    const chooseImage = async (file: File | undefined, index?: number) => {
        if (!file || !file.type.startsWith("image/")) return;
        setUploading(true);
        try {
            const uploaded = await uploadImage(file);
            if (index === undefined) setScene(uploaded);
            else setAssets((current) => Object.assign([...current], { [index]: uploaded }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败，请重试");
        } finally {
            setUploading(false);
        }
    };
    const submit = async () => {
        if (!prompt.trim() || !model || !scene?.storageKey || busy) return;
        setBusy(true);
        try {
            onCreated(
                (
                    await practiceApi.createSession({
                        module: "storyboard-image",
                        mode: "workflow",
                        title: "分镜图练习",
                        workflowCode: "storyboard_shot",
                        input: { prompt: prompt.trim(), workflowCode: "storyboard_shot", ...workflowInput },
                        references: [
                            ...buildStoryboardImageReferences(
                                scene.storageKey,
                                assets.map((item) => item?.storageKey || ""),
                            ),
                            ...ipReferences,
                        ],
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
            <PracticePromptEditor briefLabel="分镜脚本" label="画面描述" value={prompt} onChange={setPrompt} disabled={busy} mode="image" />
            <PracticeMediaInput label="主场景图（必需）" accept="image/*" disabled={uploading} onChoose={(file) => void chooseImage(file)} url={scene?.url} onRemove={() => setScene(undefined)} />
            <div className="grid gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((index) => (
                    <PracticeMediaInput
                        key={index}
                        label={`角色/道具图 ${index + 1}`}
                        disabled={uploading}
                        onChoose={(file) => void chooseImage(file, index)}
                        url={assets[index]?.url}
                        onRemove={() => setAssets((current) => current.map((item, i) => (i === index ? undefined : item)))}
                    />
                ))}
            </div>
            <WorkflowFormFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            {IP_REFERENCE_ENTRY_VISIBLE ? <IpReferencePicker compact value={ipReferences} onChange={onIpReferencesChange} /> : null}
            <Button type="primary" block size="large" icon={<ImagePlus className="size-4" />} loading={busy || uploading} disabled={!capability.available || !prompt.trim() || !model || !scene?.storageKey} onClick={() => void submit()}>
                生成分镜图
            </Button>
        </div>
    );
}
export function ModelField({ capability, value, onChange }: { capability: PracticePanelProps["capability"]; value?: string; onChange: (value: string) => void }) {
    if (capability.models.length === 1)
        return (
            <p className="text-sm">
                开源模型：<span className="font-medium">{capability.models[0].label}</span>
            </p>
        );
    return (
        <label className="block text-sm font-medium">
            开源模型
            <Select value={value} onChange={onChange} options={capability.models.map((item) => ({ value: item.id, label: item.label }))} className="!mt-2 !w-full" placeholder="选择模型" />
        </label>
    );
}
