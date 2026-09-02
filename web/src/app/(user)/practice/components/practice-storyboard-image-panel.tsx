"use client";
import { Button, Input, Select } from "antd";
import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { IpReferencePicker } from "@/components/ip-library/ip-reference-picker";
import { IP_REFERENCE_ENTRY_VISIBLE } from "@/lib/ip-library-domain";
import { practiceApi } from "@/services/api/practice";
import { WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
export default function PracticeStoryboardImagePanel({ capability, ipReferences, onIpReferencesChange, onCreated }: PracticePanelProps) {
    const [prompt, setPrompt] = useState(""); const [model, setModel] = useState(capability.models[0]?.id); const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => workflowFieldDefaults(capability)); const [busy, setBusy] = useState(false);
    const submit = async () => { if (!prompt.trim() || !model || busy) return; setBusy(true); try { onCreated((await practiceApi.createSession({ module: "storyboard-image", mode: "workflow", title: "分镜图练习", input: { prompt: prompt.trim(), ...workflowInput }, references: ipReferences, logicalModelId: model, clientRequestId: crypto.randomUUID() })).session); } finally { setBusy(false); } };
    return <div className="space-y-4"><ModelField capability={capability} value={model} onChange={setModel} /><label className="block text-sm font-medium">画面描述<Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} autoSize={{ minRows: 5, maxRows: 10 }} className="!mt-2" placeholder="描述构图、景别、光线和主体" /></label><WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />{IP_REFERENCE_ENTRY_VISIBLE ? <IpReferencePicker compact value={ipReferences} onChange={onIpReferencesChange} /> : null}<Button type="primary" icon={<ImagePlus className="size-4" />} loading={busy} disabled={!capability.available || !prompt.trim() || !model} onClick={() => void submit()}>生成分镜图</Button></div>;
}
export function ModelField({ capability, value, onChange }: { capability: PracticePanelProps["capability"]; value?: string; onChange: (value: string) => void }) { if (capability.models.length === 1) return <p className="text-sm">开源模型：<span className="font-medium">{capability.models[0].label}</span></p>; return <label className="block text-sm font-medium">开源模型<Select value={value} onChange={onChange} options={capability.models.map((item) => ({ value: item.id, label: item.label }))} className="!mt-2 !w-full" placeholder="选择模型" /></label>; }
