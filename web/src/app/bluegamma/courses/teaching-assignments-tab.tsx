"use client";

import { useState } from "react";
import { BookOpen, ClipboardCheck, Plus, Send } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBadge, GammaInput } from "@/components/gamma-ui/gamma-controls";
import { GammaEmptyState, GammaModal } from "@/components/gamma-ui/gamma-overlays";
import { TEACH_CLASSES } from "@/app/bluegamma/courses/teach-data";
import { addAssignment, setAssignmentStatus, useTeachingStore } from "@/app/bluegamma/courses/teaching-store";
import type { AssignmentStatus } from "@/app/bluegamma/courses/teaching-workflow-data";

const STATUS_TONE: Record<AssignmentStatus, { label: string; tone: "warning" | "blue" | "neutral" }> = {
    draft: { label: "草稿", tone: "warning" },
    published: { label: "进行中", tone: "blue" },
    closed: { label: "已关闭", tone: "neutral" },
};

const FILTERS = [
    { key: "all", label: "全部" },
    { key: "draft", label: "草稿" },
    { key: "published", label: "进行中" },
    { key: "closed", label: "已关闭" },
] as const;

/**
 * 作业：对照线上 /teaching?tab=assignments —— 列表 + 创建弹窗 + 发布/关闭状态切换。
 * 数据来自共享 store，所以备课页「布置作业」建的草稿会立刻出现在这里；
 * 每行都能「回到课时」跳回对应的备课页，「学生提交」带 assignmentId 跳到提交标签并预选。
 */
