"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Input, Modal, Select, Spin, Tag } from "antd";
import { ArrowLeft, BookOpen, FilePlus2, Import, Pause, RefreshCw, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ScriptPracticeProject } from "@/lib/script-practice-types";
import { practiceScriptsApi } from "@/services/api/practice-scripts";

type TreeItem = { id: string; key: string; type: string; label: string; status: string; version: number };
type ChatMessage = { id: string; role: "user" | "assistant"; agent?: string; content: string; status?: string };
const STARTERS = [
    { label: "策划故事", runType: "project_planning" },
    { label: "完整短故事", runType: "short_story" },
    { label: "小说总纲与章纲", runType: "novel_outlines" },
    { label: "改编策划", runType: "adaptation_bundle" },
    { label: "分集剧本", runType: "episode_scripts" },
    { label: "审核剧本", runType: "script_review" },
    { label: "文字分镜", runType: "text_storyboard" },
    { label: "资产提示词", runType: "asset_prompts" },
];
const STATUS: Record<string, { text: string; color: string }> = { awaiting_review: { text: "待确认", color: "gold" }, confirmed: { text: "已确认", color: "success" }, draft: { text: "草稿", color: "default" }, failed: { text: "失败", color: "error" } };
export default function ScriptPracticeWorkspace() {
    const router = useRouter();
    const { message } = App.useApp();
    const [projects, setProjects] = useState<ScriptPracticeProject[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [tree, setTree] = useState<TreeItem[]>([]);
    const [selectedKey, setSelectedKey] = useState("");
    const [artifact, setArtifact] = useState<Record<string, unknown> | null>(null);
    const [preview, setPreview] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [runId, setRunId] = useState("");
    const [busy, setBusy] = useState(false);
    const [newOpen, setNewOpen] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [idea, setIdea] = useState("");
    const [mode, setMode] = useState<"short_story" | "long_novel">("short_story");
    const [eventSource] = useState<{ close: () => void } | null>(null);
    const abortRef = useRef<AbortController | undefined>(undefined);
    const loadProjects = useCallback(async () => {
        const result = await practiceScriptsApi.list({ page: 1, pageSize: 50 });
        setProjects(result.items);
        setSelectedId((current) => current || result.items[0]?.id || "");
    }, []);
    const loadTree = useCallback(async (id: string) => {
        const result = await practiceScriptsApi.tree(id);
        setTree(result.items);
        setRunId(result.activeRuns[0]?.id || "");
        setSelectedKey((current) => current || result.items[0]?.key || "");
    }, []);
    useEffect(() => {
        void loadProjects().catch((e) => message.error(e.message));
    }, [loadProjects, message]);
    useEffect(() => {
        if (selectedId) void loadTree(selectedId).catch((e) => message.error(e.message));
    }, [selectedId, loadTree, message]);
    useEffect(() => {
        if (!selectedId || !selectedKey) {
            setArtifact(null);
            return;
        }
        const [type, key] = selectedKey.split(":");
        void practiceScriptsApi
            .artifact(selectedId, type, key)
            .then(setArtifact)
            .catch(() => setArtifact(null));
    }, [selectedId, selectedKey]);
    const consumeEvents = useCallback(
        async (projectId: string, currentRunId: string) => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            setBusy(true);
            try {
                const response = await fetch(practiceScriptsApi.runEventsUrl(projectId, currentRunId), { signal: controller.signal, cache: "no-store" });
                if (!response.ok || !response.body) throw new Error("Agent 流连接失败");
                const reader = response.body.getReader(),
                    decoder = new TextDecoder();
                let buffer = "";
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const chunks = buffer.split("\n\n");
                    buffer = chunks.pop() || "";
                    for (const chunk of chunks) {
                        const line = chunk.split("\n").find((row) => row.startsWith("data: "));
                        if (!line) continue;
                        const event = JSON.parse(line.slice(6)) as { type: string; data: Record<string, unknown> };
                        if (event.type === "assistant_delta") {
                            const delta = String(event.data.delta || "");
                            setMessages((current) => {
                                const last = current.at(-1);
                                return last?.role === "assistant"
                                    ? [...current.slice(0, -1), { ...last, content: last.content + delta }]
                                    : [...current, { id: crypto.randomUUID(), role: "assistant", agent: String(event.data.agentKey || "统筹"), content: delta, status: "streaming" }];
                            });
                        }
                        if (event.type === "artifact_delta") setPreview(String(event.data.delta || ""));
                        if (event.type === "agent_started")
                            setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", agent: String(event.data.name || event.data.agentKey || "Agent"), content: "正在处理当前任务……", status: "working" }]);
                        if (event.type === "artifact_saved") {
                            setPreview("");
                            await loadTree(projectId);
                            const key = `${event.data.artifactType}:${event.data.artifactKey}`;
                            setSelectedKey(key);
                            const [type, itemKey] = key.split(":");
                            setArtifact(await practiceScriptsApi.artifact(projectId, type, itemKey));
                        }
                        if (event.type === "error") message.error(String(event.data.message || "Agent 执行失败"));
                    }
                }
            } finally {
                setBusy(false);
            }
        },
        [loadTree, message],
    );
    useEffect(() => () => abortRef.current?.abort(), []);
    const start = async (runType: string, input: Record<string, unknown>) => {
        if (!selectedId) return;
        const run = await practiceScriptsApi.createRun(selectedId, { runType, clientRequestId: crypto.randomUUID(), input });
        setRunId(run.id);
        await consumeEvents(selectedId, run.id);
    };
    const send = async () => {
        const text = draft.trim();
        if (!text || !selectedId || busy) return;
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: text }]);
        setDraft("");
        const sessions = await practiceScriptsApi.chatSessions(selectedId);
        const session = sessions[0] || (await practiceScriptsApi.createChatSession(selectedId));
        const run = await practiceScriptsApi.sendChat(selectedId, session.id, text, crypto.randomUUID());
        setRunId(run.id);
        await consumeEvents(selectedId, run.id);
    };
    const create = async () => {
        if (!newTitle.trim()) return;
        const result = await practiceScriptsApi.create({ title: newTitle.trim(), sourceType: "idea", idea: idea.trim() || undefined });
        const project = "project" in result ? result.project : result;
        setNewOpen(false);
        await loadProjects();
        setSelectedId(project.id);
        const run = await practiceScriptsApi.createRun(project.id, { runType: "project_planning", clientRequestId: crypto.randomUUID(), input: { mode, title: newTitle.trim(), idea: idea.trim() } });
        setRunId(run.id);
        await consumeEvents(project.id, run.id);
    };
    const selectedProject = projects.find((item) => item.id === selectedId);
    const visible = useMemo(() => artifactContent(artifact) || preview, [artifact, preview]);
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
                    <Button type="primary" icon={<FilePlus2 className="size-4" />} onClick={() => setNewOpen(true)}>
                        新建项目
                    </Button>
                </div>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_340px]">
                <aside aria-label="剧本工作目录" className="min-h-0 overflow-y-auto border-r border-border bg-card p-3">
                    <h2 className="mb-3 text-sm font-semibold">工作目录</h2>
                    <Select className="w-full" value={selectedId || undefined} placeholder="选择项目" options={projects.map((p) => ({ value: p.id, label: p.title }))} onChange={setSelectedId} />
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
                                <Button
                                    size="small"
                                    type="primary"
                                    onClick={() => selectedId && artifactId && void practiceScriptsApi.confirmArtifact(selectedId, artifactId, tree.find((i) => i.key === selectedKey)?.type || selectedKey, runId).then(() => loadTree(selectedId))}
                                >
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
                        <h2 className="font-semibold">剧本 Agent</h2>
                        <p className="text-xs text-muted-foreground">统筹、策划、作者、编剧、编辑与分镜师协作</p>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto p-4">
                        {messages.map((item) => (
                            <div key={item.id} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${item.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-muted/60"}`}>
                                    {item.agent ? <div className="mb-1 text-[11px] font-medium text-primary">{item.agent}</div> : null}
                                    <div className="whitespace-pre-wrap">{item.content}</div>
                                </div>
                            </div>
                        ))}
                        {!messages.length ? <div className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">告诉我你想创作什么。我会先确认参数，再调度专业 Agent，并在重要节点等待你确认。</div> : null}
                    </div>
                    <div className="border-t border-border p-3">
                        <div className="mb-2 flex flex-wrap gap-1">
                            {STARTERS.map((item) => (
                                <Button key={item.runType} size="small" disabled={!selectedId || busy} onClick={() => void start(item.runType, { instruction: draft || item.label })}>
                                    {item.label}
                                </Button>
                            ))}
                        </div>
                        <Input.TextArea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="和统筹 Agent 讨论故事、要求修改或继续下一阶段……" autoSize={{ minRows: 3, maxRows: 7 }} />
                        <div className="mt-2 flex justify-between">
                            {busy ? (
                                <Button
                                    danger
                                    icon={<Pause className="size-4" />}
                                    onClick={() => {
                                        if (selectedId && runId) void practiceScriptsApi.stopRun(selectedId, runId);
                                        abortRef.current?.abort();
                                        eventSource?.close();
                                    }}
                                >
                                    停止
                                </Button>
                            ) : (
                                <Button icon={<RefreshCw className="size-4" />} disabled={!selectedId || !runId} onClick={() => selectedId && runId && void practiceScriptsApi.retryFailed(selectedId, runId)}>
                                    重试失败项
                                </Button>
                            )}
                            <Button type="primary" icon={<Send className="size-4" />} loading={busy} disabled={!draft.trim() || !selectedId} onClick={() => void send()}>
                                发送
                            </Button>
                        </div>
                    </div>
                </aside>
            </div>
            <Modal title="新建剧本项目" open={newOpen} onCancel={() => setNewOpen(false)} onOk={() => void create()} okText="创建并开始策划">
                <div className="grid gap-3">
                    <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="项目标题" />
                    <Select
                        value={mode}
                        onChange={setMode}
                        options={[
                            { value: "short_story", label: "短故事" },
                            { value: "long_novel", label: "长篇小说" },
                        ]}
                    />
                    <Input.TextArea value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="输入一句话创意；短故事会先生成完整小说体正文" autoSize={{ minRows: 5, maxRows: 10 }} />
                </div>
            </Modal>
        </main>
    );
}
function artifactContent(value: Record<string, unknown> | null) {
    if (!value) return "";
    for (const key of ["content_text", "content", "text", "story", "outline", "screenplay", "report"]) {
        const item = value[key];
        if (typeof item === "string") return item;
    }
    const json = value.content_json;
    if (json && typeof json === "object") {
        for (const key of ["content", "text", "story", "outline", "screenplay", "report"]) {
            const item = (json as Record<string, unknown>)[key];
            if (typeof item === "string") return item;
        }
    }
    return "";
}
