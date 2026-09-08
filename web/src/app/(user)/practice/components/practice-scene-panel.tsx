"use client";
import { PracticePromptEditor } from "./practice-prompt-editor";

import { App, Button } from "antd";
import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { practiceApi } from "@/services/api/practice";
import { WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { ModelField } from "./practice-storyboard-image-panel";

export default function PracticeScenePanel({ capability, onCreated }: PracticePanelProps) {
    const { message } = App.useApp();
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState(capability.models[0]?.id);
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => workflowFieldDefaults(capability));
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (!prompt.trim() || !model || busy) return;
        setBusy(true);
        try {
            onCreated(
                (
                    await practiceApi.createSession({
                        module: "scene",
                        mode: "workflow",
                        title: "场景练习",
                        workflowCode: "scene_main_view",
                        input: { prompt: prompt.trim(), workflowCode: "scene_main_view", ...workflowInput },
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
            <PracticePromptEditor briefLabel="场景设定" label="场景描述" value={prompt} onChange={setPrompt} disabled={busy} mode="image" />
            <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <Button type="primary" block size="large" icon={<ImagePlus className="size-4" />} loading={busy} disabled={!capability.available || !model || !prompt.trim()} onClick={() => void submit()}>
                生成场景图
            </Button>
        </div>
    );
}
