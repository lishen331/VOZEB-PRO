"use client";

import { App, Button, Empty, Input, Spin } from "antd";
import { ArrowLeft, BookOpen, Film, Image, Mic2, Music2, RefreshCw, type LucideIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ipReferenceFromQuery } from "@/components/ip-library/ip-reference-picker";
import type { IpReference } from "@/lib/ip-library-domain";
import type { PracticeModuleCapability, PracticeModuleKind } from "@/lib/practice-domain";
import { practiceApi, type PracticeSession, type PracticeSessionInput, type PracticeSessionResult } from "@/services/api/practice";
import PracticeScriptPanel from "./practice-script-panel";
import PracticeStoryboardImagePanel from "./practice-storyboard-image-panel";
import PracticeStoryboardVideoPanel from "./practice-storyboard-video-panel";
import PracticeDubbingPanel from "./practice-dubbing-panel";
import PracticeMusicPanel from "./practice-music-panel";
import { PracticeSessionResult as SessionResult } from "./practice-session-result";
import PracticeSessionHistory from "./practice-session-history";
import { PRACTICE_MODULES } from "./practice-home";
import { practiceSessionCanRetry } from "./practice-session-status";
export { PRACTICE_MODULES } from "./practice-home";

export function buildPracticeSessionInput(module: PracticeModuleKind, prompt: string, referenceIds: string[], ipReferences: IpReference[] = []): PracticeSessionInput {
    return {
        module,
        title: PRACTICE_MODULES.find((item) => item.module === module)?.title || "单项练习",
        input: { prompt: prompt.trim() },
        references: [...referenceIds.filter(Boolean).map((id) => ({ type: "asset" as const, id })), ...ipReferences],
        clientRequestId: globalThis.crypto?.randomUUID?.() || fallbackRequestId(),
    };
}

export function practiceSessionPath(module: PracticeModuleKind, searchParams: URLSearchParams, sessionId: string) {
    const query = new URLSearchParams(searchParams.toString());
    query.set("sessionId", sessionId);
    return `/practice/${module}?${query.toString()}`;
}

export function publicPracticeResult(value: unknown): PracticeSessionResult | undefined {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    const status = ["success", "error", "cancelled", "running", "pending"].includes(String(source.status)) ? (source.status as PracticeSessionResult["status"]) : undefined;
    if (!status) return undefined;
    const result = source.result && typeof source.result === "object" ? (source.result as Record<string, unknown>) : {};
    if (typeof result.content === "string") return { status, text: result.content };
    const media = source.media && typeof source.media === "object" ? (source.media as Record<string, unknown>) : undefined;
    if (media && typeof media.url === "string") return { status, media: { kind: media.kind === "video" || media.kind === "audio" ? media.kind : "image", url: media.url } };
    return { status, error: typeof source.error === "string" ? source.error : undefined };
}

const ICONS: Record<PracticeModuleKind, LucideIcon> = { script: BookOpen, "storyboard-image": Image, "storyboard-video": Film, dubbing: Mic2, music: Music2 };

