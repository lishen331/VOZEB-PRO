"use client";

import { useState } from "react";
import { ClipboardCheck, Plus, Send } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBadge, GammaInput } from "@/components/gamma-ui/gamma-controls";
import { GammaModal } from "@/components/gamma-ui/gamma-overlays";
import { TEACH_CLASSES } from "@/app/bluegamma/courses/teach-data";
import { TEACHING_ASSIGNMENTS, type AssignmentStatus, type TeachingAssignmentItem } from "@/app/bluegamma/courses/teaching-workflow-data";

const STATUS_TONE: Record<AssignmentStatus, { label: string; tone: "warning" | "blue" | "neutral" }> = {
    draft: { label: "草稿", tone: "warning" },
    published: { label: "进行中", tone: "blue" },
    closed: { label: "已关闭", tone: "neutral" },
};

/**
 * 作业：对照线上 /teaching?tab=assignments —— 列表 + 创建弹窗 + 发布/关闭状态切换，
 * 「学生提交」按钮带上 assignmentId 跳到提交标签并预选该作业。
 */
export function TeachingAssignmentsTab({ presetClass, onOpenSubmissions }: { presetClass?: string; onOpenSubmissions: (assignmentId: string) => void }) {
    const [items, setItems] = useState<TeachingAssignmentItem[]>([...TEACHING_ASSIGNMENTS]);
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState("");
    const [instructions, setInstructions] = useState("");
    const [className, setClassName] = useState(presetClass ?? TEACH_CLASSES[0].name);

    const openCreate = () => {
        setTitle("");
        setInstructions("");
        setClassName(presetClass ?? TEACH_CLASSES[0].name);
        setCreating(true);
    };

    const handleCreate = () => {
        if (!title.trim()) return;
        const course = TEACH_CLASSES.find((item) => item.name === className)?.course;
        const next: TeachingAssignmentItem = {
            id: `a-${Date.now()}`,
            title: title.trim(),
            instructions: instructions.trim() || "暂无说明",
            kind: "lesson",
            status: "draft",
            courseTitle: course?.title ?? "未命名课程",
            className,
            submittedCount: 0,
            totalStudents: TEACH_CLASSES.find((item) => item.name === className)?.students.length ?? 0,
        };
        setItems((list) => [next, ...list]);
        setCreating(false);
    };

    const updateStatus = (id: string, status: AssignmentStatus) => setItems((list) => list.map((item) => (item.id === id ? { ...item, status } : item)));

    return (
        <div className="flex flex-col gap-3">
            <div className="flex justify-end">
                <GammaButton icon={<Plus className="size-4" />} onClick={openCreate}>
                    创建作业
                </GammaButton>
            </div>
            <div className="flex flex-col divide-y divide-[var(--gm-border)]">
                {items.map((assignment) => {
                    const status = STATUS_TONE[assignment.status];
                    return (
                        <div key={assignment.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="truncate text-sm font-medium text-[var(--gm-text)]">{assignment.title}</h3>
                                    <GammaBadge tone={status.tone}>{status.label}</GammaBadge>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--gm-text-3)]">{assignment.instructions}</p>
                                <p className="mt-1 text-xs text-[var(--gm-text-3)]">
                                    {assignment.courseTitle} · {assignment.className} · 已交 {assignment.submittedCount}/{assignment.totalStudents}
                                </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                                <GammaButton size="sm" variant="ghost" icon={<ClipboardCheck className="size-3.5" />} onClick={() => onOpenSubmissions(assignment.id)}>
                                    学生提交
                                </GammaButton>
                                {assignment.status === "draft" ? (
                                    <GammaButton size="sm" icon={<Send className="size-3.5" />} onClick={() => updateStatus(assignment.id, "published")}>
                                        发布
                                    </GammaButton>
                                ) : null}
                                {assignment.status === "published" ? (
                                    <GammaButton size="sm" variant="outline" onClick={() => updateStatus(assignment.id, "closed")}>
                                        关闭
                                    </GammaButton>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>

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
                    <label className="flex flex-col gap-1.5 text-sm">
                        作业标题
                        <GammaInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第 4 课随堂练习" />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                        班级
                        <select
                            value={className}
                            onChange={(event) => setClassName(event.target.value)}
                            className="h-9 rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] px-3 text-sm ring-1 ring-[var(--gm-border)]"
                        >
                            {TEACH_CLASSES.map((item) => (
                                <option key={item.id} value={item.name}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                        说明（可选）
                        <textarea
                            value={instructions}
                            onChange={(event) => setInstructions(event.target.value)}
                            rows={3}
                            placeholder="给学生的作业要求"
                            className="rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] p-3 text-sm ring-1 ring-[var(--gm-border)] outline-none focus:ring-[var(--gm-accent)]"
                        />
                    </label>
                </div>
            </GammaModal>
        </div>
    );
}
