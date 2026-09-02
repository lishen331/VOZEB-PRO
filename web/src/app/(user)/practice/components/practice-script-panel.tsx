"use client";

import { Button, Input } from "antd";
import { Save } from "lucide-react";
import { useState } from "react";
import { practiceApi, type PracticeSession } from "@/services/api/practice";
import type { PracticePanelProps } from "./practice-panel-types";

export default function PracticeScriptPanel({ onCreated }: PracticePanelProps) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const save = async () => {
        if (!title.trim() || !content.trim() || saving) return;
        setSaving(true);
        try {
            const result = await practiceApi.createSession({ module: "script", mode: "manual", title: title.trim(), input: { title: title.trim(), content: content.trim(), ...(notes.trim() ? { notes: notes.trim() } : {}) }, clientRequestId: crypto.randomUUID() });
            onCreated(result.session as PracticeSession);
        } finally {
            setSaving(false);
        }
    };
    return <div className="space-y-4"><label className="block text-sm font-medium">剧本标题<Input value={title} onChange={(event) => setTitle(event.target.value)} className="!mt-2" placeholder="例如：雨夜重逢" /></label><label className="block text-sm font-medium">剧本正文<Input.TextArea value={content} onChange={(event) => setContent(event.target.value)} autoSize={{ minRows: 10, maxRows: 20 }} className="!mt-2" placeholder="用自己的话写下场景、人物和对白" /></label><label className="block text-sm font-medium">备注（可选）<Input.TextArea value={notes} onChange={(event) => setNotes(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} className="!mt-2" /></label><Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!title.trim() || !content.trim()} onClick={() => void save()}>保存草稿</Button></div>;
}
