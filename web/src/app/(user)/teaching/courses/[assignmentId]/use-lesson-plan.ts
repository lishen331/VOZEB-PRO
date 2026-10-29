"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { lessonPlanMissingItems, starterLessonPlan, type LessonPlanContent, type LessonPlanRehearsal, type LessonPlanStatus } from "@/lib/teaching-lesson-plan";
import { LessonPlanApiError, lessonPlansApi } from "@/services/api/lesson-plans";
import type { PrepLesson } from "@/app/(user)/teaching/teaching-routes";

/*
 * 一节课的教案编辑状态：载入 → 编辑 → 停手 1.5 秒自动保存 → 切课时 / 离开页面时把没存的发出去。
 * 还没写过教案时给起步模板（isStarter），老师第一次修改后才存成自己的教案。
 * 保存带版本号：每节课最新的 updatedAt 记在 versions 里，排队的保存总用最新版本，
 * 另一个标签页改过时返回 409，进入 conflict，由老师选择载入最新版本。
 */

export type PlanDoc = {
    lessonId: string;
    content: LessonPlanContent;
    status: LessonPlanStatus;
    lastRehearsal: LessonPlanRehearsal | null;
    rehearsalCount: number;
    isStarter: boolean;
};

export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
export type PlanLoad = { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready" };
export type RehearsalInput = { totalSeconds: number; phases: { phaseId: string; seconds: number }[] };

const AUTOSAVE_DELAY_MS = 1500;

function errorText(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

export function useLessonPlan(assignmentId: string, lesson: PrepLesson | null, onProgressChanged: () => void) {
    const [doc, setDoc] = useState<PlanDoc | null>(null);
    const [load, setLoad] = useState<PlanLoad>({ phase: "loading" });
    const [dirty, setDirty] = useState(false);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [saveError, setSaveError] = useState("");
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    // 防抖回调和卸载补存要读最新值，所以文档、脏标记、版本各留一份 ref
    const docRef = useRef<PlanDoc | null>(null);
    const dirtyRef = useRef(false);
    const versions = useRef<Record<string, string | null>>({});
    const serverStatus = useRef<Record<string, LessonPlanStatus | null>>({});
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const progressRef = useRef(onProgressChanged);
    progressRef.current = onProgressChanged;

    const commit = useCallback((next: PlanDoc | null) => {
        docRef.current = next;
        setDoc(next);
    }, []);
    const markDirty = useCallback((value: boolean) => {
        dirtyRef.current = value;
        setDirty(value);
    }, []);

    /** 存当前文档（内容在调用时取快照，版本在真正发请求时取最新）；保存串行执行 */
    const save = useCallback(
        (nextStatus?: LessonPlanStatus, options: { keepalive?: boolean } = {}) => {
            const snapshot = docRef.current;
            if (!snapshot) return Promise.resolve(null);
            const status = nextStatus ?? snapshot.status;
            markDirty(false);
            setSaveState("saving");
            const run = async () => {
                try {
                    const saved = await lessonPlansApi.save(assignmentId, snapshot.lessonId, { content: snapshot.content, status, baseUpdatedAt: versions.current[snapshot.lessonId] ?? null }, options);
                    versions.current[snapshot.lessonId] = saved.updatedAt;
                    // 进度（大纲、「已备课」按钮）跟服务端状态走：和上一次服务端状态比，而不是和本地快照比，
                    // 否则本地先退回草稿再保存时，服务端 ready→draft 的变化不会刷新进度
                    const statusChanged = serverStatus.current[snapshot.lessonId] !== saved.status;
                    serverStatus.current[snapshot.lessonId] = saved.status;
                    const latest = docRef.current;
                    if (latest?.lessonId === snapshot.lessonId) {
                        // 请求途中老师把内容改到缺必填项时，update() 已退回草稿；不能让服务端的 ready 盖回去，
                        // 否则下一次自动保存带着 ready 被拒、无限重试
                        const status = saved.status === "ready" && lessonPlanMissingItems(latest.content).length ? "draft" : saved.status;
                        commit({ ...latest, status, isStarter: false });
                        setSaveState("saved");
                        setSavedAt(saved.updatedAt);
                    }
                    if (snapshot.isStarter || statusChanged) progressRef.current();
                    return saved;
                } catch (error) {
                    if (docRef.current?.lessonId === snapshot.lessonId) {
                        markDirty(true);
                        setSaveState(error instanceof LessonPlanApiError && error.status === 409 ? "conflict" : "error");
                        setSaveError(errorText(error, "教案保存失败"));
                    }
                    throw error;
                }
            };
            const pending = queue.current.catch(() => undefined).then(run);
            queue.current = pending;
            return pending;
        },
        [assignmentId, commit, markDirty],
    );
    const lessonId = lesson?.id ?? "";
    const lessonRef = useRef(lesson);
    lessonRef.current = lesson;
    const conflictRef = useRef(false);
    conflictRef.current = saveState === "conflict";

    // 载入：每换一节课（或冲突后重新载入）读一次；先等排队的保存完成，避免读到旧内容。
    // 离开这节课时（cleanup）把没存的修改用 keepalive 发出去。
    useEffect(() => {
        if (!lessonId) return;
        const controller = new AbortController();
        commit(null);
        markDirty(false);
        setLoad({ phase: "loading" });
        setSaveState("idle");
        setSavedAt(null);
        queue.current
            .catch(() => undefined)
            .then(() => lessonPlansApi.get(assignmentId, lessonId, { signal: controller.signal }))
            .then((plan) => {
                if (controller.signal.aborted) return;
                const current = lessonRef.current;
                versions.current[lessonId] = plan?.updatedAt ?? null;
                serverStatus.current[lessonId] = plan?.status ?? null;
                commit({
                    lessonId,
                    content: plan
                        ? plan.content
                        : starterLessonPlan(
                              { title: current?.title ?? "", description: current?.description },
                              current?.materials.map((item) => item.id),
                          ),
                    status: plan?.status ?? "draft",
                    lastRehearsal: plan?.lastRehearsal ?? null,
                    rehearsalCount: plan?.rehearsalCount ?? 0,
                    isStarter: !plan,
                });
                setSavedAt(plan?.updatedAt ?? null);
                setLoad({ phase: "ready" });
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) setLoad({ phase: "error", message: errorText(error, "教案加载失败") });
            });
        return () => {
            controller.abort();
            if (dirtyRef.current && !conflictRef.current) void save(undefined, { keepalive: true }).catch(() => undefined);
        };
    }, [assignmentId, lessonId, reloadKey, commit, markDirty, save]);

    // 停手 1.5 秒自动保存；冲突时不自动覆盖，失败后不自动重试（等老师再改一笔或点「重试」）
    useEffect(() => {
        if (!dirty || saveState === "conflict" || saveState === "error") return;
        const timer = window.setTimeout(() => void save().catch(() => undefined), AUTOSAVE_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [doc, dirty, saveState, save]);

    // 关标签页 / 刷新：有没存的修改就补发一次
    useEffect(() => {
        const flush = () => {
            if (dirtyRef.current && !conflictRef.current) void save(undefined, { keepalive: true }).catch(() => undefined);
        };
        window.addEventListener("pagehide", flush);
        return () => window.removeEventListener("pagehide", flush);
    }, [save]);

    /** 改教案内容；已备课的教案改到缺必填项时自动退回草稿，避免保存被拒 */
    const update = useCallback(
        (recipe: (content: LessonPlanContent) => LessonPlanContent) => {
            const current = docRef.current;
            if (!current) return;
            const content = recipe(current.content);
            const status = current.status === "ready" && lessonPlanMissingItems(content).length ? "draft" : current.status;
            commit({ ...current, content, status });
            markDirty(true);
            setSaveState((state) => (state === "error" ? "idle" : state));
        },
        [commit, markDirty],
    );

    /** 标记已备课 / 取消；缺必填项时不提交，返回缺的内容 */
    const setReady = useCallback(
        async (ready: boolean): Promise<string[]> => {
            const current = docRef.current;
            if (!current) return [];
            const missing = ready ? lessonPlanMissingItems(current.content) : [];
            if (missing.length) return missing;
            await save(ready ? "ready" : "draft");
            return [];
        },
        [save],
    );

    /** 记一次试讲：教案没存过（起步模板或有修改）先存，再记录 */
    const recordRehearsal = useCallback(
        async (input: RehearsalInput) => {
            const current = docRef.current;
            if (!current) return null;
            if (current.isStarter || dirtyRef.current) await save();
            const plan = await lessonPlansApi.recordRehearsal(assignmentId, current.lessonId, input);
            const latest = docRef.current;
            if (latest?.lessonId === current.lessonId) commit({ ...latest, lastRehearsal: plan.lastRehearsal, rehearsalCount: plan.rehearsalCount });
            return plan;
        },
        [assignmentId, commit, save],
    );

    /** 冲突后放弃本页修改，载入服务器上的最新版本 */
    const reload = useCallback(() => {
        markDirty(false);
        conflictRef.current = false;
        setReloadKey((key) => key + 1);
    }, [markDirty]);

    /** 冲突后坚持用本页内容：以服务器当前版本为基准再存一次 */
    const overwrite = useCallback(async () => {
        const current = docRef.current;
        if (!current) return;
        const latest = await lessonPlansApi.get(assignmentId, current.lessonId);
        versions.current[current.lessonId] = latest?.updatedAt ?? null;
        await save();
    }, [assignmentId, save]);

    return { doc, load, dirty, saveState, saveError, savedAt, update, save, setReady, recordRehearsal, reload, overwrite };
}
