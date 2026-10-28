"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, RotateCcw } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { GammaModal } from "@/components/gamma-ui/gamma-overlays";
import { useTeachingStore } from "@/app/bluegamma/courses/teaching-store";
import { TEACHING_SUBMISSIONS, type SubmissionStatus, type TeachingSubmissionItem } from "@/app/bluegamma/courses/teaching-workflow-data";

const STATUS_TONE: Record<SubmissionStatus, { label: string; tone: "blue" | "success" | "warning" }> = {
    submitted: { label: "待批改", tone: "blue" },
    reviewed: { label: "已批改", tone: "success" },
    revision_required: { label: "待修改", tone: "warning" },
};

/**
 * 学生提交：对照线上 /teaching?tab=submissions —— 选作业 → 看提交列表 → 批改（通过/退回）。
 * 退回修改要求必填反馈，和线上 Form rules 一致。
 */
export function TeachingSubmissionsTab({ presetAssignmentId, onBackToAssignments }: { presetAssignmentId?: string; onBackToAssignments: () => void }) {
    const state = useTeachingStore();
    const assignments = state.assignments;
    const [assignmentId, setAssignmentId] = useState(presetAssignmentId ?? assignments[0]?.id ?? "");
    const [submissions, setSubmissions] = useState<TeachingSubmissionItem[]>([...TEACHING_SUBMISSIONS]);
    const [reviewing, setReviewing] = useState<{ submission: TeachingSubmissionItem; status: "reviewed" | "revision_required" } | null>(null);
    const [feedback, setFeedback] = useState("");

    const assignment = assignments.find((item) => item.id === assignmentId);
    const visible = submissions.filter((item) => item.assignmentId === assignmentId);
    const canReview = assignment?.status === "published";

    const openReview = (submission: TeachingSubmissionItem, status: "reviewed" | "revision_required") => {
        setFeedback(submission.feedback ?? "");
        setReviewing({ submission, status });
    };

    const submitReview = () => {
        if (!reviewing) return;
        if (reviewing.status === "revision_required" && !feedback.trim()) return;
        setSubmissions((list) => list.map((item) => (item.id === reviewing.submission.id ? { ...item, status: reviewing.status, feedback: feedback.trim() || item.feedback } : item)));
        setReviewing(null);
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <GammaButton size="sm" variant="ghost" icon={<ArrowLeft className="size-3.5" />} onClick={onBackToAssignments}>
                    返回作业列表
                </GammaButton>
                <select
                    value={assignmentId}
                    onChange={(event) => setAssignmentId(event.target.value)}
                    className="h-9 w-full max-w-md rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] px-3 text-sm text-[var(--gm-text)] ring-1 ring-[var(--gm-border)] sm:w-auto"
                >
                    {assignments.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.title}
                        </option>
                    ))}
                </select>
                {assignment ? (
                    <span className="text-xs text-[var(--gm-text-3)]">
                        {assignment.className} · 已交 {assignment.submittedCount}/{assignment.totalStudents} · {assignment.status === "published" ? "进行中" : assignment.status === "draft" ? "草稿（未发布不能批改）" : "已关闭"}
                    </span>
                ) : null}
            </div>

            <div className="flex flex-col divide-y divide-[var(--gm-border)]">
                {visible.map((submission) => {
                    const status = STATUS_TONE[submission.status];
                    return (
                        <article key={submission.id} className="py-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-medium text-[var(--gm-text)]">{submission.studentName}</p>
                                    <p className="mt-0.5 text-xs text-[var(--gm-text-3)]">
                                        ID：{submission.accountId} · {submission.submittedAt}
                                    </p>
                                </div>
                                <GammaBadge tone={status.tone}>{status.label}</GammaBadge>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--gm-text-2)]">{submission.note || "未填写说明"}</p>
                            <p className="mt-1 text-xs text-[var(--gm-text-3)]">成果引用 {submission.referenceCount} 项</p>
                            {submission.feedback ? <p className="mt-2 rounded-[var(--gm-radius)] bg-[var(--gm-wash)] px-3 py-2 text-sm text-[var(--gm-text-2)]">{submission.feedback}</p> : null}
                            {canReview && submission.status === "submitted" ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <GammaButton size="sm" icon={<CheckCircle2 className="size-3.5" />} onClick={() => openReview(submission, "reviewed")}>
                                        批改通过
                                    </GammaButton>
                                    <GammaButton size="sm" variant="outline" icon={<RotateCcw className="size-3.5" />} onClick={() => openReview(submission, "revision_required")}>
                                        退回修改
                                    </GammaButton>
                                </div>
                            ) : null}
                        </article>
                    );
                })}
                {!visible.length ? <p className="py-10 text-center text-sm text-[var(--gm-text-3)]">暂无学生提交</p> : null}
            </div>

            <GammaModal
                open={Boolean(reviewing)}
                title={reviewing?.status === "reviewed" ? "批改通过" : "退回修改"}
                onClose={() => setReviewing(null)}
                footer={
                    <>
                        <GammaButton variant="ghost" onClick={() => setReviewing(null)}>
                            取消
                        </GammaButton>
                        <GammaButton disabled={reviewing?.status === "revision_required" && !feedback.trim()} onClick={submitReview}>
                            确认
                        </GammaButton>
                    </>
                }
            >
                <label className="flex flex-col gap-1.5 text-sm">
                    反馈{reviewing?.status === "revision_required" ? "（退回修改时必填）" : "（可选）"}
                    <textarea
                        value={feedback}
                        onChange={(event) => setFeedback(event.target.value)}
                        rows={4}
                        maxLength={2000}
                        className="rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] p-3 text-sm ring-1 ring-[var(--gm-border)] outline-none focus:ring-[var(--gm-accent)]"
                    />
                </label>
            </GammaModal>
        </div>
    );
}
