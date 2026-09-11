"use client";

import { Alert, Button, Card, Space, Tag, message } from "antd";
import { RefreshCw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function DramaLabFinalVideoPanel({ projectId, episodeId, disabled, totalShots, videoShots }: { projectId: string; episodeId: string; disabled: boolean; totalShots: number; videoShots: number }) {
    type FinalVideoTaskView = {
        id: string;
        status: "pending" | "running" | "success" | "error" | "cancelled" | "needs_review";
        result?: { artifactId?: string; url?: string; mimeType?: string };
        error?: string;
    };
    const [task, setTask] = useState<FinalVideoTaskView | null>(null);
    const [loading, setLoading] = useState(false);
    const requestId = useRef(`final-video-${crypto.randomUUID()}`);
    const endpoint = `/api/drama-lab/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/render`;
    const refresh = async (taskId: string) => {
        const response = await fetch(`${endpoint}?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.msg || "任务查询失败");
        setTask(payload.data);
    };
    useEffect(() => {
        const saved = window.sessionStorage.getItem(`drama-lab-final-video:${projectId}:${episodeId}`);
        if (!saved) return;
        void refresh(saved).catch(() => undefined);
    }, [projectId, episodeId]);
    useEffect(() => {
        if (!task || !["pending", "running"].includes(task.status)) return;
        const timer = window.setInterval(() => void refresh(task.id).catch(() => undefined), 2000);
        return () => window.clearInterval(timer);
    }, [task]);
    const create = async () => {
        if (disabled) return message.warning("团队审批尚未完成");
        if (videoShots < totalShots) return message.error("请先完成当前剧集全部分镜视频");
        setLoading(true);
        try {
            const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: requestId.current }) });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.msg || "成片任务创建失败");
            setTask(payload.data);
            window.sessionStorage.setItem(`drama-lab-final-video:${projectId}:${episodeId}`, payload.data.id);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "成片任务创建失败");
        } finally {
            setLoading(false);
        }
    };
    const action = async (name: "cancel" | "retry") => {
        if (!task) return;
        setLoading(true);
        try {
            const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, action: name }) });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.msg || "任务操作失败");
            setTask(payload.data);
            window.sessionStorage.setItem(`drama-lab-final-video:${projectId}:${episodeId}`, payload.data.id);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "任务操作失败");
        } finally {
            setLoading(false);
        }
    };
    const status = task?.status;
    const previewUrl = status === "success" && task?.result?.url ? task.result.url : undefined;
    return (
        <Card size="small" title="合成成片视频" extra={status ? <Tag color={status === "success" ? "green" : status === "error" ? "red" : "blue"}>{status}</Tag> : null}>
            <Space direction="vertical" className="w-full">
                {previewUrl ? <video src={previewUrl} controls preload="metadata" className="mx-auto aspect-video w-full max-w-2xl rounded object-contain" aria-label="合成成片视频预览" /> : null}
                <div className="flex w-full items-center justify-between gap-4">
                    <div className="min-w-0 flex-1 text-sm text-muted-foreground">将当前剧集全部分镜合成为 MP4 成片，不是项目归档 ZIP 或剪映草稿。</div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <Button type="primary" icon={<RefreshCw className="size-4" />} loading={loading} disabled={disabled || videoShots < totalShots || (status ? ["pending", "running"].includes(status) : false)} onClick={() => void create()}>
                            {status === "success" ? "重新合成成片视频" : "合成成片视频"}
                        </Button>
                        {status === "pending" || status === "running" ? (
                            <Button icon={<Square className="size-4" />} onClick={() => void action("cancel")}>
                                取消成片任务
                            </Button>
                        ) : null}
                        {status && ["error", "cancelled", "needs_review"].includes(status) ? <Button onClick={() => void action("retry")}>重试成片</Button> : null}
                    </div>
                </div>
                {videoShots < totalShots ? <Alert type="warning" showIcon message={`还有 ${totalShots - videoShots} 个分镜视频未完成`} /> : null}
            </Space>
        </Card>
    );
}
