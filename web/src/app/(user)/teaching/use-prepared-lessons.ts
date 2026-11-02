"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { TeachingLessonPlanSummary } from "@/lib/teaching-lesson-plan";
import { lessonPlansApi } from "@/services/api/lesson-plans";

/*
 * 老师的备课进度，来自后端教案表（换电脑、换浏览器都一致）：
 *   prepared  学校课程 id → 已标记「已备课」的课时 id
 *   drafted   学校课程 id → 写过教案但还没标记已备的课时 id
 * assignmentId 不传 = 全部课程（教学中心备课看板），传了只拉一门课（备课页）。
 */

type LessonMap = Record<string, readonly string[]>;

function group(items: readonly TeachingLessonPlanSummary[], status: TeachingLessonPlanSummary["status"]): LessonMap {
    return items.reduce<LessonMap>((map, item) => (item.status === status ? { ...map, [item.assignmentId]: [...(map[item.assignmentId] ?? []), item.lessonId] } : map), {});
}

export function usePreparedLessons(enabled: boolean, assignmentId?: string) {
    const [items, setItems] = useState<readonly TeachingLessonPlanSummary[]>([]);

    const refresh = useCallback(async () => {
        if (!enabled) return;
        try {
            setItems(await lessonPlansApi.list(assignmentId));
        } catch {
            // 非老师身份或网络失败：进度显示为空，不打断页面
            setItems([]);
        }
    }, [assignmentId, enabled]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const prepared = useMemo(() => group(items, "ready"), [items]);
    const drafted = useMemo(() => group(items, "draft"), [items]);
    return { prepared, drafted, refresh };
}
