"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * 老师的备课进度：哪些课时已经备过。后端还没有备课记录接口，先按账号存在本机 localStorage，
 * 换浏览器不同步；接口上线后只需替换这个 hook。
 */

type PreparedMap = Record<string, readonly string[]>;

const storageKey = (userId: string) => `vozeb:teaching-prepared:${userId}`;

function read(userId: string): PreparedMap {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === "string")));
    } catch {
        return {};
    }
}

export function usePreparedLessons(userId: string | undefined) {
    const [prepared, setPrepared] = useState<PreparedMap>({});

    useEffect(() => {
        setPrepared(userId ? read(userId) : {});
    }, [userId]);

    const toggle = useCallback(
        (courseId: string, lessonId: string, done: boolean) => {
            if (!userId) return;
            setPrepared((current) => {
                const list = current[courseId] ?? [];
                const nextList = done ? (list.includes(lessonId) ? list : [...list, lessonId]) : list.filter((id) => id !== lessonId);
                const next = { ...current, [courseId]: nextList };
                try {
                    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
                } catch {
                    // 隐私模式写不进去：只在当前页面生效
                }
                return next;
            });
        },
        [userId],
    );

    return { prepared, toggle };
}
