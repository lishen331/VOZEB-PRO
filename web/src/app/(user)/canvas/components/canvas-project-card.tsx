"use client";

import { ArrowUpRight, Check, Download, Pencil, Share2, Trash2, Workflow, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Button, Checkbox } from "@/components/gamma-ui/gamma-ant";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Tooltip } from "@/components/gamma-ui/gamma-ant-overlay";
import { cn } from "@/lib/utils";

import { useCanvasStore, type CanvasProjectSummary } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { exportCanvasProjects } from "../utils/canvas-export";

export function CanvasProjectCard({ project }: { project: CanvasProjectSummary }) {
    const { message } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const loadProject = useCanvasStore((state) => state.loadProject);
    const [exporting, setExporting] = useState(false);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);
    const href = `/canvas/${project.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    const preload = () => {
        router.prefetch(href);
        void loadProject(project.id).catch(() => undefined);
    };
    const open = () => {
        preload();
        router.push(href);
    };
    const saveTitle = () => {
        renameProject(project.id, editingTitle);
        stopEditing();
    };
    const exportProject = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            const detail = await loadProject(project.id);
            await exportCanvasProjects([detail]);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "画布导出失败");
        } finally {
            setExporting(false);
        }
    };

    return (
        <article
            className={cn(
                "group relative flex min-h-0 cursor-pointer flex-col justify-between rounded-lg border bg-[var(--gm-surface)] p-3 text-[var(--gm-text)] transition hover:-translate-y-px hover:border-[var(--gm-border-strong)] hover:shadow-[var(--gm-shadow)] focus-within:border-[var(--gm-accent)] focus-within:ring-2 focus-within:ring-[var(--gm-accent-ring)] sm:min-h-36 sm:p-3.5",
                selected ? "border-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]" : "border-[var(--gm-border)]",
            )}
            onClick={() => !editing && open()}
            onPointerEnter={preload}
            onFocusCapture={preload}
        >
            <div className="flex min-w-0 items-start gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-[var(--gm-radius-sm)] bg-[image:var(--gm-gradient)] text-white shadow-[var(--gm-glow-blue)]">
                    <Workflow className="size-4" />
                </span>
                {editing ? (
                    <Input className="min-w-0" value={editingTitle} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTitle()} autoFocus />
                ) : (
                    <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer text-left outline-none"
                        onClick={(event) => {
                            event.stopPropagation();
                            open();
                        }}
                    >
                        <h2 className="truncate text-[15px] font-semibold sm:text-base">{project.title}</h2>
                        <p className="mt-0.5 text-xs leading-5 text-[var(--gm-text-3)]">
                            {project.nodeCount} 个节点 · {project.connectionCount} 条连线
                        </p>
                    </button>
                )}
                <div className="flex shrink-0 items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                    {editing ? null : <ArrowUpRight className="size-3.5 text-[var(--gm-text-3)] transition group-hover:text-[var(--gm-text)]" />}
                    <Checkbox checked={selected} onChange={(event) => toggleSelected(project.id, event.target.checked)} aria-label={`选择 ${project.title}`} />
                </div>
            </div>
            <div className="mt-2.5 flex min-w-0 items-center justify-between gap-2 border-t border-[var(--gm-border)] pt-2.5">
                <p className="min-w-0 truncate text-xs leading-5 text-[var(--gm-text-3)]">更新于 {new Date(project.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    {editing ? (
                        <>
                            <CardAction label="保存名称" icon={<Check className="size-3.5" />} onClick={saveTitle} />
                            <CardAction label="取消重命名" icon={<X className="size-3.5" />} onClick={stopEditing} />
                        </>
                    ) : (
                        <>
                            <CardAction label="导出" icon={<Download className="size-3.5" />} loading={exporting} onClick={() => void exportProject()} />
                            <CardAction label="重命名" icon={<Pencil className="size-3.5" />} onClick={() => startEditing(project.id, project.title)} />
                            <CardAction label="删除" danger icon={<Trash2 className="size-3.5" />} onClick={() => setDeleteIds([project.id])} />
                            <Button className="!h-8 !px-2.5" icon={<Share2 className="size-3.5" />} onClick={() => router.push(`/works?sourceType=canvas&sourceId=${encodeURIComponent(project.id)}`)} aria-label="发布作品">
                                发布
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </article>
    );
}

function CardAction({ label, icon, danger = false, loading = false, onClick }: { label: string; icon: ReactNode; danger?: boolean; loading?: boolean; onClick: () => void }) {
    return (
        <Tooltip title={label}>
            <Button
                type="text"
                shape="circle"
                loading={loading}
                className={cn("!size-8 !text-[var(--gm-text-3)]", danger && "hover:!bg-[color-mix(in_srgb,var(--gm-danger)_10%,transparent)] hover:!text-[var(--gm-danger)]")}
                icon={icon}
                onClick={onClick}
                aria-label={label}
            />
        </Tooltip>
    );
}