export function TeachingAssignmentsTab({ presetClass, onOpenSubmissions, onOpenLesson }: { presetClass?: string; onOpenSubmissions: (assignmentId: string) => void; onOpenLesson: (courseSlug: string, lessonKey: string) => void }) {
    const state = useTeachingStore();
    const [title, setTitle] = useState("");
    const [instructions, setInstructions] = useState("");
    const [courseSlug, setCourseSlug] = useState(TEACH_CLASSES[0]?.course.slug ?? "");
    const [dueDate, setDueDate] = useState("");
    const [statusFilter, setStatusFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
    // 从「我的班级」点「布置作业」跳过来时带 class 参数：直接把创建弹窗打开、班级预选好，
    // 否则用户跳到作业列表还要再点一次「创建作业」，闭环多一步。
    const [creating, setCreating] = useState(Boolean(presetClass));
    const [className, setClassName] = useState(presetClass ?? TEACH_CLASSES[0]?.name ?? "");

    const visible = statusFilter === "all" ? state.assignments : state.assignments.filter((item) => item.status === statusFilter);

    const openCreate = () => {
        setTitle("");
        setInstructions("");
        setClassName(presetClass ?? TEACH_CLASSES[0]?.name ?? "");
        setCourseSlug(TEACH_CLASSES[0]?.course.slug ?? "");
        setDueDate("");
        setCreating(true);
    };

    const handleCreate = () => {
        if (!title.trim()) return;
        const group = TEACH_CLASSES.find((item) => item.name === className);
        addAssignment({
            id: `a-${Date.now()}`,
            title: title.trim(),
            instructions: instructions.trim() || "暂无说明",
            kind: "lesson",
            status: "draft",
            courseTitle: group?.course.title ?? "未命名课程",
            className,
            submittedCount: 0,
            totalStudents: group?.students.length ?? 0,
            courseSlug,
            dueDate: dueDate || undefined,
        });
        setCreating(false);
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="group" aria-label="按状态筛选" className="flex rounded-full bg-[var(--gm-wash)] p-1 ring-1 ring-[var(--gm-border)]">
                    {FILTERS.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            aria-pressed={statusFilter === item.key}
                            onClick={() => setStatusFilter(item.key)}
                            className={
                                statusFilter === item.key
                                    ? "h-8 rounded-full bg-[var(--gm-bg-elevated)] px-4 text-[13px] font-medium text-[var(--gm-text)] shadow-sm ring-1 ring-[var(--gm-border-strong)]"
                                    : "h-8 rounded-full px-4 text-[13px] text-[var(--gm-text-2)] hover:text-[var(--gm-text)]"
                            }
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <GammaButton icon={<Plus className="size-4" />} onClick={openCreate}>
                    创建作业
                </GammaButton>
            </div>

            {visible.length ? (
                <div className="flex flex-col divide-y divide-[var(--gm-border)]">
                    {visible.map((assignment) => {
                        const status = STATUS_TONE[assignment.status];
                        return (
                            <div key={assignment.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="truncate text-sm font-medium text-[var(--gm-text)]">{assignment.title}</h3>
                                        <GammaBadge tone={status.tone}>{status.label}</GammaBadge>
                                        {assignment.dueDate ? <span className="text-xs text-[var(--gm-text-3)]">截止 {assignment.dueDate}</span> : null}
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--gm-text-3)]">{assignment.instructions}</p>
                                    <p className="mt-1 text-xs text-[var(--gm-text-3)]">
                                        {assignment.courseTitle} · {assignment.className} · 已交 {assignment.submittedCount}/{assignment.totalStudents}
                                    </p>
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2">
                                    {assignment.courseSlug ? (
                                        <GammaButton size="sm" variant="ghost" icon={<BookOpen className="size-3.5" />} onClick={() => onOpenLesson(assignment.courseSlug!, assignment.lessonKey ?? "")}>
                                            回到课时
                                        </GammaButton>
                                    ) : null}
                                    <GammaButton size="sm" variant="ghost" icon={<ClipboardCheck className="size-3.5" />} onClick={() => onOpenSubmissions(assignment.id)}>
                                        学生提交
                                    </GammaButton>
                                    {assignment.status === "draft" ? (
                                        <GammaButton size="sm" icon={<Send className="size-3.5" />} onClick={() => setAssignmentStatus(assignment.id, "published")}>
                                            发布
                                        </GammaButton>
                                    ) : null}
                                    {assignment.status === "published" ? (
                                        <GammaButton size="sm" variant="outline" onClick={() => setAssignmentStatus(assignment.id, "closed")}>
                                            关闭
                                        </GammaButton>
                                    ) : null}
                                    {assignment.status === "closed" ? (
                                        <GammaButton size="sm" variant="ghost" onClick={() => setAssignmentStatus(assignment.id, "published")}>
                                            重新开启
                                        </GammaButton>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <GammaEmptyState icon={<ClipboardCheck />} title="没有符合条件的作业" description="换个状态筛选，或点右上角「创建作业」" />
            )}

            <GammaModal
                open={creating}
                title="创建作业"
                onClose={() => setCreating(false)}
                footer={
                    <>
                        <GammaButton variant="ghost" onClick={() => setCreating(false)}>
                            取消
                        </GammaButton>
                        <GammaButton disabled={!title.trim()} onClick={handleCreate}>
                            创建（草稿）
                        </GammaButton>
                    </>
                }
            >
                <div className="flex flex-col gap-3">
                    <GammaInput label="作业标题" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第 4 课随堂练习" />
                    <label className="flex flex-col gap-1.5 text-sm text-[var(--gm-text-2)]">
                        班级
                        <select
                            value={className}
                            onChange={(event) => {
                                setClassName(event.target.value);
                                const group = TEACH_CLASSES.find((item) => item.name === event.target.value);
                                if (group) setCourseSlug(group.course.slug);
                            }}
                            className="h-9 rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] px-3 text-sm text-[var(--gm-text)] ring-1 ring-[var(--gm-border)]"
                        >
                            {TEACH_CLASSES.map((item) => (
                                <option key={item.id} value={item.name}>
                                    {item.name}（{item.course.title}）
                                </option>
                            ))}
                        </select>
                    </label>
                    <GammaInput label="截止日期" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                    <label className="flex flex-col gap-1.5 text-sm text-[var(--gm-text-2)]">
                        说明（可选）
                        <textarea
                            value={instructions}
                            onChange={(event) => setInstructions(event.target.value)}
                            rows={3}
                            placeholder="给学生的作业要求"
                            className="rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] p-3 text-sm text-[var(--gm-text)] ring-1 ring-[var(--gm-border)] outline-none focus:ring-[var(--gm-accent)]"
                        />
                    </label>
                </div>
            </GammaModal>
        </div>
    );
}
