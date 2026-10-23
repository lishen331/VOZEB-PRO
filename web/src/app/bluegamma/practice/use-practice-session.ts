"use client";

import { useRef, useState } from "react";

import type { PracticeModuleKind } from "@/app/bluegamma/practice/practice-modules";

export type PracticeSessionStatus = "queued" | "running" | "done" | "failed";

export interface PracticeSessionRecord {
    id: string;
    module: PracticeModuleKind;
    title: string;
    prompt: string;
    referenceUrl?: string;
    status: PracticeSessionStatus;
    progress: number;
    cover?: string;
    createdAt: string;
    /** 失败时的原因文案，贴合真实产品「失败会退回积分」的规则 */
    failedReason?: string;
}

const RUN_MS = 1800;
/** 模拟失败率：每 3 次有 1 次失败，方便验收失败态与重试 */
const FAIL_EVERY = 3;

/**
 * 练习会话状态机（本地模拟，不调接口）。
 * 字段形状贴合线上 PracticeSession（见 services/api/practice.ts），
 * 行为对照线上 practice-module-workbench.tsx：提交 → 排队 → 生成中 → 完成/失败 → 可重试/可删除。
 */
export function usePracticeSession(module: PracticeModuleKind, demoCovers: readonly string[]) {
    const [sessions, setSessions] = useState<PracticeSessionRecord[]>([]);
    const [currentId, setCurrentId] = useState<string | null>(null);
    const seq = useRef(0);
    const attempts = useRef(0);
    const timers = useRef<number[]>([]);

    const current = sessions.find((item) => item.id === currentId);

    const clearTimers = () => {
        timers.current.forEach((timer) => window.clearTimeout(timer));
        timers.current = [];
    };

    const submit = (prompt: string, referenceUrl?: string) => {
        seq.current += 1;
        attempts.current += 1;
        const id = `session-${module}-${seq.current}`;
        const willFail = attempts.current % FAIL_EVERY === 0;
        const record: PracticeSessionRecord = { id, module, title: prompt.slice(0, 24) || "未命名练习", prompt, referenceUrl, status: "queued", progress: 0, createdAt: "刚刚" };
        setSessions((list) => [record, ...list]);
        setCurrentId(id);

        timers.current.push(
            window.setTimeout(() => setSessions((list) => list.map((item) => (item.id === id ? { ...item, status: "running", progress: 10 } : item))), 300),
            window.setTimeout(() => setSessions((list) => list.map((item) => (item.id === id ? { ...item, progress: 55 } : item))), 900),
            window.setTimeout(() => {
                setSessions((list) =>
                    list.map((item) =>
                        item.id !== id ? item : willFail ? { ...item, status: "failed", progress: 0, failedReason: "生成超时，积分已自动退回" } : { ...item, status: "done", progress: 100, cover: demoCovers[seq.current % demoCovers.length] },
                    ),
                );
            }, RUN_MS),
        );
    };

    const retry = (session: PracticeSessionRecord) => submit(session.prompt, session.referenceUrl);

    const remove = (session: PracticeSessionRecord) => {
        setSessions((list) => list.filter((item) => item.id !== session.id));
        if (currentId === session.id) setCurrentId(null);
    };

    const reset = () => {
        clearTimers();
        setCurrentId(null);
    };

    const open = (session: PracticeSessionRecord) => setCurrentId(session.id);

    return { sessions, current, submit, retry, remove, reset, open };
}
