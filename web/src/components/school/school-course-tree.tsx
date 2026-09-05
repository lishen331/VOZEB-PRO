"use client";

import { App, Button, Collapse, Empty, Image, Input, Spin, Tag, Upload } from "antd";
import { ArrowDown, ArrowUp, Download, FileArchive, FileSpreadsheet, FileText, Pencil, Plus, Presentation, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { CourseMaterial, PlatformCourseDetail } from "@/lib/school-domain";
import { coursesApi } from "@/services/api/courses";

const ACCEPT = ".docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.mp4,.mov,.zip";

export function SchoolCourseTree({ assignmentId, canManage = false }: { assignmentId: string; canManage?: boolean }) {
    const { message, modal } = App.useApp();
    const [tree, setTree] = useState<PlatformCourseDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setTree(await coursesApi.getSchoolCourseTree(assignmentId));
        } catch (error) {
            setTree(null);
            message.error(errorMessage(error, "课程内容加载失败"));
        } finally {
            setLoading(false);
        }
    }, [assignmentId, message]);

    useEffect(() => void load(), [load]);

    const upload = async (file: File, target: { chapterId?: string; lessonId?: string }, count: number) => {
        setSaving(true);
        let attachment: Awaited<ReturnType<typeof coursesApi.uploadSchoolCourseAttachment>> | null = null;
        try {
            attachment = await coursesApi.uploadSchoolCourseAttachment(file);
            await coursesApi.createSchoolCourseMaterial(assignmentId, { ...target, title: file.name, storageKey: attachment.storageKey, sortOrder: count });
            message.success("本校补充资料已上传");
            await load();
        } catch (error) {
            if (attachment) await coursesApi.deleteSchoolCourseAttachment([attachment.storageKey]).catch(() => undefined);
            message.error(errorMessage(error, "资料上传失败"));
        } finally {
            setSaving(false);
        }
        return false;
    };

    const remove = (material: CourseMaterial) =>
        modal.confirm({
            title: `删除“${material.title}”`,
            content: "只删除本校补充资料，不影响平台标准资料。",
            okText: "确认删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            async onOk() {
                await coursesApi.deleteSchoolCourseMaterial(material.id);
                message.success("本校资料已删除");
                await load();
            },
        });

    const rename = (material: CourseMaterial) => {
        let title = material.title;
        modal.confirm({
            title: "重命名本校资料",
            content: <Input defaultValue={material.title} maxLength={260} onChange={(event) => (title = event.target.value)} />,
            okText: "保存",
            cancelText: "取消",
            async onOk() {
                await coursesApi.updateSchoolCourseMaterial(material.id, { title: title.trim() });
                await load();
            },
        });
    };

    const move = async (materials: CourseMaterial[], index: number, direction: -1 | 1) => {
        const target = materials[index + direction];
        const current = materials[index];
        if (!target || current.sourceScope !== "school" || target.sourceScope !== "school") return;
        setSaving(true);
        try {
            await Promise.all([coursesApi.updateSchoolCourseMaterial(current.id, { sortOrder: target.sortOrder }), coursesApi.updateSchoolCourseMaterial(target.id, { sortOrder: current.sortOrder })]);
            await load();
        } catch (error) {
            message.error(errorMessage(error, "资料排序失败"));
        } finally {
            setSaving(false);
        }
    };

    if (loading && !tree)
        return (
            <div className="flex min-h-40 items-center justify-center">
                <Spin />
            </div>
        );
    if (!tree) return <Empty description="课程内容不可用" />;

    return (
        <Spin spinning={saving}>
            <div className="space-y-4">
                <div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">{typeof tree.content.body === "string" ? tree.content.body : tree.summary || "暂无课程介绍"}</p>
                    <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">本校补充资料对所有使用此课程的班级可见</p>
                    <div className="mt-2 flex gap-3 text-xs text-zinc-500">
                        <span>{tree.chapterCount} 章</span>
                        <span>{tree.lessonCount} 课时</span>
                        <span>{tree.materialCount} 项资料</span>
                    </div>
                </div>
                <Collapse
                    bordered={false}
                    className="course-tree-collapse"
                    items={tree.chapters.map((chapter) => ({
                        key: chapter.id,
                        label: (
                            <div className="flex min-w-0 items-center justify-between gap-3">
                                <span className="truncate font-medium">{chapter.title}</span>
                                <span className="shrink-0 text-xs text-zinc-500">{chapter.lessons.length} 课时</span>
                            </div>
                        ),
                        children: (
                            <div className="space-y-5">
                                {chapter.description ? <p className="text-sm text-zinc-500">{chapter.description}</p> : null}
                                <MaterialSection title="章节资料" materials={chapter.materials} canManage={canManage} onUpload={(file) => upload(file, { chapterId: chapter.id }, chapter.materials.length)} onRemove={remove} onEdit={rename} onMove={move} />
                                <div className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                                    {chapter.lessons.map((lesson, index) => (
                                        <section key={lesson.id} className="py-4">
                                            <div className="flex items-start gap-3">
                                                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs font-medium dark:bg-zinc-900">{index + 1}</span>
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="text-sm font-medium">{lesson.title}</h4>
                                                    {lesson.description ? <p className="mt-1 text-xs leading-5 text-zinc-500">{lesson.description}</p> : null}
                                                    <div className="mt-3">
                                                        <MaterialSection
                                                            title="课时资料"
                                                            materials={lesson.materials}
                                                            canManage={canManage}
                                                            onUpload={(file) => upload(file, { lessonId: lesson.id }, lesson.materials.length)}
                                                            onRemove={remove}
                                                            onEdit={rename}
                                                            onMove={move}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </section>
                                    ))}
                                    {!chapter.lessons.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本章暂无课时" /> : null}
                                </div>
                            </div>
                        ),
                    }))}
                />
                {!tree.chapters.length ? <Empty description="课程暂未设置章节" /> : null}
            </div>
        </Spin>
    );
}

