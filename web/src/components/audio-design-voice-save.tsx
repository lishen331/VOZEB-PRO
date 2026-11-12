"use client";

import { useState } from "react";
import { App, Input, Modal } from "antd";
import { BookmarkPlus } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";

/**
 * 设计模式生成完之后的一条提示：这个声音只在本次有效，点保存才进入「我的音色」。
 * 保存走已有的 PATCH /api/custom-voices/{id}，只改 saved 和名称，不重新创建上游音色、不扣费。
 */
export function AudioDesignVoiceSave({ voiceId, defaultName, theme, onSaved }: { voiceId: string; defaultName: string; theme: CanvasTheme; onSaved: () => void }) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(defaultName.slice(0, 50));
    const [saving, setSaving] = useState(false);

    const save = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            message.warning("给这个音色起个名字");
            return;
        }
        setSaving(true);
        try {
            const response = await fetch(`/api/custom-voices/${encodeURIComponent(voiceId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed, saved: true }),
            });
            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "保存音色失败");
            message.success("已存入我的音色");
            setOpen(false);
            onSaved();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存音色失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2 text-[11px]" aria-live="polite">
            <span style={{ color: theme.node.muted }}>这个声音满意吗？</span>
            <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium hover:opacity-75"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                onClick={() => setOpen(true)}
            >
                <BookmarkPlus className="size-3" />
                存为我的音色
            </button>
            <Modal title="存为我的音色" open={open} onCancel={() => setOpen(false)} onOk={() => void save()} okText="保存" cancelText="取消" confirmLoading={saving} destroyOnHidden width={360}>
                <p className="mb-2 text-xs text-[#7b8591] dark:text-[#98a2ae]">保存后可以在任意音频节点里直接选用，不用重新设计。</p>
                <Input value={name} maxLength={50} placeholder="音色名称" onChange={(event) => setName(event.target.value)} onPressEnter={() => void save()} autoFocus />
            </Modal>
        </div>
    );
}
