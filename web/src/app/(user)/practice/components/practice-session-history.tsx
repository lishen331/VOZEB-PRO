"use client";

import { Button } from "antd";
import { AudioLines, FileText, Film, Image as ImageIcon, RotateCcw } from "lucide-react";

import type { PracticeSession } from "@/services/api/practice";
import { practiceSessionPreview, practiceSessionStatusLabel } from "./practice-session-status";

export default function PracticeSessionHistory({ sessions, currentId, onOpen, onRetry }: { sessions: PracticeSession[]; currentId?: string; onOpen: (session: PracticeSession) => void; onRetry?: (session: PracticeSession) => void }) {
    if (!sessions.length) return null;
    return <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{sessions.map((session) => <article key={session.id} className={`min-w-0 border p-3 ${currentId === session.id ? "border-foreground" : "border-border"}`}><button type="button" className="flex w-full min-w-0 items-start gap-3 text-left hover:bg-muted/30" onClick={() => onOpen(session)}><Preview session={session} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{session.title}</span><span className="mt-1 block text-xs text-muted-foreground">{practiceSessionStatusLabel(session)}</span><span className="mt-2 block truncate text-xs text-muted-foreground">{session.errorMessage || practiceSessionPreview(session)}</span></span></button>{session.status === "failed" && onRetry ? <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => onRetry(session)} className="!mt-2">重试</Button> : null}</article>)}</div>;
}

function Preview({ session }: { session: PracticeSession }) {
    const media = session.result?.media;
    if (media?.kind === "image") return <img src={media.url} alt="" className="size-14 shrink-0 object-cover" />;
    if (media?.kind === "video") return <span className="grid size-14 shrink-0 place-items-center bg-muted"><Film className="size-5" /></span>;
    if (media?.kind === "audio") return <span className="grid size-14 shrink-0 place-items-center bg-muted"><AudioLines className="size-5" /></span>;
    if (session.module === "script") return <span className="grid size-14 shrink-0 place-items-center bg-muted"><FileText className="size-5" /></span>;
    return <span className="grid size-14 shrink-0 place-items-center bg-muted"><ImageIcon className="size-5" /></span>;
}
