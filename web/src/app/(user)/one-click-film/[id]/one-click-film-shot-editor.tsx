"use client";

import { Button, Input, Modal, Segmented, Tabs, message } from "antd";
import { useEffect, useState } from "react";
import type { DramaProject, DramaShot, DramaShotFrameType } from "@/lib/drama-project-contract";

type Props = {
    projectId: string;
    episodeId: string;
    shot: DramaShot;
    onClose: () => void;
    onProjectChange: (project: DramaProject) => void;
};

type FramePrompt = { frameType: DramaShotFrameType; prompt: string; description?: string; layout?: string };

async function callJson(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as { code?: number; data?: Record<string, unknown>; msg?: string };
    if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "请求失败");
    return payload.data;
}

/**
 * 分镜编辑弹窗。
 *
 * 字段与保存语义对齐 L `storyboardService.updateStoryboard` 的白名单，
 * 首尾帧提示词走 L `frame_prompts` 的整条覆盖语义（prompt/description/layout 一起写）。
 * 全部调用一键成片自有路由。
 */
export function OneClickFilmShotEditor({ projectId, episodeId, shot, onClose, onProjectChange }: Props) {
    const base = `/api/one-click-film/projects/${encodeURIComponent(projectId)}`;
    const query = `?episodeId=${encodeURIComponent(episodeId)}`;

    const [title, setTitle] = useState(shot.title || "");
    const [description, setDescription] = useState(shot.description || "");
    const [dialogue, setDialogue] = useState(shot.dialogue || "");
    const [narration, setNarration] = useState(shot.narration || "");
    const [imagePrompt, setImagePrompt] = useState(shot.imagePrompt || "");
    const [videoPrompt, setVideoPrompt] = useState(shot.videoPrompt || "");
    const [saving, setSaving] = useState(false);

    const [frameType, setFrameType] = useState<DramaShotFrameType>("first");
    const [framePrompts, setFramePrompts] = useState<FramePrompt[]>([]);
    const [framePrompt, setFramePrompt] = useState("");
    const [frameDescription, setFrameDescription] = useState("");
    const [frameLayout, setFrameLayout] = useState("");
    const [frameSaving, setFrameSaving] = useState(false);
    const [frameGenerating, setFrameGenerating] = useState(false);
    const [polishing, setPolishing] = useState(false);
    const [polishedPrompt, setPolishedPrompt] = useState(shot.polishedPrompt || "");

    useEffect(() => {
        let cancelled = false;
        void callJson(`${base}/shots/${encodeURIComponent(shot.id)}/frame-prompts${query}`, { cache: "no-store" })
            .then((data) => {
                if (cancelled) return;
                setFramePrompts((data?.framePrompts as FramePrompt[]) || []);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [base, query, shot.id]);

    useEffect(() => {
        const current = framePrompts.find((item) => item.frameType === frameType);
        setFramePrompt(current?.prompt || "");
        setFrameDescription(current?.description || "");
        setFrameLayout(current?.layout || "");
    }, [frameType, framePrompts]);

    const saveShot = async () => {
        setSaving(true);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}${query}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, description, dialogue, narration, imagePrompt, videoPrompt }),
            });
            if (data?.project) onProjectChange(data.project as DramaProject);
            message.success("分镜已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "分镜保存失败");
        } finally {
            setSaving(false);
        }
    };

    const saveFramePrompt = async () => {
        if (!framePrompt.trim()) return message.warning("提示词不能为空");
        setFrameSaving(true);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/frame-prompts/${frameType}${query}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: framePrompt, description: frameDescription, layout: frameLayout }),
            });
            setFramePrompts((data?.framePrompts as FramePrompt[]) || []);
            message.success("帧提示词已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "帧提示词保存失败");
        } finally {
            setFrameSaving(false);
        }
    };

    /**
     * 对应 L `POST /storyboards/:id/frame-prompt`：由 AI 规划该帧提示词并直接提交帧图任务。
     * 走一键成片自有路由，计费归属 one-click-film。
     */
    const generateFrame = async () => {
        setFrameGenerating(true);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/generate-frame${query}&frameType=${frameType}`, { method: "POST" });
            if (typeof data?.prompt === "string") setFramePrompt(data.prompt);
            if (typeof data?.description === "string") setFrameDescription(data.description);
            message.success("已由 AI 规划该帧提示词并提交帧图任务");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "帧提示词生成失败");
        } finally {
            setFrameGenerating(false);
        }
    };

    /**
     * 对应 L `POST /storyboards/:id/polish-prompt`：把本镜字段交给文本模型润色，
     * 结果写回 polishedPrompt（经典单图生成会优先取它）。
     */
    const polishImagePrompt = async () => {
        setPolishing(true);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/polish-prompt${query}`, { method: "POST" });
            if (typeof data?.polishedPrompt === "string") setPolishedPrompt(data.polishedPrompt);
            if (data?.project) onProjectChange(data.project as DramaProject);
            message.success("已润色图片提示词");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片提示词润色失败");
        } finally {
            setPolishing(false);
        }
    };

    return (
        <Modal open width={760} title={`编辑分镜 · ${shot.title || "未命名"}`} onCancel={onClose} footer={null} destroyOnHidden>
            <Tabs
                items={[
                    {
                        key: "basic",
                        label: "基础字段",
                        children: (
                            <div className="grid gap-3">
                                <label className="grid gap-1 text-sm">
                                    标题
                                    <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="分镜标题" />
                                </label>
                                <label className="grid gap-1 text-sm">
                                    描述
                                    <Input.TextArea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} aria-label="分镜描述" />
                                </label>
                                <label className="grid gap-1 text-sm">
                                    对白
                                    <Input.TextArea rows={2} value={dialogue} onChange={(event) => setDialogue(event.target.value)} aria-label="分镜对白" />
                                </label>
                                <label className="grid gap-1 text-sm">
                                    旁白
                                    <Input.TextArea rows={2} value={narration} onChange={(event) => setNarration(event.target.value)} aria-label="分镜旁白" />
                                </label>
                                <div className="flex justify-end">
                                    <Button type="primary" loading={saving} onClick={() => void saveShot()} aria-label="保存分镜">
                                        保存
                                    </Button>
                                </div>
                            </div>
                        ),
                    },
                    {
                        key: "prompts",
                        label: "提示词",
                        children: (
                            <div className="grid gap-3">
                                <label className="grid gap-1 text-sm">
                                    图片提示词
                                    <Input.TextArea rows={4} value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} aria-label="图片提示词" />
                                </label>
                                <label className="grid gap-1 text-sm">
                                    视频提示词
                                    <Input.TextArea rows={4} value={videoPrompt} onChange={(event) => setVideoPrompt(event.target.value)} aria-label="视频提示词" />
                                </label>
                                <label className="grid gap-1 text-sm">
                                    润色后的图片提示词（经典单图生成优先使用）
                                    <Input.TextArea rows={4} value={polishedPrompt} readOnly placeholder="点击「AI 润色图片提示词」后生成" aria-label="润色后的图片提示词" />
                                </label>
                                <div className="flex justify-end gap-2">
                                    <Button loading={polishing} onClick={() => void polishImagePrompt()} aria-label="AI 润色图片提示词">
                                        AI 润色图片提示词
                                    </Button>
                                    <Button type="primary" loading={saving} onClick={() => void saveShot()} aria-label="保存提示词">
                                        保存
                                    </Button>
                                </div>
                            </div>
                        ),
                    },
                    {
                        key: "frames",
                        label: "首尾帧提示词",
                        children: (
                            <div className="grid gap-3">
                                <Segmented
                                    value={frameType}
                                    onChange={(value) => setFrameType(value as DramaShotFrameType)}
                                    options={[
                                        { value: "first", label: "首帧" },
                                        { value: "key", label: "关键帧" },
                                        { value: "last", label: "尾帧" },
                                    ]}
                                />
                                <label className="grid gap-1 text-sm">
                                    提示词
                                    <Input.TextArea rows={4} value={framePrompt} onChange={(event) => setFramePrompt(event.target.value)} aria-label="帧提示词" />
                                </label>
                                <label className="grid gap-1 text-sm">
                                    描述
                                    <Input.TextArea rows={2} value={frameDescription} onChange={(event) => setFrameDescription(event.target.value)} aria-label="帧描述" />
                                </label>
                                <label className="grid gap-1 text-sm">
                                    空间布局
                                    <Input.TextArea rows={2} value={frameLayout} onChange={(event) => setFrameLayout(event.target.value)} aria-label="帧空间布局" />
                                </label>
                                <p className="text-xs text-muted-foreground">保存会整条覆盖该帧的提示词、描述与布局（与 L 一致）；已生成的帧图不受影响。</p>
                                <div className="flex justify-end gap-2">
                                    <Button loading={frameGenerating} onClick={() => void generateFrame()} aria-label="AI 生成帧提示词">
                                        AI 生成该帧
                                    </Button>
                                    <Button type="primary" loading={frameSaving} onClick={() => void saveFramePrompt()} aria-label="保存帧提示词">
                                        保存帧提示词
                                    </Button>
                                </div>
                            </div>
                        ),
                    },
                ]}
            />
        </Modal>
    );
}
