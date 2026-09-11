"use client";

import { App, Button, Input, Segmented } from "antd";
import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { practiceApi } from "@/services/api/practice";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { type PracticePanelProps, capabilityForWorkflow, PracticeSizeField, WorkflowFormFields, WorkflowOptionalFields, workflowFieldDefaults } from "./practice-panel-types";
import { PracticeMediaInput } from "./practice-media-input";
import { PracticePromptEditor } from "./practice-prompt-editor";
import { ModelField } from "./practice-storyboard-image-panel";
import { PracticeAssetPicker } from "./practice-asset-picker";

export default function PracticeCharacterPanel({ capability, onCreated }: PracticePanelProps) {
    const [view, setView] = useState("character_main_view");
    const [model, setModel] = useState(capability.models[0]?.id);
    const options = capability.models.find((item) => item.id === model)?.workflowOptions || capability.workflowOptions;
    const active = capabilityForWorkflow(capability, view, model);
    return (
        <div className="space-y-5">
            <ModelField capability={capability} value={model} onChange={setModel} />
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">角色视图</span>
                <Segmented
                    aria-label="角色视图"
                    value={view}
                    onChange={setView}
                    options={[
                        { label: "主形象", value: "character_main_view", disabled: Boolean(options?.length && !options.some((item) => item.code === "character_main_view")) },
                        { label: "多视图", value: "character_multi_view", disabled: !options?.some((item) => item.code === "character_multi_view") },
                    ]}
                />
            </div>
            <CharacterForm key={`${model}:${view}`} capability={active} model={model} workflowCode={view} onCreated={onCreated} />
        </div>
    );
}

function CharacterForm({ capability, model, workflowCode, onCreated }: { capability: PracticePanelProps["capability"]; model?: string; workflowCode: string; onCreated: PracticePanelProps["onCreated"] }) {
    const multi = workflowCode === "character_multi_view";
    const [prompt, setPrompt] = useState("");
    const [image, setImage] = useState<UploadedImage>();
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => workflowFieldDefaults(capability));
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const { message } = App.useApp();
    const chooseImage = async (file?: File) => {
        if (!file || !file.type.startsWith("image/")) return;
        setUploading(true);
        try {
            setImage(await uploadImage(file));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "上传失败");
        } finally {
            setUploading(false);
        }
    };
    const promptRequired = !multi || capability.inputSchema.some((field) => field.key === "prompt" && field.required);
    const submit = async () => {
        if (!capability.available || !model || busy || uploading || (promptRequired && !prompt.trim()) || (multi && !image?.storageKey)) return;
        setBusy(true);
        try {
            onCreated(
                (
                    await practiceApi.createSession({
                        module: "character",
                        mode: "workflow",
                        title: multi ? "角色多视图" : "角色主形象",
                        workflowCode,
                        input: { ...workflowInput, prompt: prompt.trim(), workflowCode },
                        references: image?.storageKey ? [{ type: "asset", id: image.storageKey, inputKey: "referenceImage" }] : [],
                        logicalModelId: model,
                        clientRequestId: crypto.randomUUID(),
                    })
                ).session,
            );
        } catch (error) {
            message.error(error instanceof Error ? error.message : "生成提交失败");
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-5">
            {multi ? (
                <>
                    <PracticeMediaInput label={`主形象参考图${multi ? "（必需）" : "（可选）"}`} url={image?.url} disabled={uploading || busy} onChoose={(file) => void chooseImage(file)} onRemove={() => setImage(undefined)}>
                        <PracticeAssetPicker dramaAssetType="character" disabled={uploading || busy} onSelect={setImage} />
                    </PracticeMediaInput>
                </>
            ) : null}
            {multi ? (
                <label className="block text-sm font-medium">
                    角色描述（可选）
                    <Input.TextArea aria-label="角色描述" value={prompt} onChange={(event) => setPrompt(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} className="!mt-2" />
                </label>
            ) : (
                <PracticePromptEditor briefLabel="角色设定" label="角色描述" placeholder="描述外观、服装、气质和视觉风格" value={prompt} onChange={setPrompt} disabled={busy}>
                    <PracticeMediaInput label={`主形象参考图${multi ? "（必需）" : "（可选）"}`} url={image?.url} disabled={uploading || busy} onChoose={(file) => void chooseImage(file)} onRemove={() => setImage(undefined)}>
                        <PracticeAssetPicker dramaAssetType="character" disabled={uploading || busy} onSelect={setImage} />
                    </PracticeMediaInput>
                </PracticePromptEditor>
            )}
            <PracticeSizeField capability={capability} value={workflowInput} onChange={(patch) => setWorkflowInput((current) => ({ ...current, ...patch }))} />
            <WorkflowFormFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <Button
                type="primary"
                block
                size="large"
                icon={<ImagePlus className="size-4" />}
                loading={busy || uploading}
                disabled={!capability.available || !model || (promptRequired && !prompt.trim()) || (multi && !image?.storageKey)}
                onClick={() => void submit()}
            >
                {multi ? "生成角色多视图" : "生成角色主视图"}
            </Button>
        </div>
    );
}
