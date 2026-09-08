"use client";
import { App, Button, Input, Slider } from "antd";
import { Mic2 } from "lucide-react";
import { useState } from "react";
import { practiceApi } from "@/services/api/practice";
import { WorkflowOptionalFields, workflowFieldDefaults, type PracticePanelProps } from "./practice-panel-types";
import { PracticeMediaInput } from "./practice-media-input";
import { uploadMediaFile } from "@/services/file-storage";
import { ModelField } from "./practice-storyboard-image-panel";

export type PracticeDialogueLine = { text: string; audio?: string; emotion?: Record<string, number> };
const EMOTION_LABELS: Record<string, string> = { happy: "开心", sad: "悲伤", disgust: "厌恶", fear: "恐惧", surprise: "惊讶", angry: "愤怒" };
const EMOTION_KEYS = ["happy", "sad", "disgust", "fear", "surprise", "angry"] as const;
export function normalizePracticeDialogueLines(lines: PracticeDialogueLine[]) {
    return lines
        .filter((line) => line.text.trim() && !/^-[0-9]+(?:\.[0-9]+)?s-$/.test(line.text.trim()))
        .map((line) => ({ text: line.text.trim(), ...(line.audio?.trim() ? { audio: line.audio.trim() } : {}), ...(line.emotion && Object.keys(line.emotion).length ? { emotion: line.emotion } : {}) }));
}
export default function PracticeDubbingPanel({ capability, onCreated }: PracticePanelProps) {
    const { message } = App.useApp();
    const [text, setText] = useState("");
    const [lines, setLines] = useState<PracticeDialogueLine[]>([{ text: "" }]);
    const [model, setModel] = useState(capability.models[0]?.id);
    const [workflowInput, setWorkflowInput] = useState<Record<string, unknown>>(() => workflowFieldDefaults(capability));
    const [uploading, setUploading] = useState(false);
    const chooseVoice = async (index: number, file?: File) => {
        if (!file) return;
        setUploading(true);
        try {
            const uploaded = await uploadMediaFile(file, "audio");
            setLines((current) => current.map((line, i) => (i === index ? { ...line, audio: uploaded.url } : line)));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "音色上传失败");
        } finally {
            setUploading(false);
        }
    };
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (!text.trim() || !model || busy || uploading) return;
        const normalizedLines = normalizePracticeDialogueLines(lines.map((line, index) => (index === 0 && !line.text.trim() ? { ...line, text: text.trim() } : line)));
        setBusy(true);
        try {
            onCreated(
                (
                    await practiceApi.createSession({
                        module: "dubbing",
                        mode: "workflow",
                        title: "配音练习",
                        workflowCode: "storyboard_dialogue_audio",
                        input: { text: text.trim(), lines: normalizedLines, workflowCode: "storyboard_dialogue_audio", ...workflowInput },
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
            <label className="block text-sm font-medium">
                配音文本
                <Input.TextArea value={text} onChange={(event) => setText(event.target.value)} autoSize={{ minRows: 7, maxRows: 14 }} className="!mt-2" />
            </label>
            <div className="space-y-2 border border-border p-3">
                <div className="text-sm font-medium">有效台词与音色</div>
                {lines.map((line, index) => (
                    <div key={index} className="space-y-3 rounded-lg bg-muted/25 p-3">
                        <div className="flex items-center justify-between text-xs font-medium">
                            <span>台词 {index + 1}</span>
                            <Button size="small" type="text" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>
                                移除台词
                            </Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <Input
                                aria-label={`台词 ${index + 1}`}
                                value={line.text}
                                placeholder="台词；停顿可写 -0.8s-"
                                onChange={(event) => setLines((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, text: event.target.value } : item)))}
                            />
                            <Input
                                aria-label={`音色素材地址 ${index + 1}`}
                                value={line.audio || ""}
                                placeholder="音色素材地址（可选）"
                                onChange={(event) => setLines((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, audio: event.target.value } : item)))}
                            />
                        </div>
                        <PracticeMediaInput
                            label={`台词 ${index + 1} 参考音色`}
                            accept="audio/*"
                            url={line.audio}
                            disabled={busy || uploading}
                            onChoose={(file) => void chooseVoice(index, file)}
                            onRemove={() => setLines((current) => current.map((item, i) => (i === index ? { ...item, audio: undefined } : item)))}
                        />
                        <div className="rounded-lg border border-border p-3">
                            <div className="mb-3 flex justify-between text-sm font-medium">
                                <span>六维情绪</span>
                                <span className="text-xs text-muted-foreground">0.00 — 1.40</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                                {EMOTION_KEYS.map((key) => (
                                    <label key={key} className="text-xs text-muted-foreground">
                                        <span className="flex justify-between gap-2">
                                            <span>{EMOTION_LABELS[key]}</span>
                                            <span>{(line.emotion?.[key] || 0).toFixed(2)}</span>
                                        </span>
                                        <Slider
                                            ariaLabelForHandle={`台词 ${index + 1} ${EMOTION_LABELS[key]}`}
                                            min={0}
                                            max={1.4}
                                            step={0.01}
                                            value={line.emotion?.[key] || 0}
                                            onChange={(value) => setLines((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, emotion: { ...(item.emotion || {}), ...(value === null ? {} : { [key]: value }) } } : item)))}
                                            className="!mt-1 !w-full"
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
                <Button size="small" onClick={() => setLines((current) => [...current, { text: "" }])} disabled={lines.length >= 10}>
                    增加台词
                </Button>
            </div>
            <WorkflowOptionalFields capability={capability} value={workflowInput} onChange={(key, value) => setWorkflowInput((current) => ({ ...current, [key]: value }))} />
            <Button type="primary" block size="large" icon={<Mic2 className="size-4" />} loading={busy || uploading} disabled={!capability.available || !model || !text.trim()} onClick={() => void submit()}>
                开始配音
            </Button>
        </div>
    );
}
