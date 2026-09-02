"use client";

import { Button, Empty, Spin } from "antd";
import { RefreshCw } from "lucide-react";

import type { PracticeModuleKind } from "@/lib/practice-domain";
import type { PracticeSession } from "@/services/api/practice";

const WAITING: Record<PracticeModuleKind, string> = {
    script: "等待保存剧本",
    "storyboard-image": "等待生成分镜图",
    "storyboard-video": "等待生成分镜视频",
    dubbing: "等待生成配音",
    music: "等待生成音乐",
};

export function PracticeSessionResult({ module, session, onRetry, onRefresh }: { module: PracticeModuleKind; session?: PracticeSession | null; onRetry: () => void; onRefresh: () => void }) {
    if (!session) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={WAITING[module]} className="!my-8" />;
    if (session.status === "draft") return <p className="mt-4 text-sm text-muted-foreground">剧本草稿已保存，可继续编辑。</p>;
    if (session.status === "queued" || session.status === "running" || session.result?.status === "pending" || session.result?.status === "running")
        return (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Spin size="small" />
                {session.status === "queued" ? "已排队，等待生成" : "正在生成，请刷新查看结果"}
                <Button type="text" size="small" icon={<RefreshCw className="size-3.5" />} onClick={onRefresh} aria-label="刷新练习状态" />
            </p>
        );
    if (session.status === "failed" || session.result?.status === "error")
        return (
            <div className="mt-4 flex items-center justify-between gap-3 text-sm text-red-600 dark:text-red-300">
                <span>{session.errorMessage || session.result?.error || "练习失败，请重试"}</span>
                <Button size="small" onClick={onRetry}>
                    重试
                </Button>
            </div>
        );
    if (session.status === "cancelled" || session.result?.status === "cancelled") return <p className="mt-4 text-sm text-muted-foreground">练习已取消</p>;
    if (session.result?.text !== undefined) return <pre className="mt-4 whitespace-pre-wrap rounded border border-border bg-muted/20 p-3 text-sm leading-6">{session.result.text}</pre>;
    if (session.result?.media?.kind === "image") return <img src={session.result.media.url} alt="练习结果" className="mt-4 max-h-[60vh] w-full object-contain" />;
    if (session.result?.media?.kind === "video") return <video controls src={session.result.media.url} className="mt-4 max-h-[60vh] w-full" />;
    if (session.result?.media?.kind === "audio") return <audio controls src={session.result.media.url} className="mt-4 w-full" />;
    return <p className="mt-4 text-sm text-muted-foreground">练习已完成，暂无可展示的结果。</p>;
}
