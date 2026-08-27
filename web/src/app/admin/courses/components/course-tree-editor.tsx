"use client";

import { App, Button, Empty, Form, Input, Modal, Spin, Tag, Upload } from "antd";
import { BookOpen, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CourseChapter, CourseLesson, CourseMaterial, PlatformCourse, PlatformCourseDetail } from "@/lib/school-domain";
import { coursesApi } from "@/services/api/courses";
const COURSE_ATTACHMENT_ACCEPT = ".docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.mp4,.mov,.zip";

type SelectedNode = { kind: "chapter"; value: CourseChapter } | { kind: "lesson"; value: CourseLesson };

export function CourseTreeEditor({ course, open, onClose, onChanged }: { course: PlatformCourse | null; open: boolean; onClose: () => void; onChanged: () => void }) {
    const { message, modal } = App.useApp();
    const [tree, setTree] = useState<PlatformCourseDetail | null>(null);
    const [selectedId, setSelectedId] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [nodeForm] = Form.useForm<{ title: string; description?: string }>();

    const load = useCallback(async () => {
        if (!course || !open) return;
        setLoading(true);
        try {
            const result = await coursesApi.getPlatformCourseTree(course.id);
            setTree(result);
            setSelectedId((current) => current || result.chapters[0]?.id || "");
        } catch (error) {
            message.error(errorMessage(error, "课程结构加载失败"));
        } finally {
            setLoading(false);
        }
    }, [course, message, open]);

    useEffect(() => void load(), [load]);
    useEffect(() => {
        if (!open) {
            setTree(null);
            setSelectedId("");
        }
    }, [open]);

    const selected = useMemo<SelectedNode | null>(() => {
        for (const chapter of tree?.chapters || []) {
            if (chapter.id === selectedId) return { kind: "chapter", value: chapter };
            const lesson = chapter.lessons.find((item) => item.id === selectedId);
            if (lesson) return { kind: "lesson", value: lesson };
        }
        return null;
    }, [selectedId, tree]);

    const openNodeEditor = (kind: "chapter" | "lesson", current?: CourseChapter | CourseLesson, chapterId?: string) => {
        nodeForm.setFieldsValue({ title: current?.title || "", description: current?.description || "" });
        modal.confirm({
            title: current ? `编辑${kind === "chapter" ? "章节" : "课时"}` : `新建${kind === "chapter" ? "章节" : "课时"}`,
            width: "min(560px, calc(100vw - 24px))",
            content: (
                <Form form={nodeForm} layout="vertical" className="mt-4">
                    <Form.Item label="名称" name="title" rules={[{ required: true, message: "请填写名称" }]}>
                        <Input maxLength={160} />
                    </Form.Item>
                    <Form.Item label="说明" name="description">
                        <Input.TextArea rows={3} maxLength={2000} />
                    </Form.Item>
                </Form>
            ),
            okText: "保存",
            cancelText: "取消",
            async onOk() {
                const values = await nodeForm.validateFields();
                if (!course) return;
                if (kind === "chapter") {
                    if (current) await coursesApi.updatePlatformCourseChapter(current.id, values);
                    else await coursesApi.createPlatformCourseChapter(course.id, { ...values, description: values.description || "", sortOrder: tree?.chapters.length || 0 });
                } else {
                    if (current) await coursesApi.updatePlatformCourseLesson(current.id, values);
                    else if (chapterId) await coursesApi.createPlatformCourseLesson(chapterId, { ...values, description: values.description || "", sortOrder: tree?.chapters.find((item) => item.id === chapterId)?.lessons.length || 0 });
                }
                message.success("课程结构已保存");
                await load();
                onChanged();
            },
        });
    };

    const removeNode = (node: SelectedNode) => {
        modal.confirm({
            title: `删除“${node.value.title}”`,
            content: node.kind === "chapter" ? "该章节下的课时和资料将一并删除。" : "该课时下的资料将一并删除。",
            okText: "确认删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            async onOk() {
                if (node.kind === "chapter") await coursesApi.deletePlatformCourseChapter(node.value.id);
                else await coursesApi.deletePlatformCourseLesson(node.value.id);
                setSelectedId("");
                await load();
                onChanged();
            },
        });
    };

    const uploadMaterial = async (file: File) => {
        if (!course || !selected) return false;
        setSaving(true);
        let attachment: Awaited<ReturnType<typeof coursesApi.uploadPlatformCourseAttachment>> | null = null;
        try {
            attachment = await coursesApi.uploadPlatformCourseAttachment(file);
            await coursesApi.createPlatformCourseMaterial(course.id, {
                ...(selected.kind === "chapter" ? { chapterId: selected.value.id } : { lessonId: selected.value.id }),
                title: file.name,
                storageKey: attachment.storageKey,
                sortOrder: selected.value.materials.length,
            });
            message.success("平台资料已上传");
            await load();
            onChanged();
        } catch (error) {
            if (attachment) await coursesApi.deletePlatformCourseAttachments([attachment.storageKey]).catch(() => undefined);
            message.error(errorMessage(error, "课程资料上传失败"));
        } finally {
            setSaving(false);
        }
        return false;
    };

    const removeMaterial = (material: CourseMaterial) => {
        modal.confirm({
            title: `删除“${material.title}”`,
            content: "资料记录将被删除，未被其他业务引用的文件会同步清理。",
            okText: "确认删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            async onOk() {
                await coursesApi.deletePlatformCourseMaterial(material.id);
                await load();
                onChanged();
            },
        });
    };

    return (
        <Modal title={course ? `${course.title} · 课程结构` : "课程结构"} open={open} footer={null} width="min(1080px, calc(100vw - 24px))" centered destroyOnHidden onCancel={onClose}>
            <Spin spinning={loading || saving}>
                <div className="grid min-h-[520px] gap-4 border-t border-zinc-200 pt-4 md:grid-cols-[minmax(230px,0.34fr)_minmax(0,1fr)] dark:border-zinc-800">
                    <aside className="border-b border-zinc-200 pb-4 md:border-r md:border-b-0 md:pr-4 dark:border-zinc-800">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h3 className="text-sm font-medium">章节与课时</h3>
                            <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => openNodeEditor("chapter")}>
                                章节
                            </Button>
                        </div>
                        <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
                            {(tree?.chapters || []).map((chapter) => (
                                <div key={chapter.id}>
                                    <button type="button" className={nodeClass(selectedId === chapter.id)} onClick={() => setSelectedId(chapter.id)}>
                                        <BookOpen className="size-4 shrink-0" />
                                        <span className="truncate">{chapter.title}</span>
                                    </button>
                                    <div className="ml-5 mt-1 space-y-1 border-l border-zinc-200 pl-2 dark:border-zinc-800">
                                        {chapter.lessons.map((lesson) => (
                                            <button key={lesson.id} type="button" className={nodeClass(selectedId === lesson.id)} onClick={() => setSelectedId(lesson.id)}>
                                                <FileText className="size-3.5 shrink-0" />
                                                <span className="truncate">{lesson.title}</span>
                                            </button>
                                        ))}
                                        <Button type="text" size="small" icon={<Plus className="size-3.5" />} onClick={() => openNodeEditor("lesson", undefined, chapter.id)}>
                                            添加课时
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {!tree?.chapters.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先创建章节" /> : null}
                        </div>
                    </aside>
                    <section className="min-w-0">
                        {selected ? (
                            <>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <Tag>{selected.kind === "chapter" ? "章节" : "课时"}</Tag>
                                        <h3 className="mt-2 text-base font-medium">{selected.value.title}</h3>
                                        <p className="mt-1 text-sm text-zinc-500">{selected.value.description || "暂无说明"}</p>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button icon={<Pencil className="size-4" />} onClick={() => openNodeEditor(selected.kind, selected.value)}>
                                            编辑
                                        </Button>
                                        <Button danger icon={<Trash2 className="size-4" />} onClick={() => removeNode(selected)}>
                                            删除
                                        </Button>
                                    </div>
                                </div>
                                <div className="mt-5 flex items-center justify-between gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                                    <h4 className="text-sm font-medium">平台资料</h4>
                                    <Upload accept={COURSE_ATTACHMENT_ACCEPT} showUploadList={false} beforeUpload={uploadMaterial}>
                                        <Button icon={<Plus className="size-4" />}>上传资料</Button>
                                    </Upload>
                                </div>
                                <div className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {selected.value.materials.map((material) => (
                                        <div key={material.id} className="flex items-center justify-between gap-3 py-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium">{material.title}</div>
                                                <div className="mt-1 text-xs text-zinc-500">
                                                    {material.fileName} · {formatBytes(material.bytes)}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 gap-1">
                                                <Button size="small" href={`${material.url}?download=original`}>
                                                    下载
                                                </Button>
                                                <Button size="small" danger icon={<Trash2 className="size-3.5" />} aria-label="删除资料" onClick={() => removeMaterial(material)} />
                                            </div>
                                        </div>
                                    ))}
                                    {!selected.value.materials.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前节点暂无资料" /> : null}
                                </div>
                            </>
                        ) : (
                            <Empty description="请选择章节或课时" />
                        )}
                    </section>
                </div>
            </Spin>
        </Modal>
    );
}

function nodeClass(active: boolean) {
    return `flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${active ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"}`;
}
function formatBytes(bytes: number) {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}
