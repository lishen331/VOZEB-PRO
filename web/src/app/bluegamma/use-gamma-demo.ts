"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { GammaTaskStatus } from "@/components/gamma-ui/gamma-cards";
import type { GammaComposerSubmit } from "@/components/gamma-ui/gamma-composer";
import type { GammaToastItem, GammaToastTone } from "@/components/gamma-ui/gamma-overlays";

/*
 * 布鲁伽马预览页的本地模拟状态：任务推进、积分扣减与失败退回、签到、提示。
 * 不请求任何接口，刷新即重置。
 */

export interface GammaDemoTask {
    /** 稳定的列表 key */
    key: number;
    /** 第几次提交（用于决定是否模拟失败） */
    attempt: number;
    title: string;
    meta: string;
    cost: number;
    cover: string;
    status: GammaTaskStatus;
    progress: number;
}

const TICK_MS = 300;
const TOAST_TTL_MS = 2800;
/** 每第 N 次提交模拟失败，用于展示失败态与退款；重试总会成功 */
const FAIL_EVERY = 4;
const INITIAL_POINTS = 2680;
const CHECK_IN_REWARD = 50;

export function useGammaDemo() {
    const [tasks, setTasks] = useState<GammaDemoTask[]>([]);
    const [points, setPoints] = useState(INITIAL_POINTS);
    const [toasts, setToasts] = useState<GammaToastItem[]>([]);
    const [checkedIn, setCheckedIn] = useState(false);
    const toastSeq = useRef(0);
    const taskSeq = useRef(0);
    const attemptSeq = useRef(0);
    const settled = useRef(new Set<string>());

    const toast = useCallback((tone: GammaToastTone, message: string) => {
        toastSeq.current += 1;
        const id = toastSeq.current;
        setToasts((list) => [...list.slice(-2), { id, tone, message }]);
        window.setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), TOAST_TTL_MS);
    }, []);

    const dismissToast = useCallback((id: number) => setToasts((list) => list.filter((item) => item.id !== id)), []);

    const hasRunning = tasks.some((task) => task.status === "running");

    useEffect(() => {
        if (!hasRunning) return;
        const timer = window.setInterval(() => {
            setTasks((list) =>
                list.map((task) => {
                    if (task.status !== "running") return task;
                    const progress = Math.min(100, task.progress + 6 + Math.round(Math.random() * 8));
                    if (progress < 100) return { ...task, progress };
                    return { ...task, progress: 100, status: task.attempt % FAIL_EVERY === 0 ? "failed" : "done" };
                }),
            );
        }, TICK_MS);
        return () => window.clearInterval(timer);
    }, [hasRunning]);

    // 每次提交落定后的副作用（提示、退款）只执行一次
    useEffect(() => {
        for (const task of tasks) {
            const settleKey = `${task.key}:${task.attempt}`;
            if (task.status === "running" || settled.current.has(settleKey)) continue;
            settled.current.add(settleKey);
            if (task.status === "failed") {
                setPoints((value) => value + task.cost);
                toast("error", `「${task.title}」生成失败，已退回 ${task.cost} 积分`);
            } else {
                toast("success", `「${task.title}」生成完成`);
            }
        }
    }, [tasks, toast]);

    const submit = useCallback(
        (payload: GammaComposerSubmit) => {
            taskSeq.current += 1;
            attemptSeq.current += 1;
            const task: GammaDemoTask = {
                key: taskSeq.current,
                attempt: attemptSeq.current,
                title: payload.prompt.slice(0, 24),
                meta: `${payload.subject.name} · ${payload.output} · ${payload.style} · ${payload.ratio} · ${payload.cost} 积分`,
                cost: payload.cost,
                cover: payload.subject.cover,
                status: "running",
                progress: 0,
            };
            setPoints((value) => value - payload.cost);
            setTasks((list) => [task, ...list]);
            toast("info", `已提交，消耗 ${payload.cost} 积分`);
        },
        [toast],
    );

    const retry = useCallback(
        (task: GammaDemoTask) => {
            if (points < task.cost) {
                toast("error", "积分不足，无法重试");
                return;
            }
            // 重试不计入失败序列，保证演示中重试一定成功
            const attempt = task.attempt + 0.5;
            setPoints((value) => value - task.cost);
            setTasks((list) => list.map((item) => (item.key === task.key ? { ...item, attempt, status: "running", progress: 0 } : item)));
            toast("info", "已重新提交");
        },
        [points, toast],
    );

    const checkIn = useCallback(() => {
        if (checkedIn) {
            toast("info", "今天已经签到过了");
            return;
        }
        setCheckedIn(true);
        setPoints((value) => value + CHECK_IN_REWARD);
        toast("success", `签到成功，积分 +${CHECK_IN_REWARD}`);
    }, [checkedIn, toast]);

    return { tasks, points, toasts, checkedIn, submit, retry, checkIn, toast, dismissToast };
}
