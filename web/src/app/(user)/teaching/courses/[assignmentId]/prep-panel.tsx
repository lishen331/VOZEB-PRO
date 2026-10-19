"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ClipboardList, Download, FileText, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import type { CourseMaterial, TeachingAssignment } from "@/lib/school-domain";
import { cn } from "@/lib/utils";
import type { PrepLesson } from "@/app/(user)/teaching/teaching-routes";
import { MATERIAL_ACCEPT, MaterialIcon, formatBytes, materialDownloadHref } from "./prep-materials";

/*
 * 右栏：课时说明 / 资料 / 作业 三个标签（结构同 /bluegamma/courses 的 PrepPanel）。
 * 资料：平台标准资料只读；本校补充资料可上传、重命名、删除（对所有使用此课程的班级可见）。
 */

type PanelTab = "plan" | "files" | "tasks";
const PANEL_TABS: readonly { key: PanelTab; label: string; icon: typeof FileText }[] = [
    { key: "plan", label: "课时说明", icon: FileText },
    { key: "files", label: "资料", icon: Paperclip },
    { key: "tasks", label: "作业", icon: ClipboardList },
];

function Block({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-medium text-[var(--gm-text-3)]">{title}</h4>
                {extra}
            </div>
            {children}
        </section>
    );
}

export interface MaterialActions {
    canManage: boolean;
    busy: boolean;
    onUpload: (file: File) => void;
    onRename: (material: CourseMaterial) => void;
    onRemove: (material: CourseMaterial) => void;
    onOpen: (material: CourseMaterial) => void;
}

const ROW_ICON_BTN = "grid size-8 shrink-0 place-items-center rounded-full text-[var(--gm-text-3)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]";

function MaterialList({ materials, actions }: { materials: readonly CourseMaterial[]; actions?: MaterialActions }) {
    return (
        <ul className="flex flex-col gap-2">
            {materials.map((material) => {
                const editable = Boolean(actions?.canManage) && material.sourceScope === "school";
                return (
                    <li key={material.id} className="flex items-center gap-2 rounded-[12px] p-2.5 ring-1 ring-[var(--gm-border)]">
                        <button type="button" onClick={() => actions?.onOpen(material)} disabled={!actions} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default" aria-label={actions ? `预览 ${material.title}` : undefined}>
                            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]">
                                <MaterialIcon mimeType={material.mimeType} className="size-4" />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col leading-tight">
                                <span className="truncate text-[13px]">{material.title}</span>
                                <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--gm-text-3)]">
                                    {material.sourceScope === "school" ? <GammaBadge tone="cyan">本校</GammaBadge> : <GammaBadge tone="neutral">平台</GammaBadge>}
                                    {formatBytes(material.bytes)}
                                </span>
                            </span>
                        </button>
                        <a href={materialDownloadHref(material)} aria-label={`下载 ${material.title}`} className={ROW_ICON_BTN}>
                            <Download className="size-3.5" />
                        </a>
                        {editable && actions ? (
                            <>
                                <button type="button" aria-label={`重命名 ${material.title}`} onClick={() => actions.onRename(material)} className={ROW_ICON_BTN}>
                                    <Pencil className="size-3.5" />
                                </button>
                                <button type="button" aria-label={`删除 ${material.title}`} onClick={() => actions.onRemove(material)} className={cn(ROW_ICON_BTN, "hover:text-[var(--gm-danger)]")}>
                                    <Trash2 className="size-3.5" />
                                </button>
                            </>
                        ) : null}
                    </li>
                );
            })}
            {!materials.length ? <li className="rounded-[12px] border border-dashed border-[var(--gm-border-strong)] px-3 py-6 text-center text-xs text-[var(--gm-text-3)]">还没有资料</li> : null}
        </ul>
    );
}
function PlanTab({ lesson, actions }: { lesson: PrepLesson; actions: MaterialActions }) {
    return (
        <div className="flex flex-col gap-5">
            <Block title="本课时">
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{lesson.description || "课程方暂未填写本课时说明。"}</p>
            </Block>
            <Block title="所属章节">
                <div className="rounded-[10px] bg-[var(--gm-wash)] px-3 py-2.5 text-[13px] leading-relaxed">
                    <p className="font-medium">{lesson.chapter.title}</p>
                    {lesson.chapter.description ? <p className="mt-1 text-[var(--gm-text-2)]">{lesson.chapter.description}</p> : null}
                </div>
            </Block>
            {lesson.chapter.materials.length ? (
                <Block title={`章节资料 · ${lesson.chapter.materials.length}`}>
                    <MaterialList materials={lesson.chapter.materials} actions={{ ...actions, canManage: false }} />
                </Block>
            ) : null}
        </div>
    );
}