function MaterialSection({
    title,
    materials,
    canManage,
    onUpload,
    onRemove,
    onEdit,
    onMove,
}: {
    title: string;
    materials: CourseMaterial[];
    canManage: boolean;
    onUpload: (file: File) => boolean | Promise<boolean>;
    onRemove: (material: CourseMaterial) => void;
    onEdit: (material: CourseMaterial) => void;
    onMove: (materials: CourseMaterial[], index: number, direction: -1 | 1) => void;
}) {
    return (
        <section>
            <div className="flex items-center justify-between gap-2">
                <h5 className="text-xs font-medium text-zinc-500">{title}</h5>
                {canManage ? (
                    <Upload accept={ACCEPT} showUploadList={false} beforeUpload={onUpload}>
                        <Button size="small" icon={<Plus className="size-3.5" />}>
                            添加资料
                        </Button>
                    </Upload>
                ) : null}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {materials.map((material, index) => (
                    <MaterialItem
                        key={material.id}
                        material={material}
                        canEdit={canManage && material.sourceScope === "school"}
                        canMove={canManage && material.sourceScope === "school"}
                        canMoveUp={index > 0}
                        canMoveDown={index < materials.length - 1}
                        onEdit={() => onEdit(material)}
                        onMove={(direction) => onMove(materials, index, direction)}
                        onRemove={() => onRemove(material)}
                    />
                ))}
                {!materials.length ? <span className="text-xs text-zinc-400">暂无资料</span> : null}
            </div>
        </section>
    );
}

function MaterialItem({
    material,
    canEdit,
    canMove,
    canMoveUp,
    canMoveDown,
    onEdit,
    onMove,
    onRemove,
}: {
    material: CourseMaterial;
    canEdit: boolean;
    canMove: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onEdit: () => void;
    onMove: (direction: -1 | 1) => void;
    onRemove: () => void;
}) {
    const image = material.mimeType.startsWith("image/");
    const video = material.mimeType.startsWith("video/");
    return (
        <div className="min-w-0 rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800">
            {image ? <Image src={material.url} alt={material.title} className="mb-2 max-h-32 rounded object-contain" /> : null}
            {video ? <video src={material.url} controls preload="metadata" className="mb-2 max-h-40 w-full rounded" /> : null}
            <div className="flex items-start gap-2">
                <MaterialIcon mimeType={material.mimeType} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={material.title}>
                        {material.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Tag color={material.sourceScope === "platform" ? "blue" : "green"}>{material.sourceScope === "platform" ? "平台资料" : "本校补充资料"}</Tag>
                        <span className="text-xs text-zinc-500">{formatBytes(material.bytes)}</span>
                    </div>
                </div>
                <Button type="text" size="small" href={`${material.url}?download=original`} icon={<Download className="size-3.5" />} aria-label="下载资料" />
                {canEdit ? <Button type="text" size="small" icon={<Pencil className="size-3.5" />} aria-label="重命名本校资料" onClick={onEdit} /> : null}
                {canMove ? <Button type="text" size="small" disabled={!canMoveUp} icon={<ArrowUp className="size-3.5" />} aria-label="上移本校资料" onClick={() => onMove(-1)} /> : null}
                {canMove ? <Button type="text" size="small" disabled={!canMoveDown} icon={<ArrowDown className="size-3.5" />} aria-label="下移本校资料" onClick={() => onMove(1)} /> : null}
                {canEdit ? <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} aria-label="删除本校资料" onClick={onRemove} /> : null}
            </div>
        </div>
    );
}

function MaterialIcon({ mimeType }: { mimeType: string }) {
    if (mimeType.includes("presentation")) return <Presentation className="mt-0.5 size-4 shrink-0" />;
    if (mimeType.includes("spreadsheet")) return <FileSpreadsheet className="mt-0.5 size-4 shrink-0" />;
    if (mimeType === "application/zip") return <FileArchive className="mt-0.5 size-4 shrink-0" />;
    return <FileText className="mt-0.5 size-4 shrink-0" />;
}
function formatBytes(bytes: number) {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}
