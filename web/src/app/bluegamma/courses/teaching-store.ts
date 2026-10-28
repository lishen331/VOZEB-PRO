"use client";

import { useSyncExternalStore } from "react";

import { TEACHING_ASSIGNMENTS, type TeachingAssignmentItem } from "@/app/bluegamma/courses/teaching-workflow-data";

/*
 * 教学中心的共享演示状态（备课 / 作业 / 学生提交三个标签共用）。
 *
 * 为什么不放在组件的 useState：课程页靠 URL 切标签（?v=assignments、?c=slug&l=key），
 * 每切一次整块组件会卸载重挂，局部 state 立刻丢——在备课页布置的作业，
 * 切到「作业」标签就找不到了，闭环就断了。
 * 这里用模块级 store + useSyncExternalStore：同一次会话里切标签、进出课程都保持，
 * 刷新回到初始演示数据（演示稿不需要真正持久化）。
 *
 * 注意：getSnapshot 必须返回引用稳定的值，所以 useTeachingStore 直接返回整个 state 对象
 * （只在 update 时换新引用），派生数据交给组件用 useMemo 算。不要在这里做 selector 缓存——
 * 调用方每次 render 都会传入新的箭头函数，按引用做 key 的缓存永远不命中。
 */

export type MaterialScope = "platform" | "school";

export interface LessonMaterial {
    id: string;
    name: string;
    /** 文件类型标签，如 PPTX / MP4 / PDF */
    meta: string;
    scope: MaterialScope;
    /** 平台自带资料不允许删改；本校资料可以 */
    removable: boolean;
    /** 下载时写入文件的内容；空则用默认占位文本 */
    content?: string;
}

export interface TeachingState {
    /** 已备课节：courseSlug -> lessonKey[] */
    prepared: Record<string, string[]>;
    /** 作业列表（新建的排最前） */
    assignments: TeachingAssignmentItem[];
    /** 本校补充资料：`${courseSlug}/${lessonKey}` -> 资料 */
    materials: Record<string, LessonMaterial[]>;
}

const INITIAL: TeachingState = {
    prepared: {},
    assignments: [...TEACHING_ASSIGNMENTS],
    materials: {},
};

let state: TeachingState = INITIAL;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot() {
    return state;
}

function update(next: Partial<TeachingState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
}

export function useTeachingStore(): TeachingState {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/* ---------- 备课 ---------- */

export function setPrepared(courseSlug: string, lessonKey: string, done: boolean) {
    const current = state.prepared[courseSlug] ?? [];
    const next = done ? (current.includes(lessonKey) ? current : [...current, lessonKey]) : current.filter((key) => key !== lessonKey);
    update({ prepared: { ...state.prepared, [courseSlug]: next } });
}

/* ---------- 作业 ---------- */

export function addAssignment(item: TeachingAssignmentItem) {
    update({ assignments: [item, ...state.assignments] });
}

export function setAssignmentStatus(id: string, status: TeachingAssignmentItem["status"]) {
    update({ assignments: state.assignments.map((item) => (item.id === id ? { ...item, status } : item)) });
}

/* ---------- 课时资料 ---------- */

export const materialsKey = (courseSlug: string, lessonKey: string) => `${courseSlug}/${lessonKey}`;

export function addLessonMaterial(courseSlug: string, lessonKey: string, material: LessonMaterial) {
    const key = materialsKey(courseSlug, lessonKey);
    update({ materials: { ...state.materials, [key]: [material, ...(state.materials[key] ?? [])] } });
}

export function removeLessonMaterial(courseSlug: string, lessonKey: string, id: string) {
    const key = materialsKey(courseSlug, lessonKey);
    update({ materials: { ...state.materials, [key]: (state.materials[key] ?? []).filter((item) => item.id !== id) } });
}

export function renameLessonMaterial(courseSlug: string, lessonKey: string, id: string, name: string) {
    const key = materialsKey(courseSlug, lessonKey);
    update({ materials: { ...state.materials, [key]: (state.materials[key] ?? []).map((item) => (item.id === id ? { ...item, name } : item)) } });
}

/** 触发下载：演示资料没有真实文件，用 Blob 落一份文本，保证按钮点下去确实有产物 */
export function downloadMaterial(material: LessonMaterial, courseTitle: string, lessonTitle: string) {
    const body = material.content ?? `${courseTitle} · ${lessonTitle}\n${material.name}\n${material.meta}\n\n（演示资料：真实环境下这里是上传的原始文件）`;
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${material.name.replace(/[\\/:*?"<>|]/g, "_")}.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
