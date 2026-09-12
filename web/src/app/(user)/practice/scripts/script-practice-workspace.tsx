"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Input, Modal, Select, Spin, Tag } from "antd";
import { ArrowLeft, Download, FilePlus2, History, Import, Lightbulb, Save, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ScriptBlock, ScriptDocument, ScriptPracticeProject, ScriptVersion } from "@/lib/script-practice-types";
import { practiceScriptsApi, type ScriptProjectDetail } from "@/services/api/practice-scripts";

const STAGES = ["创意输入", "故事梗概", "故事大纲", "人物与地点", "分集与场景", "剧本文本", "编辑与检查"];
const STAGE_OPERATIONS = [
    { key: "synopsis", label: "生成梗概", operation: "generate_synopsis" },
    { key: "outline", label: "生成大纲", operation: "generate_outline" },
    { key: "entities", label: "生成人物与地点", operation: "generate_entities" },
    { key: "scenes", label: "生成场景", operation: "generate_scenes" },
    { key: "screenplay", label: "生成剧本文本", operation: "generate_screenplay" },
] as const;
const BLOCK_LABELS: Record<ScriptBlock["type"], string> = { "scene-heading": "场景标题", action: "动作", character: "角色", parenthetical: "括号说明", dialogue: "对白", transition: "转场", note: "备注" };