function FilesTab({ lesson, actions }: { lesson: PrepLesson; actions: MaterialActions }) {
    return (
        <Block
            title={`课时资料 · ${lesson.materials.length}`}
            extra={
                actions.canManage ? (
                    <label
                        className={cn(
                            "inline-flex h-7 cursor-pointer items-center gap-1 rounded-full bg-[var(--gm-accent-soft)] px-2.5 text-xs font-medium text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)] hover:brightness-110",
                            actions.busy && "pointer-events-none opacity-60",
                        )}
                    >
                        <Plus className="size-3.5" />
                        {actions.busy ? "上传中…" : "添加资料"}
                        <input
                            type="file"
                            accept={MATERIAL_ACCEPT}
                            className="sr-only"
                            aria-label="添加本校资料"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (file) actions.onUpload(file);
                            }}
                        />
                    </label>
                ) : null
            }
        >
            <MaterialList materials={lesson.materials} actions={actions} />
            {actions.canManage ? <p className="text-[11px] text-[var(--gm-text-3)]">本校补充资料对所有使用此课程的班级可见。</p> : null}
        </Block>
    );
}

const STATUS_BADGE = { draft: { tone: "warning", label: "草稿" }, published: { tone: "blue", label: "进行中" }, closed: { tone: "neutral", label: "已关闭" } } as const;

function TasksTab({ assignments, canCreate, onCreate, onOpenAssignments }: { assignments: readonly TeachingAssignment[]; canCreate: boolean; onCreate: () => void; onOpenAssignments: () => void }) {
    return (
        <div className="flex flex-col gap-4">
            <Block title={`本课时作业 · ${assignments.length}`}>
                <ul className="flex flex-col gap-2">
                    {assignments.map((assignment) => (
                        <li key={assignment.id} className="rounded-[12px] p-3 ring-1 ring-[var(--gm-border)]">
                            <div className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{assignment.title}</span>
                                <GammaBadge tone={STATUS_BADGE[assignment.status].tone}>{STATUS_BADGE[assignment.status].label}</GammaBadge>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-[var(--gm-text-3)]">
                                {assignment.className}
                                {assignment.dueAt ? ` · 截止 ${new Date(assignment.dueAt).toLocaleDateString("zh-CN")}` : ""}
                            </p>
                        </li>
                    ))}
                    {!assignments.length ? <li className="rounded-[12px] border border-dashed border-[var(--gm-border-strong)] px-3 py-6 text-center text-xs text-[var(--gm-text-3)]">还没有给这节课布置作业</li> : null}
                </ul>
            </Block>
            <div className="flex flex-wrap gap-2">
                <GammaButton size="sm" icon={<Plus className="size-4" />} disabled={!canCreate} onClick={onCreate}>
                    布置作业
                </GammaButton>
                <GammaButton size="sm" variant="ghost" onClick={onOpenAssignments}>
                    去作业管理
                </GammaButton>
            </div>
            {!canCreate ? <p className="text-[11px] text-[var(--gm-text-3)]">这门课还没有安排到你负责的班级，暂时不能布置作业。</p> : null}
        </div>
    );
}

export interface PrepPanelProps {
    lesson: PrepLesson;
    actions: MaterialActions;
    assignments: readonly TeachingAssignment[];
    canCreateAssignment: boolean;
    onCreateAssignment: () => void;
    onOpenAssignments: () => void;
}

export function PrepPanel({ lesson, actions, assignments, canCreateAssignment, onCreateAssignment, onOpenAssignments }: PrepPanelProps) {
    const [tab, setTab] = useState<PanelTab>("plan");
    const reduce = useReducedMotion();
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div role="tablist" aria-label="备课资料" className="flex shrink-0 gap-1 border-b border-[var(--gm-border)] px-4">
                {PANEL_TABS.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        role="tab"
                        aria-selected={tab === item.key}
                        onClick={() => setTab(item.key)}
                        className={cn("relative inline-flex h-11 items-center gap-1.5 px-2.5 text-[13px] transition-colors", tab === item.key ? "text-[var(--gm-text)]" : "text-[var(--gm-text-3)] hover:text-[var(--gm-text-2)]")}
                    >
                        <item.icon className="size-3.5" />
                        {item.label}
                        {item.key === "files" && lesson.materials.length ? <span className="text-[11px] tabular-nums opacity-60">{lesson.materials.length}</span> : null}
                        {item.key === "tasks" && assignments.length ? <span className="text-[11px] tabular-nums opacity-60">{assignments.length}</span> : null}
                        {tab === item.key ? (
                            <motion.span
                                layoutId="teaching-prep-tab-line"
                                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38 }}
                                className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-[image:var(--gm-gradient)]"
                            />
                        ) : null}
                    </button>
                ))}
            </div>
            <div className="gm-scroll min-h-0 flex-1 overflow-y-auto p-4">
                {tab === "plan" ? (
                    <PlanTab lesson={lesson} actions={actions} />
                ) : tab === "files" ? (
                    <FilesTab lesson={lesson} actions={actions} />
                ) : (
                    <TasksTab assignments={assignments} canCreate={canCreateAssignment} onCreate={onCreateAssignment} onOpenAssignments={onOpenAssignments} />
                )}
            </div>
        </div>
    );
}
