"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Input, Modal, Popconfirm, Select, Spin, Tag } from "antd";
import { ArrowLeft, BookOpen, Download, Import, Pause, Plus, RefreshCw, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ScriptPracticeProject } from "@/lib/script-practice-types";
import { practiceScriptsApi } from "@/services/api/practice-scripts";

type TreeItem = { id: string; key: string; type: string; label: string; status: string; version: number };
type ChatMessage = { id: string; role: "user" | "assistant"; agent?: string; content: string; status?: string };
const AGENT_LABEL = "剧本 Agent";
const STATUS: Record<string, { text: string; color: string }> = {
    not_started: { text: "未开始", color: "default" },
    awaiting_review: { text: "待确认", color: "gold" },
    confirmed: { text: "已确认", color: "success" },
    draft: { text: "草稿", color: "default" },
    failed: { text: "失败", color: "error" },
};
export default function ScriptPracticeWorkspace() {
    const router = useRouter();
    const { message } = App.useApp();
    const [projects, setProjects] = useState<ScriptPracticeProject[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [tree, setTree] = useState<TreeItem[]>([]);
    const [selectedKey, setSelectedKey] = useState("");
    const [artifact, setArtifact] = useState<Record<string, unknown> | null>(null);
    const [preview, setPreview] = useState("");
    const [conversationPreview, setConversationPreview] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatSessionId, setChatSessionId] = useState("");
    const [sessionTitle, setSessionTitle] = useState("");
    const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
    const [renameTitle, setRenameTitle] = useState("");
    const [draft, setDraft] = useState("");
    const [runId, setRunId] = useState("");
    const [runError, setRunError] = useState("");
    const [busy, setBusy] = useState(false);
    const [streamStatus, setStreamStatus] = useState<"idle" | "connecting" | "waiting_first_token" | "streaming">("idle");
    const [publicProgress, setPublicProgress] = useState("");
    const [starting, setStarting] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [pendingConfirmation, setPendingConfirmation] = useState<{ artifactId: string; artifactType: string; runId: string } | null>(null);
    const abortRef = useRef<AbortController | undefined>(undefined);
    const seenEventKeys = useRef(new Set<string>());
    const previewRawRef = useRef("");
    const selectedIdRef = useRef("");
    const selectProject = useCallback((id: string) => {
        abortRef.current?.abort();
        setSelectedKey("");
        setArtifact(null);
        previewRawRef.current = "";
        setPreview("");
        setConversationPreview("");
        setTree([]);
        setRunId("");
        setRunError("");
        setPublicProgress("");
        setChatSessionId("");
        setSessionTitle("");
        setSessionMenuOpen(false);
        selectedIdRef.current = id;
        setSelectedId(id);
    }, []);
    const loadProjects = useCallback(async () => {
        const result = await practiceScriptsApi.list({ page: 1, pageSize: 50 });
        setProjects(result.items);
        setSelectedId((current) => {
            const next = current || result.items[0]?.id || "";
            selectedIdRef.current = next;
            return next;
        });
    }, []);
    const loadTree = useCallback(async (id: string) => {
        const result = await practiceScriptsApi.tree(id);
        if (selectedIdRef.current !== id) return undefined;
        const activeRun = result.activeRuns[0];
        setTree(result.items);
        setRunId(activeRun?.id || "");
        setRunError(activeRun?.errorMessage || "");
        setSelectedKey((current) => (result.items.some((item) => item.key === current) ? current : result.items[0]?.key || ""));
        return activeRun;
    }, []);
    useEffect(() => {
        void loadProjects().catch((e) => message.error(e.message));
    }, [loadProjects, message]);
    useEffect(() => {
        if (selectedId) void loadTree(selectedId).catch((e) => message.error(e.message));
    }, [selectedId, loadTree, message]);
    useEffect(() => {
        if (!selectedId) {
            setMessages([]);
            return;
        }
        let active = true;
        void (async () => {
            const sessions = await practiceScriptsApi.chatSessions(selectedId);
            const session = sessions[0];
            setChatSessionId(session?.id || "");
            setSessionTitle(session?.title || "剧本创作");
            if (!session) {
                setMessages([]);
                return;
            }
            const [history] = await Promise.all([practiceScriptsApi.chatMessages(selectedId, session.id), loadConversationPreview(selectedId)]);
            if (active) setMessages(history.map((item) => ({ id: item.id, role: item.role === "user" ? "user" : "assistant", agent: AGENT_LABEL, content: item.public_content })));
        })().catch((error) => {
            if (active) message.error(error instanceof Error ? error.message : "对话历史加载失败");
        });
        return () => {
            active = false;
        };
    }, [selectedId, message]);
    useEffect(() => {
        if (!selectedId || !selectedKey || !tree.some((item) => item.key === selectedKey) || tree.find((item) => item.key === selectedKey)?.id.startsWith("pending:") === true) {
            setArtifact(null);
            return;
        }
        const [type, key] = selectedKey.split(":");
        let active = true;
        void practiceScriptsApi
            .artifact(selectedId, type, key)
            .then((value) => {
                if (active) setArtifact(value);
            })
            .catch(() => {
                if (active) setArtifact(null);
            });
        return () => {
            active = false;
        };
    }, [selectedId, selectedKey, tree]);
    const consumeEvents = useCallback(
        async (projectId: string, currentRunId: string, afterSequence = 0) => {
            if (selectedIdRef.current !== projectId) return;
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            seenEventKeys.current.clear();
            previewRawRef.current = "";
            setBusy(true);
            setStreamStatus("connecting");
            try {
                const response = await fetch(practiceScriptsApi.runEventsUrl(projectId, currentRunId, afterSequence), { signal: controller.signal, cache: "no-store" });
                if (!response.ok || !response.body) throw new Error("Agent 流连接失败");
                const reader = response.body.getReader(),
                    decoder = new TextDecoder();
                let buffer = "";
                let receivedEvent = false;
                setStreamStatus("waiting_first_token");
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const chunks = buffer.split("\n\n");
                    buffer = chunks.pop() || "";
                    for (const chunk of chunks) {
                        if (selectedIdRef.current !== projectId) return;
                        const line = chunk.split("\n").find((row) => row.startsWith("data: "));
                        if (!line) continue;
                        const event = JSON.parse(line.slice(6)) as { runId?: string; sequence?: number; type: string; data: Record<string, unknown> };
                        const eventKey = `${event.runId || currentRunId}:${event.sequence ?? chunk}`;
                        if (seenEventKeys.current.has(eventKey)) continue;
                        seenEventKeys.current.add(eventKey);
                        receivedEvent = true;
                        if (event.type === "artifact_delta" || event.type === "assistant_delta") setStreamStatus("streaming");
                        if (event.type === "assistant_delta") {
                            const delta = String(event.data.delta || "");
                            if (!delta) continue;
                            const agent = AGENT_LABEL;
                            setMessages((current) => {
                                const index = current.findLastIndex((item) => item.role === "assistant" && (item.status === "working" || item.status === "streaming"));
                                if (index < 0) return [...current, { id: crypto.randomUUID(), role: "assistant", agent, content: delta, status: "streaming" }];
                                const item = current[index];
                                return [...current.slice(0, index), { ...item, content: item.content + delta, status: "streaming" }, ...current.slice(index + 1)];
                            });
                        }
                        if (event.type === "artifact_delta") {
                            previewRawRef.current += String(event.data.delta || "");
                            const readable = publicPreviewText(previewRawRef.current);
                            setPreview(readable);
                            if (readable) {
                                setMessages((current) => {
                                    const index = current.findLastIndex((item) => item.role === "assistant" && (item.status === "working" || item.status === "streaming"));
                                    if (index < 0) return [...current, { id: crypto.randomUUID(), role: "assistant", agent: AGENT_LABEL, content: readable, status: "streaming" }];
                                    return [...current.slice(0, index), { ...current[index], content: readable, status: "streaming" }, ...current.slice(index + 1)];
                                });
                            }
                        }
                        if (event.type === "progress") {
                            setPublicProgress(String(event.data.label || "正在处理当前剧本"));
                        }
                        if (event.type === "agent_started") {
                            const agent = AGENT_LABEL;
                            setMessages((current) =>
                                current.some((item) => item.role === "assistant" && item.status === "working") ? current : [...current, { id: crypto.randomUUID(), role: "assistant", agent, content: "正在处理当前任务……", status: "working" }],
                            );
                        }
                        if (event.type === "artifact_saved") {
                            await loadTree(projectId);
                            const key = `${event.data.artifactType}:${event.data.artifactKey}`;
                            if (event.data.artifactType === "conversation") {
                                await loadConversationPreview(projectId);
                            } else {
                                setSelectedKey(key);
                                const [type, itemKey] = key.split(":");
                                const savedArtifact = await practiceScriptsApi.artifact(projectId, type, itemKey);
                                setArtifact(savedArtifact);
                                if (artifactContent(savedArtifact)) {
                                    previewRawRef.current = "";
                                    setPreview("");
                                }
                                if (["creative_positioning", "short_story", "adaptation_strategy", "review_report"].includes(String(event.data.artifactType))) {
                                    setPendingConfirmation({ artifactId: String(event.data.artifactId || ""), artifactType: String(event.data.artifactType), runId: currentRunId });
                                }
                            }
                        }
                        if (event.type === "run_completed") {
                            await loadTree(projectId);
                            await loadConversationPreview(projectId);
                        }
                        if (event.type === "error") message.error(String(event.data.message || "Agent 执行失败"));
                    }
                }
            } finally {
                setStreamStatus("idle");
                setBusy(false);
            }
        },
        [loadTree, message],
    );
    useEffect(() => {
        if (!selectedId || !runId) return;
        void (async () => {
            const activeRun = await loadTree(selectedId);
            if (activeRun?.id === runId) await consumeEvents(selectedId, runId, activeRun.lastEventSequence);
        })().catch((error) => message.error(error instanceof Error ? error.message : "恢复剧本任务失败"));
    }, [selectedId, runId, consumeEvents, loadTree, message]);
    useEffect(() => () => abortRef.current?.abort(), []);
    const runAction = async (action: () => Promise<void>, fallback: string) => {
        try {
            await action();
        } catch (error) {
            message.error(error instanceof Error ? error.message : fallback);
        }
    };
    const start = async (runType: string, input: Record<string, unknown>) => {
        if (!selectedId || busy || starting) return;
        setStarting(true);
        setRunError("");
        try {
            const run = await practiceScriptsApi.createRun(selectedId, { runType, clientRequestId: crypto.randomUUID(), input });
            setRunId(run.id);
        } finally {
            setStarting(false);
        }
    };
    const send = async () => {
        const text = draft.trim();
        if (!text || !selectedId || busy) return;
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: text }]);
        setDraft("");
        const session = chatSessionId ? { id: chatSessionId } : await practiceScriptsApi.createChatSession(selectedId, "剧本创作");
        setChatSessionId(session.id);
        const run = await practiceScriptsApi.sendChat(selectedId, session.id, text, crypto.randomUUID());
        setRunId(run.id);
    };
    const loadConversationPreview = async (projectId: string) => {
        try {
            const value = await practiceScriptsApi.artifact(projectId, "conversation", "latest");
            const content = artifactContent(value);
            if (content) {
                setConversationPreview(content);
            }
        } catch {
            // Conversation artifacts are optional; keep the live stream as fallback.
        }
    };
    const confirmCurrentArtifact = async () => {
        if (!selectedId || !pendingConfirmation || confirming) return;
        setConfirming(true);
        try {
            await practiceScriptsApi.confirmArtifact(selectedId, pendingConfirmation.artifactId, pendingConfirmation.artifactType, pendingConfirmation.runId);
            const nextByArtifact: Record<string, string> = { creative_positioning: "short_story", short_story: "adaptation_bundle", adaptation_strategy: "episode_scripts", review_report: "director_plan" };
            const nextRunType = nextByArtifact[pendingConfirmation.artifactType];
            setPendingConfirmation(null);
            await loadTree(selectedId);
            if (nextRunType) {
                const run = await practiceScriptsApi.createRun(selectedId, { runType: nextRunType, chatSessionId, clientRequestId: crypto.randomUUID(), input: { instruction: "根据已确认成果继续下一阶段" } });
                setRunId(run.id);
            }
        } finally {
            setConfirming(false);
        }
    };
    const renameCurrentSession = async () => {
        const title = renameTitle.trim();
        if (!selectedId || !chatSessionId || !title) return;
        const project = await practiceScriptsApi.update(selectedId, { title });
        const session = await practiceScriptsApi.renameChatSession(selectedId, chatSessionId, title);
        setProjects((current) => current.map((item) => (item.id === selectedId ? project : item)));
        setSessionTitle(session.title);
        setRenameTitle("");
        setSessionMenuOpen(false);
        message.success("对话名称已更新");
    };
    const removeCurrentScript = async () => {
        if (!selectedId) return;
        const removedId = selectedId;
        await practiceScriptsApi.remove(removedId);
        const remaining = projects.filter((project) => project.id !== removedId);
        setProjects(remaining);
        if (remaining[0]) selectProject(remaining[0].id);
        else {
            selectedIdRef.current = "";
            setSelectedId("");
            setTree([]);
            setMessages([]);
            setChatSessionId("");
        }
        message.success("剧本已删除");
    };
    const create = async () => {
        const title = `新剧本 ${new Date().toLocaleDateString("zh-CN")}`;
        const result = await practiceScriptsApi.create({ title, sourceType: "idea" });
        const project = "project" in result ? result.project : result;
        const session = await practiceScriptsApi.createChatSession(project.id, "剧本创作");
        setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
        selectProject(project.id);
        setChatSessionId(session.id);
        setSessionTitle(session.title || title);
        message.success("已打开新的剧本对话");
    };
    const selectedProject = projects.find((item) => item.id === selectedId);
    const visible = useMemo(() => {
        if (artifactContent(artifact)) return artifactContent(artifact);
        if (preview) return preview;
        const currentItem = tree.find((item) => item.key === selectedKey);
        return !currentItem || currentItem.status === "not_started" ? conversationPreview : "";
    }, [artifact, conversationPreview, preview, selectedKey, tree]);
    const artifactStatus = typeof artifact?.status === "string" ? artifact.status : "";
    const artifactId = typeof artifact?.id === "string" ? artifact.id : "";
    return (
        <main className="flex h-full min-h-0 flex-col bg-background text-foreground" data-script-practice-workspace>
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-3">
                    <Button type="text" icon={<ArrowLeft className="size-4" />} onClick={() => router.push("/practice")}>
                        返回练习
                    </Button>
                    <div>
                        <p className="text-xs text-muted-foreground">纯文字创作 · 到镜头级分镜为止</p>
                        <h1 className="text-lg font-semibold">{selectedProject?.title || "剧本 Agent"}</h1>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button icon={<Import className="size-4" />}>导入小说</Button>
                    {selectedId ? (
                        <Button icon={<Download className="size-4" />} onClick={() => window.open(practiceScriptsApi.exportUrl(selectedId, "text"), "_blank")}>
                            下载剧本
                        </Button>
                    ) : null}
                    {selectedId ? (
                        <Button icon={<Download className="size-4" />} onClick={() => window.open(practiceScriptsApi.exportUrl(selectedId, "storyboard"), "_blank")}>
                            下载分镜表
                        </Button>
                    ) : null}
                </div>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_340px]">
                <aside aria-label="剧本工作目录" className="min-h-0 overflow-y-auto border-r border-border bg-card p-3">
                    <h2 className="mb-3 text-sm font-semibold">工作目录</h2>
                    <div className="mt-4 space-y-1">
                        {tree.map((item) => (
                            <button
                                type="button"
                                key={item.id}
                                onClick={() => setSelectedKey(item.key)}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selectedKey === item.key ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                            >
                                <span className="truncate">{item.label}</span>
                                <Tag className="m-0" bordered={false} color={STATUS[item.status]?.color}>
                                    {STATUS[item.status]?.text || item.status}
                                </Tag>
                            </button>
                        ))}
                        {!tree.length ? <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">从右侧告诉统筹 Agent 你的创意，成果会自动进入这里。</div> : null}
                    </div>
                </aside>
                <section aria-label="正式创作成果" className="min-h-0 overflow-y-auto bg-muted/20 p-5">
                    <div className="mx-auto min-h-full max-w-4xl rounded-xl border border-border bg-card p-6 shadow-sm">
                        <div className="mb-5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <BookOpen className="size-5 text-primary" />
                                <h2 className="font-semibold">{tree.find((i) => i.key === selectedKey)?.label || "正式创作成果"}</h2>
                            </div>
                            {busy ? (
                                <Tag color="processing">SSE 写作中</Tag>
                            ) : artifactStatus === "awaiting_review" ? (
                                <Button size="small" type="primary" loading={confirming} disabled={confirming} onClick={() => void runAction(confirmCurrentArtifact, "确认当前阶段失败")}>
                                    确认当前阶段
                                </Button>
                            ) : null}
                        </div>
                        {visible ? (
                            <article className="prose prose-sm max-w-none dark:prose-invert">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{visible}</ReactMarkdown>
                            </article>
                        ) : (
                            <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-muted-foreground">
                                <Sparkles className="mb-3 size-8" />
                                <p>成果将在 Agent 生成并保存后显示</p>
                                <p className="mt-1 text-xs">这里不展示原始 JSON</p>
                            </div>
                        )}
                    </div>
                </section>
                <aside aria-label="剧本 Agent 对话" className="flex min-h-0 flex-col border-l border-border bg-card">
                    <div className="border-b border-border px-4 py-3">
                        <div className="mb-2 flex items-center gap-1">
                            <Select className="min-w-0 flex-1" value={selectedId || undefined} placeholder="选择剧本对话" options={projects.map((project) => ({ value: project.id, label: project.title }))} onChange={(value) => selectProject(value)} />
                            <Button type="text" size="small" aria-label="新建剧本对话" icon={<Plus className="size-4" />} onClick={() => void runAction(create, "新建剧本失败")} />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <h2 className="font-semibold">剧本 Agent</h2>
                                <p className="truncate text-xs text-muted-foreground" title={sessionTitle}>
                                    {sessionTitle || "新剧本对话"}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <Button
                                    type="text"
                                    size="small"
                                    aria-label="重命名剧本对话"
                                    onClick={() => {
                                        setRenameTitle(sessionTitle);
                                        setSessionMenuOpen(true);
                                    }}
                                >
                                    重命名
                                </Button>
                                {selectedId ? (
                                    <Popconfirm
                                        title="删除当前剧本？"
                                        description="剧本内容、对话记录和生成成果都会被删除，且无法恢复。"
                                        okText="确认删除"
                                        cancelText="取消"
                                        okButtonProps={{ danger: true }}
                                        onConfirm={() => void runAction(removeCurrentScript, "删除剧本失败")}
                                    >
                                        <Button type="text" danger size="small" aria-label="删除当前剧本">
                                            删除
                                        </Button>
                                    </Popconfirm>
                                ) : null}
                            </div>
                        </div>
                        {sessionMenuOpen ? (
                            <div className="mt-2 flex gap-2">
                                <Input size="small" value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} onPressEnter={() => void runAction(renameCurrentSession, "重命名剧本失败")} placeholder="输入对话名称" />
                                <Button size="small" type="primary" disabled={!renameTitle.trim()} onClick={() => void runAction(renameCurrentSession, "重命名剧本失败")}>
                                    保存
                                </Button>
                            </div>
                        ) : null}
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto p-4">
                        {messages.map((item) => (
                            <div key={item.id} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${item.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-muted/60"}`}>
                                    {item.agent ? <div className="mb-1 text-[11px] font-medium text-primary">{item.agent || AGENT_LABEL}</div> : null}
                                    <div className="whitespace-pre-wrap">{item.content}</div>
                                </div>
                            </div>
                        ))}
                        {!messages.length ? <div className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">告诉我你想创作什么。我会先确认参数，再调度专业 Agent，并在重要节点等待你确认。</div> : null}
                    </div>
                    <div className="border-t border-border p-3">
                        {busy && streamStatus !== "idle" ? (
                            <div className="mb-2 text-xs text-muted-foreground">{streamStatus === "connecting" ? "正在连接 Agent…" : streamStatus === "waiting_first_token" ? "Agent 正在组织内容…" : "正在流式写作…"}</div>
                        ) : null}
                        {publicProgress ? <div className="mb-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">{publicProgress}</div> : null}
                        {runError ? <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">上次执行失败：{runError}</div> : null}
                        <Input.TextArea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="和统筹 Agent 讨论故事、要求修改或继续下一阶段……" autoSize={{ minRows: 3, maxRows: 7 }} />
                        <div className="mt-2 flex justify-between">
                            {busy ? (
                                <Button
                                    danger
                                    icon={<Pause className="size-4" />}
                                    onClick={() =>
                                        void runAction(async () => {
                                            if (selectedId && runId) await practiceScriptsApi.stopRun(selectedId, runId);
                                            abortRef.current?.abort();

                                            if (selectedId) await loadTree(selectedId);
                                        }, "停止剧本任务失败")
                                    }
                                >
                                    停止
                                </Button>
                            ) : (
                                <Button
                                    icon={<RefreshCw className="size-4" />}
                                    disabled={!selectedId || !runId}
                                    onClick={() =>
                                        selectedId &&
                                        runId &&
                                        void runAction(async () => {
                                            const failedRun = await practiceScriptsApi.run(selectedId, runId);
                                            await practiceScriptsApi.retryFailed(selectedId, runId);
                                            await consumeEvents(selectedId, runId, failedRun.lastEventSequence);
                                        }, "重试失败项失败")
                                    }
                                >
                                    重试失败项
                                </Button>
                            )}
                            <Button type="primary" icon={<Send className="size-4" />} loading={busy} disabled={!draft.trim() || !selectedId} onClick={() => void runAction(send, "发送消息失败")}>
                                发送
                            </Button>
                        </div>
                    </div>
                </aside>
            </div>
            <Modal title="确认进入下一步" open={Boolean(pendingConfirmation)} onCancel={() => setPendingConfirmation(null)} onOk={() => void runAction(confirmCurrentArtifact, "确认并进入下一步失败")} okText="确认下一步" confirmLoading={confirming}>
                <p>这一阶段的创作成果已经完成。确认后，剧本 Agent 会继续推进到下一阶段。</p>
            </Modal>
        </main>
    );
}
function publicPreviewText(value: string) {
    const trimmed = stripVisibleInternalText(value.trim());
    if (!trimmed.startsWith("{") && !trimmed.startsWith("```")) return value;
    const match = trimmed.match(/"(?:content|text|story|screenplay|outline|report)"\s*:\s*"((?:\\.|[^"\\])*)/);
    if (!match) return "";
    try {
        return JSON.parse(`"${match[1]}"`);
    } catch {
        return match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
}