export default function ScriptPracticeWorkspace() {
    const router = useRouter();
    const { message } = App.useApp();
    const [projects, setProjects] = useState<ScriptPracticeProject[]>([]);
    const [detail, setDetail] = useState<ScriptProjectDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState("");
    const [newOpen, setNewOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [versionsOpen, setVersionsOpen] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [idea, setIdea] = useState("");
    const [importTitle, setImportTitle] = useState("导入剧本");
    const [importFormat, setImportFormat] = useState<"fountain" | "fdx" | "text" | "markdown">("fountain");
    const [importContent, setImportContent] = useState("");
    const [importPreview, setImportPreview] = useState<ScriptDocument | null>(null);
    const [saving, setSaving] = useState(false);
    const [proposal, setProposal] = useState<{ operation: string; before: string; proposedAfter: string; targetBlockIds: string[]; baseVersionId: string } | null>(null);
    const [instruction, setInstruction] = useState("");
    const [selectedBlockId, setSelectedBlockId] = useState("");
    const [stageBusy, setStageBusy] = useState(false);

    const loadProjects = async () => {
        setLoading(true);
        try {
            const result = await practiceScriptsApi.list({ page: 1, pageSize: 50 });
            setProjects(result.items);
            if (!selectedId && result.items[0]) setSelectedId(result.items[0].id);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "剧本列表加载失败");
        } finally {
            setLoading(false);
        }
    };
    const loadDetail = async (id: string) => {
        try {
            setDetail(await practiceScriptsApi.detail(id));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "剧本加载失败");
        }
    };
    useEffect(() => {
        void loadProjects();
    }, []);
    useEffect(() => {
        if (selectedId) void loadDetail(selectedId);
    }, [selectedId]);

    const create = async () => {
        if (!newTitle.trim()) return message.error("请填写剧本标题");
        setSaving(true);
        try {
            const result = await practiceScriptsApi.create({ title: newTitle.trim(), sourceType: "idea", idea: idea.trim() || undefined });
            const project = "project" in result ? result.project : result;
            setNewOpen(false);
            setNewTitle("");
            setIdea("");
            await loadProjects();
            setSelectedId(project.id);
            message.success("剧本已创建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "剧本创建失败");
        } finally {
            setSaving(false);
        }
    };
    const previewImport = async () => {
        if (!importContent.trim()) return message.error("请粘贴剧本内容");
        setSaving(true);
        try {
            const result = await practiceScriptsApi.import({ title: importTitle.trim() || "导入剧本", format: importFormat, content: importContent, confirm: false });
            setImportPreview(result.document || null);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "剧本解析失败");
        } finally {
            setSaving(false);
        }
    };
    const confirmImport = async () => {
        setSaving(true);
        try {
            const result = await practiceScriptsApi.import({ title: importTitle.trim() || "导入剧本", format: importFormat, content: importContent, confirm: true });
            setImportOpen(false);
            setImportPreview(null);
            await loadProjects();
            if (result.project?.id) setSelectedId(result.project.id);
            message.success("剧本已导入");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "剧本导入失败");
        } finally {
            setSaving(false);
        }
    };
    const save = async () => {
        if (!detail?.document) return;
        setSaving(true);
        try {
            await practiceScriptsApi.saveVersion(detail.project.id, detail.document, detail.project.currentVersionId);
            await loadDetail(detail.project.id);
            message.success("版本已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "版本保存失败");
        } finally {
            setSaving(false);
        }
    };
    const updateBlock = (id: string, text: string) =>
        setDetail((current) => (current?.document ? { ...current, document: { ...current.document, blocks: current.document.blocks.map((block) => (block.id === id ? { ...block, text } : block)) } } : current));
    const propose = async (operation: string, block?: ScriptBlock) => {
        const selectedBlock = block || detail?.document?.blocks.find((item) => item.id === selectedBlockId);
        if (!selectedBlock) return message.error("请先点击或选择一个剧本块");
        if (!instruction.trim()) return message.error("请先填写修改要求");
        if (!detail?.project.currentVersionId) return message.error("请先保存当前版本");
        setSaving(true);
        try {
            const result = await practiceScriptsApi.propose(detail.project.id, { operation, baseVersionId: detail.project.currentVersionId, targetBlockIds: [selectedBlock.id], instruction: instruction.trim() });
            setProposal({ operation: result.operation, before: result.before, proposedAfter: result.proposedAfter, targetBlockIds: result.targetBlockIds, baseVersionId: result.baseVersionId });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 建议生成失败");
        } finally {
            setSaving(false);
        }
    };
    const apply = async () => {
        if (!detail?.document || !detail.project.currentVersionId || !proposal) return;
        setSaving(true);
        try {
            await practiceScriptsApi.apply(detail.project.id, proposal.operation, {
                baseVersionId: proposal.baseVersionId,
                currentVersionId: detail.project.currentVersionId,
                targetBlockIds: proposal.targetBlockIds,
                before: proposal.before,
                proposedAfter: proposal.proposedAfter,
            });
            setProposal(null);
            await loadDetail(detail.project.id);
            message.success("修改已应用并创建新版本");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "修改应用失败");
        } finally {
            setSaving(false);
        }
    };

    const generateStage = async (operation: string, stageInput: unknown) => {
        if (!detail) return;
        setStageBusy(true);
        try {
            await practiceScriptsApi.generateStage(detail.project.id, operation, stageInput);
            await loadDetail(detail.project.id);
            message.success("阶段结果已生成，请确认后继续");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "阶段生成失败");
        } finally {
            setStageBusy(false);
        }
    };
    const confirmStage = async (stage: string) => {
        if (!detail) return;
        setStageBusy(true);
        try {
            await practiceScriptsApi.confirmStage(detail.project.id, stage);
            await loadDetail(detail.project.id);
            message.success("阶段已确认");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "阶段确认失败");
        } finally {
            setStageBusy(false);
        }
    };
    const restoreVersion = async (version: ScriptVersion) => {
        if (!detail?.document) return;
        setSaving(true);
        try {
            await practiceScriptsApi.saveVersion(detail.project.id, version.documentSnapshot, detail.project.currentVersionId);
            await loadDetail(detail.project.id);
            setVersionsOpen(false);
            message.success("已恢复并创建新版本");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "版本恢复失败");
        } finally {
            setSaving(false);
        }
    };

    const document = detail?.document;
    const currentVersion = detail?.project.currentVersionId;
    const currentStage = useMemo(() => (document?.blocks.length ? 5 : 0), [document]);
    return (
        <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground" data-script-practice-workspace>
            <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col px-3 py-4 sm:px-6 sm:py-6">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <Button type="text" icon={<ArrowLeft className="size-4" />} onClick={() => router.push("/practice")} aria-label="返回练习">
                            返回练习
                        </Button>
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">单人文本工作区</p>
                            <h1 className="truncate text-xl font-semibold">剧本练习</h1>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button icon={<FilePlus2 className="size-4" />} onClick={() => setNewOpen(true)}>
                            新建剧本
                        </Button>
                        <Button icon={<Import className="size-4" />} onClick={() => setImportOpen(true)}>
                            导入
                        </Button>
                        {detail ? (
                            <>
                                <Button icon={<Save className="size-4" />} loading={saving} onClick={() => void save()}>
                                    保存版本
                                </Button>
                                <Button icon={<History className="size-4" />} onClick={() => setVersionsOpen(true)}>
                                    版本
                                </Button>
                            </>
                        ) : null}
                    </div>
                </header>
                <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border pb-3" aria-label="剧本阶段">
                    {STAGES.map((stage, index) => {
                        const stageKey = ["idea", "synopsis", "outline", "entities", "scenes", "screenplay", "revision"][index];
                        const saved = detail?.stages.find((item) => item.key === stageKey);
                        return (
                            <span key={stage} className="flex shrink-0 items-center gap-1">
                                <Tag color={saved?.status === "confirmed" || index <= currentStage ? "blue" : undefined}>
                                    {index + 1}. {stage}
                                </Tag>
                                {saved?.status === "awaiting_review" ? (
                                    <Button size="small" loading={stageBusy} onClick={() => void confirmStage(stageKey)}>
                                        确认
                                    </Button>
                                ) : null}
                            </span>
                        );
                    })}
                </div>
                {detail ? (
                    <>
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3" aria-label="阶段生成操作">
                        <span className="mr-1 text-xs text-muted-foreground">阶段生成</span>
                        {STAGE_OPERATIONS.map((item) => {
                            const saved = detail.stages.find((stage) => stage.key === item.key);
                            const prerequisite = ({ outline: "synopsis", entities: "outline", scenes: "entities", screenplay: "scenes" } as Record<string, string>)[item.key];
                            const locked = Boolean(prerequisite && !detail.stages.some((stage) => stage.key === prerequisite && stage.status === "confirmed"));
                            return (
                                <Button
                                    key={item.key}
                                    size="small"
                                    loading={stageBusy}
                                    disabled={locked}
                                    onClick={() => void generateStage(item.operation, { idea: detail.project.title, current: document?.blocks.map((block) => block.text).join("\n\n") })}
                                >
                                    {saved?.status === "awaiting_review" ? "重新生成" : item.label}
                                </Button>
                            );
                        })}
                    </div>
                    {detail.stages.filter((stage) => stage.status === "awaiting_review" || stage.status === "failed").map((stage) => (
                        <div key={stage.key} className="mt-3 rounded-lg border border-border bg-card p-3" aria-label={`${stage.key}阶段结果`}>
                            <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-medium">{STAGES[["idea", "synopsis", "outline", "entities", "scenes", "screenplay", "revision"].indexOf(stage.key)] || stage.key}结果</span>
                                <Tag color={stage.status === "failed" ? "error" : "processing"}>{stage.status === "failed" ? "失败" : "待确认"}</Tag>
                            </div>
                            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs leading-5">{JSON.stringify(stage.status === "failed" ? { error: stage.error } : stage.draft, null, 2)}</pre>
                        </div>
                    ))}
                    </>
                ) : null}
                <div className="grid min-h-0 flex-1 gap-4 pt-4 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
                    <aside className="rounded-lg border border-border bg-card p-3" aria-label="剧本项目">
                        <h2 className="text-sm font-semibold">我的剧本</h2>
                        {loading ? (
                            <Spin className="mt-4" />
                        ) : (
                            <div className="mt-3 space-y-1">
                                {projects.map((project) => (
                                    <button
                                        type="button"
                                        key={project.id}
                                        onClick={() => setSelectedId(project.id)}
                                        className={`block w-full rounded-md px-3 py-2 text-left text-sm ${selectedId === project.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                                    >
                                        {project.title}
                                    </button>
                                ))}
                                {!projects.length ? <p className="text-xs text-muted-foreground">还没有剧本项目</p> : null}
                            </div>
                        )}
                    </aside>
                    <section className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-5" aria-label="专业剧本编辑器">
                        <div className="mb-4 flex items-center justify-between gap-2">
                            <div>
                                <h2 className="text-base font-semibold">{detail?.project.title || "选择或新建剧本"}</h2>
                                <p className="text-xs text-muted-foreground">场景标题 · 动作 · 角色 · 括号说明 · 对白 · 转场</p>
                            </div>
                            {currentVersion ? <span className="text-xs text-muted-foreground">当前版本已保存</span> : null}
                        </div>
                        {document ? (
                            <div className="space-y-3">
                                {document.blocks.map((block) => (
                                    <div key={block.id} className={`group rounded-md border p-2 ${selectedBlockId === block.id ? "border-primary/60 bg-primary/5" : "border-border/70"}`} data-script-block={block.type} onClick={() => setSelectedBlockId(block.id)}>
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-medium text-muted-foreground">{BLOCK_LABELS[block.type]}</span>
                                            {block.type !== "note" ? (
                                                <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                                                    <Button size="small" icon={<Sparkles className="size-3" />} onClick={() => void propose("rewrite_selection", block)}>
                                                        生成建议
                                                    </Button>
                                                </div>
                                            ) : null}
                                        </div>
                                        <Input.TextArea value={block.text} autoSize={{ minRows: block.type === "dialogue" || block.type === "action" ? 2 : 1, maxRows: 8 }} onChange={(event) => updateBlock(block.id, event.target.value)} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid min-h-60 place-items-center text-sm text-muted-foreground">从左侧选择剧本，或新建一个剧本开始。</div>
                        )}
                    </section>
                    <aside className="rounded-lg border border-border bg-card p-3" aria-label="AI 编剧助手">
                        <div className="flex items-center gap-2">
                            <Lightbulb className="size-4 text-primary" />
                            <h2 className="text-sm font-semibold">AI 编剧助手</h2>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">建议先保存版本，再选择剧本块生成修改建议。建议会在确认后写入。</p>
                        <Input.TextArea className="mt-3" value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="告诉助手想怎么改" autoSize={{ minRows: 3, maxRows: 6 }} />
                        <Button className="mt-3" type="primary" block loading={saving} disabled={!document || !selectedBlockId || !instruction.trim() || !currentVersion} icon={<Sparkles className="size-4" />} onClick={() => void propose("rewrite_selection")}>
                            生成修改建议
                        </Button>
                        <p className="mt-2 text-[11px] text-muted-foreground">{selectedBlockId ? "已选择一个剧本块" : "先点击中间的剧本块"}</p>
                        <a className="mt-4 inline-flex items-center gap-2 text-xs text-primary hover:underline" href={detail ? practiceScriptsApi.exportUrl(detail.project.id, "fountain") : undefined} download>
                            <Download className="size-3" />
                            导出 Fountain
                        </a>
                    </aside>
                </div>
            </div>
            <Modal title="从一个想法开始" open={newOpen} onCancel={() => setNewOpen(false)} onOk={() => void create()} confirmLoading={saving} okText="创建" cancelText="取消">
                <Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="剧本标题" />
                <Input.TextArea className="mt-3" value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="输入一个创意（选填）" autoSize={{ minRows: 4, maxRows: 8 }} />
            </Modal>
            <Modal
                title="从已有剧本导入"
                open={importOpen}
                onCancel={() => setImportOpen(false)}
                onOk={() => void (importPreview ? confirmImport() : previewImport())}
                confirmLoading={saving}
                okText={importPreview ? "确认导入" : "解析预览"}
                cancelText="取消"
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <Input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} placeholder="剧本标题" />
                    <Select
                        value={importFormat}
                        onChange={setImportFormat}
                        options={[
                            { value: "fountain", label: "Fountain" },
                            { value: "fdx", label: "FDX" },
                            { value: "text", label: "纯文本" },
                            { value: "markdown", label: "Markdown" },
                        ]}
                    />
                </div>
                <Input.TextArea className="mt-3" value={importContent} onChange={(event) => setImportContent(event.target.value)} placeholder="粘贴剧本内容" autoSize={{ minRows: 8, maxRows: 18 }} />
                {importPreview ? <div className="mt-3 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">解析出 {importPreview.blocks.length} 个剧本块</div> : null}
            </Modal>
            <Modal title="版本" open={versionsOpen} footer={null} onCancel={() => setVersionsOpen(false)}>
                {detail?.versions.map((version: ScriptVersion) => (
                    <div key={version.id} className="flex items-center justify-between gap-3 border-b border-border py-3 text-sm">
                        <span>
                            版本 {version.documentSnapshot.version} · {version.source}
                        </span>
                        <Button size="small" onClick={() => void restoreVersion(version)}>
                            恢复到此版本
                        </Button>
                    </div>
                ))}
            </Modal>
            <Modal title="修改建议" open={Boolean(proposal)} onCancel={() => setProposal(null)} onOk={() => void apply()} confirmLoading={saving} okText="应用修改" cancelText="取消">
                {proposal ? (
                    <div className="space-y-3 text-sm">
                        <div>
                            <div className="text-xs text-muted-foreground">修改前</div>
                            <p className="mt-1 rounded bg-muted p-2 whitespace-pre-wrap">{proposal.before}</p>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground">建议结果</div>
                            <p className="mt-1 rounded border border-primary/30 bg-primary/5 p-2 whitespace-pre-wrap">{proposal.proposedAfter}</p>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </main>
    );
}
