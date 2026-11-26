"use client";

import { useState } from "react";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Button, Tag } from "@/components/gamma-ui/gamma-ant";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Modal } from "@/components/gamma-ui/gamma-ant-modal";
import { displayWorkCount } from "@/lib/work-display-count";
import { updateAdminWorkPresentation, type WorkPublication } from "@/services/api/work-publications";

export function AdminWorkDisplayCounts({ work, onClose, onSaved }: { work: WorkPublication; onClose: () => void; onSaved: (work: WorkPublication) => void }) {
    const { message } = App.useApp();
    const currentViews = displayWorkCount(work.viewCount, work.displayViewOffset);
    const currentLikes = displayWorkCount(work.likeCount, work.displayLikeOffset);
    const [views, setViews] = useState(String(currentViews));
    const [likes, setLikes] = useState(String(currentLikes));
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const validCount = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
    const canSave = Boolean(reason.trim()) && validCount(views) && validCount(likes);
    const adjusted = Boolean(work.displayViewOffset || work.displayLikeOffset);

    async function save(restore: boolean) {
        if (saving || !reason.trim() || (!restore && !canSave)) return;
        setSaving(true);
        setError("");
        try {
            const updated = await updateAdminWorkPresentation(work.id, restore ? { action: "restore", reason } : { action: "counts", viewCount: Number(views), likeCount: Number(likes), reason });
            message.success(restore ? "已恢复真实数据" : "展示数据已更新");
            onSaved(updated);
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "更新展示数据失败");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            title="调整展示数据"
            width={520}
            okText="保存展示数据"
            onOk={() => void save(false)}
            onCancel={onClose}
            closable={!saving}
            keyboard={!saving}
            maskClosable={!saving}
            confirmLoading={saving}
            cancelButtonProps={{ disabled: saving }}
            okButtonProps={{ disabled: !canSave }}
        >
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-medium">{work.currentVersion?.title}</p>
                    <Tag className="m-0" color={adjusted ? "blue" : undefined}>
                        当前状态：{adjusted ? "已调整" : "未调整"}
                    </Tag>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                        <span className="block text-sm">观看展示数量</span>
                        <Input inputMode="numeric" value={views} disabled={saving} onChange={(event) => setViews(event.target.value)} />
                        <span className="block text-xs text-[var(--gm-text-3)]">
                            真实 {work.viewCount} · 当前展示 {currentViews} · 偏移 {formatOffset(work.displayViewOffset)}
                        </span>
                    </label>
                    <label className="space-y-1">
                        <span className="block text-sm">点赞展示数量</span>
                        <Input inputMode="numeric" value={likes} disabled={saving} onChange={(event) => setLikes(event.target.value)} />
                        <span className="block text-xs text-[var(--gm-text-3)]">
                            真实 {work.likeCount} · 当前展示 {currentLikes} · 偏移 {formatOffset(work.displayLikeOffset)}
                        </span>
                    </label>
                </div>
                <label className="block space-y-1">
                    <span className="block text-sm">调整原因</span>
                    <Input.TextArea rows={2} maxLength={500} value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} />
                </label>
                {!validCount(views) || !validCount(likes) ? <p className="text-sm text-[var(--gm-text-3)]">请输入非负整数。</p> : null}
                {adjusted ? (
                    <Button disabled={saving || !reason.trim()} onClick={() => void save(true)}>
                        恢复真实数据
                    </Button>
                ) : null}
                {error ? (
                    <p role="alert" className="text-sm text-rose-500">
                        {error}
                    </p>
                ) : null}
            </div>
        </Modal>
    );
}

function formatOffset(offset = 0) {
    return offset > 0 ? `+${offset}` : String(offset);
}
