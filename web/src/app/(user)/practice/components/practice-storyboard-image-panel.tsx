"use client";
import { Button, Input, Select } from "antd";
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
                                assets.flatMap((item) => item?.storageKey || []),
                            ),
                            ...ipReferences,
                        ],
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
                主场景图（必需）
                <input type="file" accept="image/*" disabled={uploading} onChange={(event) => void chooseImage(event.target.files?.[0])} className="mt-2 block w-full text-sm" />
                {scene ? <img src={scene.url} alt="已选择的主场景图" className="mt-2 max-h-48 w-full object-contain" /> : null}
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((index) => (
                    <label key={index} className="block text-sm font-medium">
                        角色/道具图 {index + 1}
                        <input type="file" accept="image/*" disabled={uploading} onChange={(event) => void chooseImage(event.target.files?.[0], index)} className="mt-2 block w-full text-xs" />
                        {assets[index] ? <img src={assets[index]?.url} alt={`已选择的角色或道具图 ${index + 1}`} className="mt-2 max-h-28 w-full object-contain" /> : null}
                    </label>
                ))}
            </div>
            <label className="block text-sm font-medium">
                画面描述
                <Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} autoSize={{ minRows: 5, maxRows: 10 }} className="!mt-2" placeholder="描述构图、景别、光线和主体" />
            </label>
            <WorkflowFormFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            {IP_REFERENCE_ENTRY_VISIBLE ? <IpReferencePicker compact value={ipReferences} onChange={onIpReferencesChange} /> : null}
            <Button type="primary" icon={<ImagePlus className="size-4" />} loading={busy || uploading} disabled={!capability.available || !prompt.trim() || !model || !scene?.storageKey} onClick={() => void submit()}>
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
