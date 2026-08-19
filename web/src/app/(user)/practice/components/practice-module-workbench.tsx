"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { App, Button, Empty, Input, Spin } from "antd";
import { ArrowLeft, CheckCircle2, RefreshCw, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { IpReferencePicker, ipReferenceFromQuery } from "@/components/ip-library/ip-reference-picker";
import type { IpReference } from "@/lib/ip-library-domain";
import type { PracticeModuleKind } from "@/lib/practice-domain";
import { practiceApi, type PracticeSession, type PracticeSessionInput, type PracticeSessionResult } from "@/services/api/practice";
import { PRACTICE_MODULES } from "./practice-home";
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

export function publicPracticeResult(value: unknown): PracticeSessionResult | undefined {
    if (!value || typeof value !== "object") return undefined;
    const source = value as Record<string, unknown>;
    const status = source.status === "success" || source.status === "error" || source.status === "cancelled" || source.status === "running" || source.status === "pending" ? source.status : undefined;
    if (!status) return undefined;
    const result = source.result && typeof source.result === "object" ? (source.result as Record<string, unknown>) : {};
    if (typeof result.content === "string") return { status, text: result.content };
    const mediaUrl = [result.url, result.serverUrl, result.remoteUrl, result.dataUrl].find((item): item is string => typeof item === "string" && item.trim().length > 0);
    const media = source.media && typeof source.media === "object" ? (source.media as Record<string, unknown>) : undefined;
    if (media && typeof media.url === "string")
        return { status, media: { kind: media.kind === "video" || media.kind === "audio" ? media.kind : "image", url: media.url, width: number(media.width), height: number(media.height), durationMs: number(media.durationMs) } };
    if (mediaUrl)
        return { status, media: { kind: source.taskType === "video" ? "video" : source.taskType === "audio" ? "audio" : "image", url: mediaUrl, width: number(result.width), height: number(result.height), durationMs: number(result.durationMs) } };
    return { status, error: typeof source.error === "string" ? source.error : undefined };
}

export default function PracticeModuleWorkbench({ module }: { module: PracticeModuleKind }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { message } = App.useApp();
    const meta = PRACTICE_MODULES.find((item) => item.module === module) || PRACTICE_MODULES[0];
    const [prompt, setPrompt] = useState("");
    const [referenceText, setReferenceText] = useState("");
    const [ipReferences, setIpReferences] = useState<IpReference[]>([]);
    const [sessions, setSessions] = useState<PracticeSession[]>([]);
    const [current, setCurrent] = useState<PracticeSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const ipId = searchParams.get("ipId")?.trim() || "";
    const ipVersionId = searchParams.get("versionId")?.trim() || "";

    useEffect(() => {
        let active = true;
        setLoading(true);
        setCurrent(null);
        setPrompt("");
        setReferenceText("");
        const reference = ipId && ipVersionId ? ipReferenceFromQuery(new URLSearchParams({ ipId, versionId: ipVersionId })) : undefined;
        setIpReferences(reference ? [reference] : []);
        void practiceApi
            .listSessions({ module, pageSize: 12 })
            .then((result) => {
                if (active) setSessions(result.sessions);
            })
            .catch((error) => {
                if (active) message.error(error instanceof Error ? error.message : "练习记录加载失败");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [ipId, ipVersionId, message, module]);

    const submit = async () => {
        if (!prompt.trim() || submitting) return;
        setSubmitting(true);
        try {
            const input = buildPracticeSessionInput(
                module,
                prompt,
                referenceText
                    .split(/\r?\n/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                ipReferences,
            );
            const result = await practiceApi.createSession(input);
            setCurrent(result.session);
            setSessions((items) => [result.session, ...items.filter((item) => item.id !== result.session.id)].slice(0, 12));
            setPrompt("");
            message.success("练习已提交");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "练习提交失败");
        } finally {
            setSubmitting(false);
        }
    };

    const refresh = async () => {
        if (!current || refreshing) return;
        setRefreshing(true);
        try {
            const result = await practiceApi.getSession(current.id);
            setCurrent(result.session);
            setSessions((items) => items.map((item) => (item.id === result.session.id ? result.session : item)));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "练习状态加载失败");
        } finally {
            setRefreshing(false);
        }
    };

    const retry = async () => {
        if (!current || submitting) return;
        setSubmitting(true);
        try {
            const result = await practiceApi.retrySession(current.id);
            setCurrent(result.session);
            setSessions((items) => items.map((item) => (item.id === result.session.id ? result.session : item)));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "练习重试失败");
        } finally {
            setSubmitting(false);
        }
    };

    const result = useMemo(() => publicPracticeResult(current?.result), [current?.result]);

    return (
        <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground" data-practice-workbench={module}>
            <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-8">
                <button type="button" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={() => router.push("/practice")}>
                    <ArrowLeft className="size-4" />
                    返回无限练习
                </button>
                <header className="mt-5 border-b border-border pb-4 sm:mt-7 sm:pb-6">
                    <div className="flex items-start gap-3">
                        <meta.icon className="mt-0.5 size-6 shrink-0" />
                        <div>
                            <h1 className="text-2xl font-semibold">{meta.title}</h1>
                            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{meta.description}</p>
                        </div>
                    </div>
                </header>

                <section className="mt-5 border border-border bg-card p-3 sm:mt-7 sm:p-5" aria-label="练习输入">
                    <label htmlFor="practice-prompt" className="text-sm font-medium">
                        输入你的想法
                    </label>
                    <Input.TextArea
                        id="practice-prompt"
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder={module === "script" ? "例如：写一段雨夜车站的重逢场景" : "描述你想尝试的画面、声音或氛围"}
                        autoSize={{ minRows: 4, maxRows: 8 }}
                        className="!mt-2"
                    />
                    {module !== "script" ? (
                        <div className="mt-4">
                            <label htmlFor="practice-references" className="text-sm font-medium">
                                公开素材引用（每行一个素材 ID，可选）
                            </label>
                            <Input.TextArea id="practice-references" value={referenceText} onChange={(event) => setReferenceText(event.target.value)} placeholder="例如：asset-0001" autoSize={{ minRows: 2, maxRows: 4 }} className="!mt-2" />
                        </div>
                    ) : null}
                    <div className="mt-4">
                        <IpReferencePicker value={ipReferences} onChange={setIpReferences} />
                    </div>
                    <div className="mt-4 flex justify-end">
                        <Button type="primary" icon={<Send className="size-4" />} loading={submitting} disabled={!prompt.trim()} onClick={() => void submit()}>
                            开始练习
                        </Button>
                    </div>
                </section>

                {current ? (
                    <section className="mt-5 border border-border bg-card p-3 sm:p-5" aria-label="当前结果">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-base font-semibold">{current.title}</h2>
                            <div className="flex items-center gap-1">
                                <Button type="text" size="small" icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={() => void refresh()} aria-label="刷新练习状态" />
                                {current.status === "failed" ? (
                                    <Button size="small" onClick={() => void retry()}>
                                        重试
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                        <ResultView result={result} module={module} />
                    </section>
                ) : null}

                <section className="mt-7 border-t border-border pt-5 sm:mt-9" aria-labelledby="practice-module-history">
                    <h2 id="practice-module-history" className="text-base font-semibold">
                        历史练习
                    </h2>
                    {loading ? (
                        <div className="grid min-h-24 place-items-center">
                            <Spin />
                        </div>
                    ) : sessions.length ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {sessions.map((session) => (
                                <button key={session.id} type="button" className={`min-w-0 border px-3 py-3 text-left ${current?.id === session.id ? "border-foreground" : "border-border hover:bg-muted/30"}`} onClick={() => setCurrent(session)}>
                                    <span className="block truncate text-sm font-medium">{session.title}</span>
                                    <span className="mt-1 block text-xs text-muted-foreground">{session.status === "success" ? "已完成" : session.status === "failed" ? "失败" : "处理中"}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="提交第一次练习后，结果会显示在这里" className="!my-5" />
                    )}
                </section>
            </div>
        </main>
    );
}

function ResultView({ result, module }: { result?: PracticeSessionResult; module: PracticeModuleKind }) {
    if (!result || result.status === "pending" || result.status === "running")
        return (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Spin size="small" />
                练习正在处理中，刷新后查看结果
            </p>
        );
    if (result.status === "error") return <p className="mt-4 text-sm text-red-600 dark:text-red-300">{result.error || "练习失败，请重试"}</p>;
    if (result.text !== undefined) return <EditablePracticeTextResult value={result.text} />;
    if (result.media?.kind === "image")
        return (
            <div className="mt-4 overflow-hidden border border-border">
                <img src={result.media.url} alt={`${module}练习结果`} className="block max-h-[60vh] w-full object-contain" />
            </div>
        );
    if (result.media?.kind === "video") return <video className="mt-4 max-h-[60vh] w-full border border-border bg-black" controls src={result.media.url} />;
    if (result.media?.kind === "audio") return <audio className="mt-4 w-full" controls src={result.media.url} />;
    return (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            练习已完成，暂无可展示的公开结果
        </p>
    );
}

type EditablePracticeTextAction = { type: "edit" | "replace"; value: string };

export function editablePracticeTextReducer(_state: string, action: EditablePracticeTextAction) {
    return action.value;
}

export function EditablePracticeTextResult({ value }: { value: string }) {
    const [draft, dispatch] = useReducer(editablePracticeTextReducer, value);
    useEffect(() => dispatch({ type: "replace", value }), [value]);
    return <Input.TextArea value={draft} onChange={(event) => dispatch({ type: "edit", value: event.target.value })} autoSize={{ minRows: 5, maxRows: 16 }} className="!mt-4" aria-label="练习文本结果" />;
}

function number(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function fallbackRequestId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const value = Math.floor(Math.random() * 16);
        return (char === "x" ? value : (value & 3) | 8).toString(16);
    });
}
