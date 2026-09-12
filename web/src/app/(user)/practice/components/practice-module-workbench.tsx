"use client";
import styles from "./practice-workbench.module.css";

import { App, Button, Empty, Input, Spin } from "antd";
import { ArrowLeft, BookOpen, Box, Film, Image, Mic2, Music2, PanelsTopLeft, RefreshCw, UserRound, type LucideIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ipReferenceFromQuery } from "@/components/ip-library/ip-reference-picker";
import type { IpReference } from "@/lib/ip-library-domain";
import type { PracticeModuleCapability, PracticeModuleKind } from "@/lib/practice-domain";
import { practiceApi, type PracticeSession, type PracticeSessionInput, type PracticeSessionResult } from "@/services/api/practice";
import { resolveImageUrl } from "@/services/image-storage";
import type { PracticeDefaultInput } from "./practice-panel-types";
import PracticeScriptPanel from "./practice-script-panel";
import PracticeStoryboardImagePanel from "./practice-storyboard-image-panel";
import PracticeStoryboardVideoPanel from "./practice-storyboard-video-panel";
import PracticeDubbingPanel from "./practice-dubbing-panel";
import PracticeMusicPanel from "./practice-music-panel";
import PracticeCharacterPanel from "./practice-character-panel";
import PracticeScenePanel from "./practice-scene-panel";
import PracticePropPanel from "./practice-prop-panel";
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

const ICONS: Record<PracticeModuleKind, LucideIcon> = { script: BookOpen, character: UserRound, scene: PanelsTopLeft, prop: Box, "storyboard-image": Image, "storyboard-video": Film, dubbing: Mic2, music: Music2 };
const ASSET_META: Partial<Record<PracticeModuleKind, { title: string; description: string }>> = {
    character: { title: "角色练习", description: "从角色设定生成主形象或多视图。" },
    scene: { title: "场景练习", description: "练习空间、光线和环境氛围。" },
    prop: { title: "道具练习", description: "把关键物件设定成可用素材。" },
};

