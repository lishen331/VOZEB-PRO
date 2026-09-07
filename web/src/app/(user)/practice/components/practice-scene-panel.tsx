"use client";

import { Button, Input } from "antd";
import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { practiceApi } from "@/services/api/practice";
import { WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { ModelField } from "./practice-storyboard-image-panel";

export default function PracticeScenePanel({ capability, onCreated }: PracticePanelProps) {
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState(capability.models[0]?.id);
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => workflowFieldDefaults(capability));
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (!prompt.trim() || !model || busy) return;
        setBusy(true);
        try { onCreated((await practiceApi.createSession({ module: "scene", mode: "workflow", title: "场景练习", workflowCode: "scene_main_view", input: { prompt: prompt.trim(), workflowCode: "scene_main_view", ...workflowInput }, logicalModelId: model, clientRequestId: crypto.randomUUID() })).session); }
        finally { setBusy(false); }
    };
    return <div className="space-y-4">
        <ModelField capability={capability} value={model} onChange={setModel} />
        <label className="block text-sm font-medium">场景描述<Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} autoSize={{ minRows: 5, maxRows: 10 }} className="!mt-2" placeholder="描述空间结构、时间、光线和氛围" /></label>
        <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
        <Button type="primary" icon={<ImagePlus className="size-4" />} loading={busy} disabled={!capability.available || !model || !prompt.trim()} onClick={() => void submit()}>生成场景图</Button>
    </div>;
}
