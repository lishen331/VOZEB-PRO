"use client";
import { Alert, Button, Space } from "antd";
import { useState } from "react";
import type { CreativeAgentRun } from "@/services/api/creative";

export function CreativeTaskAttention({ run, onControl }: { run: CreativeAgentRun; onControl?: (runId: string, action: "recheck" | "resume" | "cancel") => Promise<void> }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const needsReview = run.tasks.some((task) => task.status === "needs_review");
    if (run.status !== "paused" && !needsReview) return null;
    const act = async (action: "recheck" | "resume" | "cancel") => {
        if (!onControl || busy) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await onControl(run.id, action);
            if (action === "recheck") setNotice("已读取原任务最新状态；若仍待确认，请联系管理员核对上游记录，不要重复生成。");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "操作失败");
        } finally {
            setBusy(false);
        }
    };
    return (
        <section data-testid="creative-task-attention" className="my-3 space-y-2">
            <Alert
                type="warning"
                showIcon
                title={needsReview ? "部分上游任务结果待确认" : "任务已暂停"}
                description={needsReview ? "已完成的产物会保留，其他已提交任务继续同步。重新检查只读取或查询原任务；没有上游任务ID时不能安全追回，不会重新生成或自动退款。" : "进度已保存，可继续原任务。"}
            />
            <ul className="space-y-1 text-sm">
                {run.tasks.map((task) => (
                    <li key={task.id}>
                        {task.title} · {task.model} · {task.status === "completed" ? "已完成" : task.status === "needs_review" ? "待确认" : task.status === "failed" ? "失败" : task.status === "cancelled" ? "已取消" : "处理中"}
                        {task.error && task.status === "needs_review" ? `：${task.error}` : ""}
                    </li>
                ))}
            </ul>
            {error ? <Alert type="error" title={error} /> : null}
            {notice ? (
                <p role="status" className="text-sm">
                    {notice}
                </p>
            ) : null}
            {onControl ? (
                <Space>
                    <Button disabled={busy || run.status !== "paused" || Boolean(run.cancellation)} onClick={() => void act(needsReview ? "recheck" : "resume")}>
                        {needsReview ? "重新检查原任务" : "继续任务"}
                    </Button>
                    <Button disabled={busy} onClick={() => void act("cancel")}>
                        取消未完成任务
                    </Button>
                </Space>
            ) : null}
        </section>
    );
}
