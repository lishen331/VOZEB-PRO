"use client";

import { useState } from "react";
import { App, Button, Image, Spin } from "antd";
import { Film, AudioLines, Download, Image as ImageIcon } from "lucide-react";

import type { PracticeModuleKind } from "@/lib/practice-domain";
import type { PracticeSession } from "@/services/api/practice";
import { uploadImage } from "@/services/image-storage";
import { createLibraryAsset } from "@/services/api/library-assets";
import type { DramaLibraryAssetType } from "@/lib/drama-lab-library-assets";
import { PracticePanoramaViewer } from "./practice-panorama-viewer";

const WAITING: Record<PracticeModuleKind, string> = {
    script: "等待保存剧本",
    character: "等待生成角色图",
    scene: "等待生成场景图",
    prop: "等待生成道具图",
    "storyboard-image": "等待生成分镜图",
    "storyboard-video": "等待生成分镜视频",
    dubbing: "等待生成配音",
    music: "等待生成音乐",
};

const DRAMA_ASSET_TYPE: Partial<Record<PracticeModuleKind, DramaLibraryAssetType>> = {
    character: "character",
    scene: "scene",
    prop: "prop",
};

export function PracticeSessionResult({ module, session, onRetry, onRefresh }: { module: PracticeModuleKind; session?: PracticeSession | null; onRetry: (session: PracticeSession) => void; onRefresh: () => void }) {
    const { message } = App.useApp();
    const [saving, setSaving] = useState(false);

    const saveToLibrary = async (target: PracticeSession) => {
        const url = target.result?.media?.url;
        if (!url) return;
        setSaving(true);
        try {
            const uploaded = await uploadImage(url);
            const dramaAssetType = DRAMA_ASSET_TYPE[module];
            await createLibraryAsset({
                kind: "image",
                title: target.title,
                coverUrl: uploaded.serverUrl || uploaded.url,
                tags: dramaAssetType ? ["短剧", dramaAssetType === "character" ? "角色" : dramaAssetType === "scene" ? "场景" : "道具"] : [],
                source: "practice",
                ...(dramaAssetType ? { metadata: { dramaAssetType } } : {}),
                data: {
                    dataUrl: uploaded.serverUrl || uploaded.url,
                    serverUrl: uploaded.serverUrl || uploaded.url,
                    storageKey: uploaded.storageKey,
                    width: uploaded.width,
                    height: uploaded.height,
                    bytes: uploaded.bytes,
                    mimeType: uploaded.mimeType,
                },
            });
            message.success("已存入资产库");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败，请重试");
        } finally {
            setSaving(false);
        }
    };

    if (!session) {
        const Icon = module === "storyboard-video" ? Film : module === "dubbing" ? AudioLines : ImageIcon;
        return (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center lg:min-h-80">
                <div className="rounded-2xl bg-muted/60 p-5">
                    <Icon className="size-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">{WAITING[module]}</p>
                <p className="max-w-64 text-xs leading-5 text-muted-foreground">完成输入后开始生成，结果会在这里呈现。</p>
            </div>
        );
    }
    if (session.status === "draft") return <p className="mt-4 text-sm text-muted-foreground">剧本草稿已保存，可继续编辑。</p>;
    if (session.status === "queued" || session.status === "running" || session.result?.status === "pending" || session.result?.status === "running")
        return (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Spin size="small" />
                {session.status === "queued" ? "已排队，等待生成" : "正在生成中，结果将自动显示..."}
            </p>
        );
    if (session.status === "failed" || session.result?.status === "error")
        return (
            <div className="mt-4 space-y-2 text-sm text-red-600 dark:text-red-300">
                <p>{session.errorMessage || session.result?.error || "练习失败，请重试"}</p>
                <Button size="small" onClick={() => onRetry(session)}>
                    载入重试
                </Button>
            </div>
        );
    if (session.status === "cancelled" || session.result?.status === "cancelled")
        return (
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p>练习已取消</p>
                <Button size="small" onClick={() => onRetry(session)}>
                    载入重试
                </Button>
            </div>
        );
    if (session.result?.text !== undefined) return <pre className="mt-4 whitespace-pre-wrap rounded border border-border bg-muted/20 p-3 text-sm leading-6">{session.result.text}</pre>;
    if (session.result?.media?.kind === "image") {
        const imageUrl = session.result.media.url;
        const isMultiView = session.workflowCode === "character_multi_view";
        return (
            <div className="mt-4 space-y-3">
                <Image src={imageUrl} alt="练习结果" className="!max-h-[60vh] !w-full !object-contain" preview={{ src: imageUrl }} />
                <div className="flex flex-wrap items-center gap-2">
                    {isMultiView ? <PracticePanoramaViewer url={imageUrl} title="角色多视图 360°" /> : null}
                    <Button size="small" icon={<Download className="size-3.5" />} loading={saving} onClick={() => void saveToLibrary(session)}>
                        存入资产库
                    </Button>
                    <Button size="small" onClick={() => onRetry(session)}>
                        载入重试
                    </Button>
                </div>
            </div>
        );
    }
    if (session.result?.media?.kind === "video")
        return (
            <div className="mt-4 space-y-3">
                <video controls src={session.result.media.url} className="max-h-[60vh] w-full" />
                <Button size="small" onClick={() => onRetry(session)}>
                    载入重试
                </Button>
            </div>
        );
    if (session.result?.media?.kind === "audio")
        return (
            <div className="mt-4 space-y-3">
                <audio controls src={session.result.media.url} className="w-full" />
                <Button size="small" onClick={() => onRetry(session)}>
                    载入重试
                </Button>
            </div>
        );
    return <p className="mt-4 text-sm text-muted-foreground">练习已完成，暂无可展示的结果。</p>;
}