function artifactContent(value: Record<string, unknown> | null) {
    if (!value) return "";
    for (const key of ["content_text", "content", "text", "story", "outline", "screenplay", "report"]) {
        const item = value[key];
        if (typeof item === "string") return publicArtifactText(item);
    }
    const json = value.content_json;
    if (json && typeof json === "object") {
        for (const key of ["content", "text", "story", "outline", "screenplay", "report"]) {
            const item = (json as Record<string, unknown>)[key];
            if (typeof item === "string") return publicArtifactText(item);
        }
    }
    return "";
}

function stripVisibleInternalText(value: string) {
    return value
        .replace(/\n?执行与保存要求[：:][\s\S]*$/i, "")
        .replace(/\n?备注[：:][\s\S]*?(?:请确认|$)/i, "")
        .trim();
}

function publicArtifactText(value: string) {
    const trimmed = stripVisibleInternalText(value.trim());
    if (!trimmed.startsWith("{") && !trimmed.startsWith("```")) return value;
    try {
        const parsed = JSON.parse(trimmed.replace(/^```json\s*/i, "").replace(/\s*```$/, "")) as Record<string, unknown>;
        return (
            ["content", "text", "story", "screenplay", "outline", "report"]
                .map((key) => parsed[key])
                .find((item): item is string => typeof item === "string" && Boolean(item.trim()))
                ?.trim() || ""
        );
    } catch {
        return publicPreviewText(value);
    }
}
