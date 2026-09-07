"use client";
import { Button, Input, InputNumber } from "antd";
import { Mic2 } from "lucide-react";
import { useState } from "react";
import { practiceApi } from "@/services/api/practice";
import { WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { ModelField } from "./practice-storyboard-image-panel";

export type PracticeDialogueLine = { text: string; audio?: string; emotion?: Record<string, number> };
const EMOTION_KEYS = ["happy", "sad", "disgust", "fear", "surprise", "angry"] as const;
export function normalizePracticeDialogueLines(lines: PracticeDialogueLine[]) {
    return lines.filter((line) => line.text.trim() && !/^-[0-9]+(?:\.[0-9]+)?s-$/.test(line.text.trim())).map((line) => ({ text: line.text.trim(), ...(line.audio?.trim() ? { audio: line.audio.trim() } : {}), ...(line.emotion && Object.keys(line.emotion).length ? { emotion: line.emotion } : {}) }));
}
export default function PracticeDubbingPanel({ capability, onCreated }: PracticePanelProps) {
    const [text, setText] = useState("");
    const [lines, setLines] = useState<PracticeDialogueLine[]>([{ text: "" }]);
    const [model, setModel] = useState(capability.models[0]?.id);
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => workflowFieldDefaults(capability));
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (!text.trim() || !model || busy) return;
        const normalizedLines = normalizePracticeDialogueLines(lines);
        setBusy(true);
        try {
            onCreated((await practiceApi.createSession({ module: "dubbing", mode: "workflow", title: "配音练习", workflowCode: "storyboard_dialogue_audio", input: { text: text.trim(), lines: normalizedLines, workflowCode: "storyboard_dialogue_audio", ...workflowInput }, logicalModelId: model, clientRequestId: crypto.randomUUID() })).session);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-4">
            <ModelField capability={capability} value={model} onChange={setModel} />
            <label className="block text-sm font-medium">
                配音文本
                <Input.TextArea value={text} onChange={(event) => setText(event.target.value)} autoSize={{ minRows: 7, maxRows: 14 }} className="!mt-2" />
            </label>
            <div className="space-y-2 border border-border p-3">
                <div className="text-sm font-medium">有效台词与音色</div>
                {lines.map((line, index) => <div key={index} className="space-y-2"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><Input value={line.text} placeholder="台词；停顿可写 -0.8s-" onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} /><Input value={line.audio || ""} placeholder="音色素材地址（可选）" onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, audio: event.target.value } : item))} /></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-6">{EMOTION_KEYS.map((key) => <label key={key} className="text-xs text-muted-foreground">{key}<InputNumber min={0} max={1.4} step={0.1} value={line.emotion?.[key]} onChange={(value) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, emotion: { ...(item.emotion || {}), ...(value === null ? {} : { [key]: value }) } } : item))} className="!mt-1 !w-full" /></label>)}</div></div>)}
                <Button size="small" onClick={() => setLines((current) => [...current, { text: "" }])} disabled={lines.length >= 10}>增加台词</Button>
            </div>
            <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <Button type="primary" icon={<Mic2 className="size-4" />} loading={busy} disabled={!capability.available || !model || !text.trim()} onClick={() => void submit()}>
                开始配音
            </Button>
        </div>
    );
}