export default function PracticeModuleWorkbench({ module }: { module: PracticeModuleKind }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { message } = App.useApp();
    const [capability, setCapability] = useState<PracticeModuleCapability>();
    const [sessions, setSessions] = useState<PracticeSession[]>([]);
    const [current, setCurrent] = useState<PracticeSession>();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [ipReferences, setIpReferences] = useState<IpReference[]>([]);
    const meta = PRACTICE_MODULES.find((item) => item.module === module) || PRACTICE_MODULES[0];
    const Icon = ICONS[module];
    const sessionId = searchParams.get("sessionId") || "";

    useEffect(() => {
        const reference = ipReferenceFromQuery(searchParams);
        setIpReferences(reference ? [reference] : []);
        let active = true;
        setLoading(true);
        void Promise.all([practiceApi.listModules(), practiceApi.listSessions({ module, pageSize: 24 })])
            .then(async ([modules, history]) => {
                if (!active) return;
                setCapability(modules.modules.find((item) => item.module === module));
                setSessions(history.sessions);
                if (sessionId) {
                    const item = history.sessions.find((entry) => entry.id === sessionId);
                    setCurrent(item || (await practiceApi.getSession(sessionId)).session);
                }
            })
            .catch((error) => active && message.error(error instanceof Error ? error.message : "练习记录加载失败"))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [message, module, searchParams, sessionId]);
    useEffect(() => {
        if (!sessionId) return;
        let active = true;
        const loadSession = () => {
            void practiceApi
                .getSession(sessionId)
                .then(({ session }) => {
                    if (!active) return;
                    setCurrent(session);
                    setSessions((items) => items.map((item) => (item.id === session.id ? session : item)));
                })
                .catch((error) => active && message.error(error instanceof Error ? error.message : "状态刷新失败"));
        };
        window.addEventListener("focus", loadSession);
        return () => {
            active = false;
            window.removeEventListener("focus", loadSession);
        };
    }, [message, sessionId]);
    useEffect(() => {
        if (!current) return;
        const isPolling = current.status === "queued" || current.status === "running" || current.result?.status === "pending" || current.result?.status === "running";
        if (!isPolling) return;
        let active = true;
        let pollCount = 0;
        const poll = () => {
            if (!active) return;
            void practiceApi
                .getSession(current.id)
                .then(({ session }) => {
                    if (!active) return;
                    setCurrent(session);
                    setSessions((items) => items.map((item) => (item.id === session.id ? session : item)));
                    const stillPolling = session.status === "queued" || session.status === "running" || session.result?.status === "pending" || session.result?.status === "running";
                    if (stillPolling && active) {
                        pollCount += 1;
                        const delay = Math.min(2000 + pollCount * 1000, 8000);
                        setTimeout(poll, delay);
                    }
                })
                .catch(() => {
                    if (active) {
                        pollCount += 1;
                        const delay = Math.min(2000 + pollCount * 1000, 8000);
                        setTimeout(poll, delay);
                    }
                });
        };
        const initialDelay = 2000;
        const timer = setTimeout(poll, initialDelay);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [current, message]);
    const onCreated = (session: PracticeSession) => {
        setCurrent(session);
        setSessions((items) => [session, ...items.filter((item) => item.id !== session.id)]);
        router.replace(practiceSessionPath(module, searchParams, session.id));
        message.success(session.mode === "manual" ? "剧本草稿已保存" : "练习已提交");
    };
    const refresh = async () => {
        if (!current || refreshing) return;
        setRefreshing(true);
        try {
            const result = await practiceApi.getSession(current.id);
            setCurrent(result.session);
            setSessions((items) => items.map((item) => (item.id === result.session.id ? result.session : item)));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "状态刷新失败");
        } finally {
            setRefreshing(false);
        }
    };
    const retry = async (target: PracticeSession | undefined = current) => {
        if (!target || !practiceSessionCanRetry(target) || refreshing) return;
        setRefreshing(true);
        try {
            onCreated((await practiceApi.retrySession(target.id)).session);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "练习重试失败");
        } finally {
            setRefreshing(false);
        }
    };
    let panel = null;
    if (capability) {
        const props = { capability, ipReferences, onIpReferencesChange: setIpReferences, onCreated };
        panel =
            module === "script" ? (
                <PracticeScriptPanel {...props} />
            ) : module === "storyboard-image" ? (
                <PracticeStoryboardImagePanel {...props} />
            ) : module === "storyboard-video" ? (
                <PracticeStoryboardVideoPanel {...props} />
            ) : module === "dubbing" ? (
                <PracticeDubbingPanel {...props} />
            ) : (
                <PracticeMusicPanel {...props} />
            );
    }
    return (
        <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground" data-practice-workbench={module}>
            <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-8">
                <button type="button" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={() => router.push("/practice")}>
                    <ArrowLeft className="size-4" />
                    返回无限练习
                </button>
                <header className="mt-5 border-b border-border pb-4 sm:mt-7 sm:pb-6">
                    <div className="flex items-start gap-3">
                        <Icon className="mt-0.5 size-6 shrink-0" />
                        <div>
                            <h1 className="text-2xl font-semibold">{meta.title}</h1>
                            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{meta.description}</p>
                        </div>
                    </div>
                </header>
                <section className="mt-5 border border-border bg-card p-3 sm:mt-7 sm:p-5" aria-label="练习工具">
                    {loading ? (
                        <div className="grid min-h-40 place-items-center">
                            <Spin />
                        </div>
                    ) : capability ? (
                        <>
                            {!capability.available ? <p className="mb-4 border border-dashed border-border p-3 text-sm text-muted-foreground">{capability.unavailableReason}</p> : null}
                            {panel}
                        </>
                    ) : (
                        <Empty description="当前模块不可用" />
                    )}
                </section>
                <section className="mt-5 border border-border bg-card p-3 sm:p-5" aria-label="当前结果">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-base font-semibold">练习结果</h2>
                        <Button type="text" size="small" icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={() => void refresh()} aria-label="刷新练习状态" />
                    </div>
                    <SessionResult module={module} session={current} onRetry={() => void retry()} onRefresh={() => void refresh()} />
                </section>
                <section className="mt-7 border-t border-border pt-5" aria-labelledby="practice-module-history">
                    <h2 id="practice-module-history" className="text-base font-semibold">
                        历史练习
                    </h2>
                    {loading ? (
                        <Spin />
                    ) : sessions.length ? (
                        <PracticeSessionHistory
                            sessions={sessions}
                            currentId={current?.id}
                            onOpen={(session) => {
                                setCurrent(session);
                                router.replace(`/practice/${module}?sessionId=${encodeURIComponent(session.id)}`);
                            }}
                            onRetry={(session) => void retry(session)}
                        />
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="提交第一次练习后，结果会显示在这里" className="!my-5" />
                    )}
                </section>
            </div>
        </main>
    );
}
function fallbackRequestId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const value = Math.floor(Math.random() * 16);
        return (char === "x" ? value : (value & 3) | 8).toString(16);
    });
}

export function editablePracticeTextReducer(_state: string, action: { type: "edit" | "replace"; value: string }) {
    return action.value;
}
export function EditablePracticeTextResult({ value }: { value: string }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    return <Input.TextArea value={draft} onChange={(event) => setDraft(event.target.value)} autoSize={{ minRows: 5, maxRows: 16 }} className="!mt-4" aria-label="练习文本结果" />;
}
