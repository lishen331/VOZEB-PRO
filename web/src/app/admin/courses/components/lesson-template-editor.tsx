"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Modal } from "@/components/gamma-ui/gamma-ant-modal";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Spin } from "@/components/gamma-ui/gamma-ant";
import type { CourseLesson } from "@/lib/school-domain";
import { emptyLessonPlanContent, LESSON_PLAN_LIMITS, type LessonPlanContent } from "@/lib/teaching-lesson-plan";
import { coursesApi } from "@/services/api/courses";
import { PhaseEditor } from "@/app/(user)/teaching/courses/[assignmentId]/prep-plan-phases";

/*
 * 课时的「标准教案」编辑（课程方写，老师在备课页只读参考）。
 * 结构与老师教案一致：目标 · 重点 · 难点 · 课前准备 · 教学环节 · 课后作业；没有反思，环节不绑定资料。
 * 全部清空后保存 = 删除标准教案。
 */

const TEXT_AREA = { autoSize: { minRows: 2, maxRows: 8 }, maxLength: LESSON_PLAN_LIMITS.textLength } as const;

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <div>
                <h4 className="text-xs font-medium text-[var(--gm-text-2)]">{title}</h4>
                {hint ? <p className="mt-0.5 text-[11px] text-[var(--gm-text-3)]">{hint}</p> : null}
            </div>
            {children}
        </section>
    );
}

function Objectives({ value, onChange }: { value: readonly string[]; onChange: (next: string[]) => void }) {
    return (
        <ol className="flex flex-col gap-1.5">
            {value.map((objective, index) => (
                <li key={index} className="flex items-start gap-2">
                    <span className="mt-2 w-4 shrink-0 text-right text-[11px] text-[var(--gm-text-3)] tabular-nums">{index + 1}.</span>
                    <Input.TextArea
                        aria-label={`标准教案教学目标 ${index + 1}`}
                        value={objective}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        maxLength={LESSON_PLAN_LIMITS.objectiveLength}
                        onChange={(event) => onChange(value.map((item, i) => (i === index ? event.target.value : item)))}
                    />
                    <button
                        type="button"
                        aria-label={`删除教学目标 ${index + 1}`}
                        onClick={() => onChange(value.filter((_, i) => i !== index))}
                        className="mt-1 grid size-7 shrink-0 place-items-center rounded-full text-[var(--gm-text-3)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-danger)]"
                    >
                        <X className="size-3.5" />
                    </button>
                </li>
            ))}
            {value.length < LESSON_PLAN_LIMITS.objectives ? (
                <li>
                    <button type="button" onClick={() => onChange([...value, ""])} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs text-[var(--gm-accent)] hover:bg-[var(--gm-accent-soft)]">
                        <Plus className="size-3.5" />
                        添加目标
                    </button>
                </li>
            ) : null}
        </ol>
    );
}

export function LessonTemplateEditor({ lesson, onClose }: { lesson: CourseLesson | null; onClose: () => void }) {
    const { message } = App.useApp();
    const [content, setContent] = useState<LessonPlanContent | null>(null);
    const [saving, setSaving] = useState(false);
    const lessonId = lesson?.id ?? "";

    useEffect(() => {
        if (!lessonId) return;
        let cancelled = false;
        setContent(null);
        coursesApi
            .getPlatformLessonTemplate(lessonId)
            .then((template) => {
                if (!cancelled) setContent(template?.content ?? emptyLessonPlanContent());
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                message.error(error instanceof Error && error.message ? error.message : "标准教案加载失败");
                onClose();
            });
        return () => {
            cancelled = true;
        };
    }, [lessonId, message, onClose]);

    const set = <K extends keyof LessonPlanContent>(key: K, value: LessonPlanContent[K]) => setContent((current) => (current ? { ...current, [key]: value } : current));

    const save = async () => {
        if (!content || !lessonId) return;
        setSaving(true);
        try {
            const saved = await coursesApi.savePlatformLessonTemplate(lessonId, content);
            message.success(saved ? "标准教案已保存" : "标准教案已清空");
            onClose();
        } catch (error) {
            message.error(error instanceof Error && error.message ? error.message : "标准教案保存失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title={lesson ? `标准教案 · ${lesson.title}` : "标准教案"}
            open={Boolean(lesson)}
            width="min(760px, calc(100vw - 24px))"
            centered
            destroyOnHidden
            okText="保存"
            cancelText="取消"
            confirmLoading={saving}
            okButtonProps={{ disabled: !content }}
            onOk={() => void save()}
            onCancel={onClose}
        >
            <Spin spinning={!content}>
                <p className="mb-4 text-xs text-[var(--gm-text-3)]">老师备课时在「教案」标签顶部看到这份标准教案（只读），用来对照写自己的教案。全部清空后保存即删除。</p>
                {content ? (
                    <div className="gm-scroll flex max-h-[64vh] flex-col gap-5 overflow-y-auto pr-1">
                        <Section title="教学目标" hint="写 2–4 条，学完能检验的结果">
                            <Objectives value={content.objectives} onChange={(next) => set("objectives", next)} />
                        </Section>
                        <Section title="教学重点">
                            <Input.TextArea aria-label="标准教案教学重点" value={content.keyPoints} onChange={(event) => set("keyPoints", event.target.value)} {...TEXT_AREA} />
                        </Section>
                        <Section title="教学难点">
                            <Input.TextArea aria-label="标准教案教学难点" value={content.difficulties} onChange={(event) => set("difficulties", event.target.value)} {...TEXT_AREA} />
                        </Section>
                        <Section title="课前准备">
                            <Input.TextArea aria-label="标准教案课前准备" value={content.preparation} onChange={(event) => set("preparation", event.target.value)} {...TEXT_AREA} />
                        </Section>
                        <Section title="教学环节" hint="按上课顺序排；资料由老师在自己的教案里选">
                            <PhaseEditor phases={content.phases} onChange={(next) => set("phases", next)} />
                        </Section>
                        <Section title="课后作业">
                            <Input.TextArea aria-label="标准教案课后作业" value={content.homework} onChange={(event) => set("homework", event.target.value)} {...TEXT_AREA} />
                        </Section>
                    </div>
                ) : (
                    <div className="h-40" />
                )}
            </Spin>
        </Modal>
    );
}
