"use client";

import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Button, Input, Modal, Pagination } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import { BookOpenText, FileText, Search } from "lucide-react";

const IMPORT_PAGE_SIZE = 20;
const MAX_NOVEL_BYTES = 2 * 1024 * 1024;

type NovelEpisodeDraft = { title: string; script: string; sourceRange: string };
type NovelImportPreview = {
    committed: boolean;
    fileName: string;
    sourceCharacters: number;
    sourceBytes: number;
    drafts: NovelEpisodeDraft[];
    project?: { episodes?: Array<{ id?: string }> };
};

type DramaLabNovelImportProps = {
    projectId: string;
    currentEpisodeCount: number;
    messageApi: MessageInstance;
    onImported: (episodeId?: string) => Promise<void> | void;
    children?: ReactNode;
};

export function DramaLabNovelImport({ projectId, currentEpisodeCount, messageApi, onImported, children }: DramaLabNovelImportProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const readingRef = useRef(false);
    const importingRef = useRef(false);
    const [sourceText, setSourceText] = useState("");
    const sourceFileRef = useRef<File | undefined>(undefined);
    const [fileName, setFileName] = useState("");
    const [preview, setPreview] = useState<NovelImportPreview>();
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [reading, setReading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [dragging, setDragging] = useState(false);
    const dragDepthRef = useRef(0);
    const filtered = useMemo(() => {
        const keyword = query.trim().toLocaleLowerCase("zh-CN");
        const drafts = preview?.drafts || [];
        if (!keyword) return drafts.map((draft, index) => ({ draft, index }));
        return drafts.flatMap((draft, index) => (`${draft.title} ${draft.sourceRange}`.toLocaleLowerCase("zh-CN").includes(keyword) ? [{ draft, index }] : []));
    }, [preview, query]);
    const visible = filtered.slice((page - 1) * IMPORT_PAGE_SIZE, page * IMPORT_PAGE_SIZE);

    const close = () => {
        if (importing) return;
        setSourceText("");
        sourceFileRef.current = undefined;
        setFileName("");
        setPreview(undefined);
        setQuery("");
        setPage(1);
    };

    const readSource = async (file?: File) => {
        if (!file || readingRef.current || importingRef.current) return;
        readingRef.current = true;
        setReading(true);
        try {
            if (!/\.(?:txt|md|markdown|docx|doc)$/iu.test(file.name)) throw new Error("仅支持 TXT、MD、Markdown、DOCX 或 DOC 小说文件");
            if (!file.size) throw new Error("导入文件没有可识别的文本内容");
            if (file.size > MAX_NOVEL_BYTES) throw new Error("小说文件超过 2MB 限制，请拆分后再导入");
            const result = await requestNovelImportFile(projectId, file, false);
            sourceFileRef.current = file;
            setSourceText("");
            setFileName(file.name);
            setPreview(result);
            setQuery("");
            setPage(1);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "小说解析失败");
        } finally {
            readingRef.current = false;
            setReading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const confirmImport = async () => {
        if (!preview || importingRef.current || readingRef.current) return;
        importingRef.current = true;
        setImporting(true);
        try {
            const result = sourceFileRef.current ? await requestNovelImportFile(projectId, sourceFileRef.current, true) : await requestNovelImport(projectId, { sourceText, fileName, commit: true });
            const episodeId = result.project?.episodes?.[0]?.id;
            await onImported(episodeId);
            closeAfterImport();
            messageApi.success(`已导入 ${result.drafts.length} 集，原剧集可从版本记录恢复`);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "小说导入失败");
        } finally {
            importingRef.current = false;
            setImporting(false);
        }
    };

    const closeAfterImport = () => {
        setSourceText("");
        sourceFileRef.current = undefined;
        setFileName("");
        setPreview(undefined);
        setQuery("");
        setPage(1);
    };

    const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (!isFileDrag(event)) return;
        event.stopPropagation();
        dragDepthRef.current += 1;
        setDragging(true);
    };

    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (!isFileDrag(event)) {
            event.dataTransfer.dropEffect = "none";
            return;
        }
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
    };

    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (dragDepthRef.current === 0) return;
        event.stopPropagation();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragging(false);
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current = 0;
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (!file) {
            messageApi.error("请拖入 TXT、MD、Markdown、DOCX 或 DOC 小说文件");
            return;
        }
        void readSource(file);
    };

    const handleDragEnd = () => {
        dragDepthRef.current = 0;
        setDragging(false);
    };

    return (
        <>
            <div
                className={`${children ? "flex w-full flex-col gap-2 rounded-lg border border-dashed p-3" : "inline-flex items-center gap-2 rounded-lg border border-dashed px-1 py-1"} transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                aria-label="小说文件导入区域"
                aria-busy={reading || importing}
                data-dragging={dragging || undefined}
                data-drama-lab-novel-dropzone
            >
                <Button icon={<BookOpenText className="size-4" />} loading={reading} disabled={importing} onClick={() => inputRef.current?.click()}>
                    导入小说
                </Button>
                {children}
                <span className="hidden pr-2 text-xs text-muted-foreground sm:inline">或拖拽 TXT/MD/DOCX/DOC 文件到这里</span>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept=".txt,.md,.markdown,.docx,.doc,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                className="hidden"
                onChange={(event) => void readSource(event.target.files?.[0])}
            />
            <Modal
                title="导入小说并生成分集草稿"
                open={Boolean(preview)}
                width={720}
                centered
                destroyOnHidden
                closable={!importing}
                mask={{ closable: !importing }}
                okText={`确认替换为 ${preview?.drafts.length || 0} 集`}
                cancelText="取消"
                okButtonProps={{ loading: importing }}
                cancelButtonProps={{ disabled: importing }}
                onOk={() => void confirmImport()}
                onCancel={close}
                styles={{ container: { maxWidth: "calc(100vw - 24px)" }, body: { padding: 0 } }}
            >
                <div className="flex max-h-[min(68vh,640px)] min-h-0 flex-col overflow-hidden">
                    <div className="shrink-0 border-b border-border px-5 py-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                            <span className="flex min-w-0 items-center gap-1.5" title={fileName}>
                                <FileText className="size-3.5 shrink-0" />
                                <span className="max-w-60 truncate text-foreground">{fileName}</span>
                            </span>
                            <span>{preview?.drafts.length.toLocaleString("zh-CN")} 集</span>
                            <span>{preview?.sourceCharacters.toLocaleString("zh-CN")} 字</span>
                            <span>按章节标题分集；无章节标题时按正文长度分段</span>
                        </div>
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">确认后将替换当前 {currentEpisodeCount} 集，但不会修改角色、场景、道具和项目设置；系统会先创建恢复版本。</p>
                        <Input
                            className="!mt-3 !h-8"
                            allowClear
                            prefix={<Search className="size-3.5 text-muted-foreground" />}
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setPage(1);
                            }}
                            placeholder="搜索分集标题或来源范围"
                            aria-label="搜索待导入分集"
                        />
                    </div>
                    <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2" data-drama-lab-novel-preview>
                        {visible.length ? (
                            <div className="divide-y divide-border">
                                {visible.map(({ draft, index }) => (
                                    <div key={`${index}-${draft.title}`} className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2.5">
                                        <span className="text-xs font-medium tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium">{draft.title || `第 ${index + 1} 集`}</span>
                                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{draft.sourceRange || "按正文长度自动划分"}</span>
                                        </span>
                                        <span className="text-xs tabular-nums text-muted-foreground">{draft.script.length.toLocaleString("zh-CN")} 字</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid min-h-40 place-items-center text-sm text-muted-foreground">没有匹配的分集</div>
                        )}
                    </div>
                    {filtered.length > IMPORT_PAGE_SIZE ? (
                        <div className="flex shrink-0 justify-end border-t border-border px-4 py-2.5">
                            <Pagination size="small" current={page} pageSize={IMPORT_PAGE_SIZE} total={filtered.length} showSizeChanger={false} showLessItems onChange={setPage} />
                        </div>
                    ) : null}
                </div>
            </Modal>
        </>
    );
}

function isFileDrag(event: DragEvent<HTMLDivElement>) {
    return Array.from(event.dataTransfer.types || []).includes("Files");
}

async function requestNovelImport(projectId: string, input: { sourceText: string; fileName: string; commit: boolean }) {
    const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(projectId)}/import-novel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => ({}))) as { code?: number; data?: NovelImportPreview; msg?: string };
    if (!response.ok || payload.code !== 0 || !payload.data) throw new Error(payload.msg || "小说导入失败");
    return payload.data;
}
async function requestNovelImportFile(projectId: string, file: File, commit: boolean) {
    const form = new FormData();
    form.append("file", file);
    form.append("commit", String(commit));
    const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(projectId)}/import-novel`, { method: "POST", body: form });
    const payload = (await response.json().catch(() => ({}))) as { code?: number; data?: NovelImportPreview & { sourceText?: string }; msg?: string };
    if (!response.ok || payload.code !== 0 || !payload.data) throw new Error(payload.msg || "小说导入失败");
    return payload.data;
}