export default function PracticeModuleWorkbench({ module }: { module: PracticeModuleKind }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { message } = App.useApp();
    const [draftVersion, setDraftVersion] = useState(0);
    const [capability, setCapability] = useState<PracticeModuleCapability>();
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyBusy, setHistoryBusy] = useState(false);
    const [sessions, setSessions] = useState<PracticeSession[]>([]);
    const [current, setCurrent] = useState<PracticeSession>();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [ipReferences, setIpReferences] = useState<IpReference[]>([]);
    const [restoreInput, setRestoreInput] = useState<PracticeDefaultInput | null>(null);
    const meta = PRACTICE_MODULES.find((item) => item.module === module) || ASSET_META[module] || PRACTICE_MODULES[0];
    const Icon = ICONS[module];
    const sessionId = searchParams.get("sessionId") || "";

    const selectedId = useRef(sessionId);
    selectedId.current = sessionId;
    const routeSelection = useRef(0);
    const pollBusy = useRef(false);
    const activeTaskId = current && ["queued", "running"].includes(current.status) ? current.id : "";
    const ipId = searchParams.get("ipId") || "";
    const subIpId = searchParams.get("subIpId") || "";
    useEffect(() => {
        const reference = ipReferenceFromQuery(new URLSearchParams({ ipId, subIpId }));
        setIpReferences(reference ? [reference] : []);
    }, [ipId, subIpId]);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setCurrent(undefined);
        void Promise.all([practiceApi.listModules(), practiceApi.listSessions({ module, pageSize: 24 })])
            .then(([modules, history]) => {
                if (!active) return;
                setCapability(modules.modules.find((item) => item.module === module));
                setSessions(history.sessions);
                setHistoryPage(1);
                setHistoryTotal(history.total);
                if (!selectedId.current && history.sessions.length) {
                    const recent = history.sessions.find((item) => ["queued", "running"].includes(item.status)) || history.sessions[0];
                    setCurrent(recent);
                    router.replace(practiceSessionPath(module, new URLSearchParams(window.location.search), recent.id));
                }
            })
            .catch((error) => active && message.error(error instanceof Error ? error.message : "练习记录加载失败"))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [message, module, router]);
    useEffect(() => {
        const version = ++routeSelection.current;
        if (!sessionId) return;
        const read = async () => {
            try {
                const { session } = await practiceApi.getSession(sessionId);
                if (routeSelection.current !== version) return;
                setCurrent(session);
                setSessions((items) => (items.some((item) => item.id === session.id) ? items.map((item) => (item.id === session.id ? session : item)) : [session, ...items]));
            } catch (error) {
                if (routeSelection.current === version) message.error(error instanceof Error ? error.message : "状态刷新失败");
            }
        };
        void read();
        window.addEventListener("focus", read);
        return () => {
            routeSelection.current += 1;
            window.removeEventListener("focus", read);
        };
    }, [message, sessionId]);
    useEffect(() => {
        if (!activeTaskId) return;
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            if (!active) return;
            if (pollBusy.current) {
                timer = setTimeout(poll, 2000);
                return;
            }
            pollBusy.current = true;
            try {
                const { session } = await practiceApi.getSession(activeTaskId);
                if (!active) return;
                setCurrent((item) => (item?.id === activeTaskId ? session : item));
                setSessions((items) => items.map((item) => (item.id === session.id ? session : item)));
                if (["queued", "running"].includes(session.status)) timer = setTimeout(poll, 2000);
            } catch (error) {
                if (active) message.error(error instanceof Error ? error.message : "状态查询失败，请点击刷新状态");
            } finally {
                pollBusy.current = false;
            }
        };
        timer = setTimeout(poll, 2000);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [activeTaskId, message]);
    const loadMoreHistory = async () => {
        if (historyBusy) return;
        setHistoryBusy(true);
        try {
            const history = await practiceApi.listSessions({ module, page: historyPage + 1, pageSize: 24 });
            setSessions((items) => [...items, ...history.sessions.filter((item) => !items.some((existing) => existing.id === item.id))]);
            setHistoryPage(history.page);
            setHistoryTotal(history.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "历史读取失败");
        } finally {
            setHistoryBusy(false);
        }
    };
    const onCreated = (session: PracticeSession) => {
        setHistoryTotal((total) => total + (sessions.some((item) => item.id === session.id) ? 0 : 1));
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
            setCurrent((item) => (item?.id === result.session.id ? result.session : item));
            setSessions((items) => items.map((item) => (item.id === result.session.id ? result.session : item)));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "状态刷新失败");
        } finally {
            setRefreshing(false);
        }
    };
    const loadIntoForm = async (target: PracticeSession) => {
        const raw = target.input as Record<string, unknown>;
        const refs = Array.isArray(raw.references) ? (raw.references as Array<{ type?: string; id?: string; inputKey?: string }>) : [];
        const images: PracticeDefaultInput["images"] = {};
        await Promise.all(
            refs
                .filter((r) => r.type === "asset" && r.id)
                .map(async (r) => {
                    const url = await resolveImageUrl(r.id);
                    images![r.inputKey || "referenceImage"] = { url, storageKey: r.id!, width: 0, height: 0, bytes: 0, mimeType: "image/jpeg" };
                }),
        );
        setRestoreInput({
            prompt: typeof raw.prompt === "string" ? raw.prompt : undefined,
            text: typeof raw.text === "string" ? raw.text : undefined,
            workflowInput: raw,
            images,
        });
        setDraftVersion((v) => v + 1);
        setCurrent(target);
    };
    const retry = async (target: PracticeSession | undefined = current) => {
        if (!target || refreshing) return;
        await loadIntoForm(target);
    };
    const deleteSession = async (target: PracticeSession) => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await practiceApi.deleteSession(target.id);
            setSessions((items) => items.filter((item) => item.id !== target.id));
            setHistoryTotal((total) => Math.max(0, total - 1));
            if (current?.id === target.id) {
                setCurrent(undefined);
                router.replace(`/practice/${module}`);
            }
            message.success("练习记录已删除");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        } finally {
            setRefreshing(false);
        }
    };
    let panel = null;
    if (capability) {
        const props = { capability, ipReferences, onIpReferencesChange: setIpReferences, onCreated, defaultInput: restoreInput };
        panel =
            module === "script" ? (
                <PracticeScriptPanel {...props} />
            ) : module === "character" ? (
                <PracticeCharacterPanel {...props} />
            ) : module === "scene" ? (
                <PracticeScenePanel {...props} />
            ) : module === "prop" ? (
                <PracticePropPanel {...props} />
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
        <main className={`${styles.workbench} h-full min-h-0 overflow-y-auto bg-background text-foreground`} data-practice-workbench={module}>
            <div className="mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-6 sm:py-6">
                <button type="button" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={() => router.push("/practice")}>
                    <ArrowLeft className="size-4" />
                    返回练习
                </button>
                <Button
                    className="!ml-3"
                    size="small"
                    onClick={() => {
                        setDraftVersion((value) => value + 1);
                        setRestoreInput(null);
                        setCurrent(undefined);
                        routeSelection.current += 1;
                        router.replace(`/practice/${module}`);
                    }}
                >
                    新建练习
                </Button>
                <header className="mt-4 flex items-center justify-between border-b border-border pb-4">
                    <div className="flex items-start gap-3">
                        <Icon className="mt-0.5 size-6 shrink-0" />
                        <div>
                            <h1 className="text-2xl font-semibold">{meta.title}</h1>
                            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{meta.description}</p>
                        </div>
                    </div>
                </header>
                <div className={styles.grid}>
                    <section className={`${styles.input} rounded-xl border border-border bg-card p-4 sm:p-6`} aria-label="练习工具">
                        <div className="mb-5 flex items-center gap-2 border-b border-border pb-3">
                            <Icon className="size-4 text-primary" />
                            <h2 className="text-sm font-semibold">创作输入</h2>
                            <span className="ml-auto text-xs text-muted-foreground">素材与生成参数</span>
                        </div>
                        {loading ? (
                            <div className="grid min-h-40 place-items-center">
                                <Spin />
                            </div>
                        ) : capability ? (
                            <>
                                {!capability.available ? <p className="mb-4 border border-dashed border-border p-3 text-sm text-muted-foreground">{capability.unavailableReason}</p> : null}
                                <div key={draftVersion}>{panel}</div>
                            </>
                        ) : (
                            <Empty description="当前模块不可用" />
                        )}
                    </section>
                    <section className={`${styles.result} rounded-xl border border-border bg-card p-4 sm:p-6`} aria-label="当前结果">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-base font-semibold">练习结果</h2>
                            <Button type="text" size="small" icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={() => void refresh()} aria-label="刷新练习状态" />
                        </div>
                        <SessionResult module={module} session={current} onRetry={(session) => void loadIntoForm(session)} onRefresh={() => void refresh()} />
                    </section>
                </div>
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
                            onDelete={(session) => void deleteSession(session)}
                        />
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="提交第一次练习后，结果会显示在这里" className="!my-5" />
                    )}
                    {sessions.length < historyTotal ? (
                        <Button className="!mt-3" loading={historyBusy} onClick={() => void loadMoreHistory()}>
                            加载更多历史
                        </Button>
                    ) : null}
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
