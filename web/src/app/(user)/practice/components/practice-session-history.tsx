"use client";

import { Button, Popconfirm } from "antd";
import { AudioLines, FileText, Film, Image as ImageIcon, RotateCcw, Trash2 } from "lucide-react";

import type { PracticeSession } from "@/services/api/practice";
import { practiceSessionCanRetry, practiceSessionStatusLabel } from "./practice-session-status";

export default function PracticeSessionHistory({
    sessions,
    currentId,
    onOpen,
    onRetry,
    onDelete,
}: {
    sessions: PracticeSession[];
    currentId?: string;
    onOpen: (session: PracticeSession) => void;
    onRetry?: (session: PracticeSession) => void;
    onDelete?: (session: PracticeSession) => void;
}) {
    if (!sessions.length) return null;
    return (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => (
                <article key={session.id} className={`min-w-0 border p-3 ${currentId === session.id ? "border-foreground" : "border-border"}`}>
                    <button type="button" className="flex w-full min-w-0 items-start gap-3 text-left hover:bg-muted/30" onClick={() => onOpen(session)}>
                        <Preview session={session} />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{session.title}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{practiceSessionStatusLabel(session)}</span>
                            <SessionPrompt session={session} />
                            <time className="mt-1 block text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleString()}</time>
                        </span>
                    </button>
                    {practiceSessionCanRetry(session) && onRetry ? (
                        <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => onRetry(session)} className="!mt-2">
                            重试
                        </Button>
                    ) : null}
                    {onDelete ? (
                        <Popconfirm title="删除这条练习记录？" description="只删除本地练习记录，不取消上游任务。" onConfirm={() => onDelete(session)} okText="删除" cancelText="取消">
                            <Button type="text" size="small" icon={<Trash2 className="size-3.5" />} className="!mt-2 !ml-2" danger>
                                删除
                            </Button>
                        </Popconfirm>
                    ) : null}
                </article>
            ))}
        </div>
    );
}

function SessionPrompt({ session }: { session: PracticeSession }) {
    const input = session.input as Record<string, unknown> | undefined;
    const prompt = typeof input?.prompt === "string" ? input.prompt : typeof input?.text === "string" ? input.text : typeof input?.content === "string" ? input.content : "";
    if (session.errorMessage) return <span className="mt-2 block truncate text-xs text-red-500">{session.errorMessage}</span>;
    if (!prompt) return null;
    return <span className="mt-2 block truncate text-xs text-muted-foreground" title={prompt}>{prompt}</span>;
}

function Preview({ session }: { session: PracticeSession }) {
    const media = session.result?.media;
    if (media?.kind === "image") return <img src={media.url} alt="" className="size-14 shrink-0 object-cover" />;
    if (media?.kind === "video")
        return (
            <span className="grid size-14 shrink-0 place-items-center bg-muted">
                <Film className="size-5" />
            </span>
        );
    if (media?.kind === "audio")
        return (
            <span className="grid size-14 shrink-0 place-items-center bg-muted">
                <AudioLines className="size-5" />
            </span>
        );
    if (session.module === "script")
        return (
            <span className="grid size-14 shrink-0 place-items-center bg-muted">
                <FileText className="size-5" />
            </span>
        );
    return (
        <span className="grid size-14 shrink-0 place-items-center bg-muted">
            <ImageIcon className="size-5" />
        </span>
    );
}
