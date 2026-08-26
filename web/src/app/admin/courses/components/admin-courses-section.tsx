"use client";

import type { TableColumnsType } from "antd";
import { App, Button, Form, Input, Modal, Pagination, Select, Table, Tag, Upload } from "antd";
import { Archive, BookOpen, FileText, Film, Image as ImageIcon, Paperclip, Pencil, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CourseAttachment, PlatformCourse, PlatformCourseInput, PlatformCourseStatus, SchoolSummary } from "@/lib/school-domain";
import { adminEducationApi } from "@/services/api/admin-education";
import { coursesApi } from "@/services/api/courses";

const PAGE_SIZE = 12;

type CourseOutlineItem = { kind: "chapter" | "lesson"; title: string; description?: string };
type CourseForm = {
    title: string;
    summary?: string;
    body?: string;
    outline?: CourseOutlineItem[];
};

export const COURSE_ATTACHMENT_ACCEPT = ".docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.mp4,.mov,.zip";
const COURSE_ATTACHMENT_EXTENSIONS = new Set(COURSE_ATTACHMENT_ACCEPT.split(","));

export function AdminCoursesSection() {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<CourseForm>();
    const [items, setItems] = useState<PlatformCourse[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [queryKeyword, setQueryKeyword] = useState("");
    const [status, setStatus] = useState<PlatformCourseStatus>();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<PlatformCourse | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [savedAttachments, setSavedAttachments] = useState<CourseAttachment[]>([]);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [uploadingFileName, setUploadingFileName] = useState("");
    const [removedAttachmentKeys, setRemovedAttachmentKeys] = useState<string[]>([]);
    const [assigning, setAssigning] = useState<PlatformCourse | null>(null);
    const [schools, setSchools] = useState<SchoolSummary[]>([]);
    const [schoolIds, setSchoolIds] = useState<string[]>([]);
    const schoolRequestSequence = useRef(0);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await coursesApi.listPlatformCourses({ page, pageSize: PAGE_SIZE, keyword: queryKeyword || undefined, status });
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            setItems([]);
            setTotal(0);
            message.error(errorMessage(error, "课程列表加载失败"));
        } finally {
            setLoading(false);
        }
    }, [message, page, queryKeyword, status]);

    useEffect(() => void load(), [load]);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ outline: [] });
        setSavedAttachments([]);
        setPendingFiles([]);
        setRemovedAttachmentKeys([]);
        setEditorOpen(true);
    };

    const openEdit = (course: PlatformCourse) => {
        setEditing(course);
        form.resetFields();
        form.setFieldsValue({
            title: course.title,
            summary: course.summary,
            body: textField(course.content, "body"),
            outline: outlineItems(course.chapters),
        });
        setSavedAttachments(attachmentItems(course.attachments));
        setPendingFiles([]);
        setRemovedAttachmentKeys([]);
        setEditorOpen(true);
    };

    const closeEditor = () => {
        if (saving) return;
        setEditorOpen(false);
        setPendingFiles([]);
        setRemovedAttachmentKeys([]);
        form.resetFields();
    };

    const save = async (values: CourseForm) => {
        setSaving(true);
        const uploadedKeys: string[] = [];
        let committed = false;
        try {
            const uploaded = [] as CourseAttachment[];
            for (const file of pendingFiles) {
                setUploadingFileName(file.name);
                const attachment = await coursesApi.uploadPlatformCourseAttachment(file);
                uploaded.push(attachment);
                uploadedKeys.push(attachment.storageKey);
            }
            const input: PlatformCourseInput = {
                title: values.title.trim(),
                summary: values.summary?.trim() || "",
                content: { body: values.body?.trim() || "" },
                chapters: (values.outline || []).map((item) => ({ kind: item.kind, title: item.title.trim(), description: item.description?.trim() || "" })),
                attachments: [...savedAttachments, ...uploaded],
            };
            if (editing) await coursesApi.updatePlatformCourse(editing.id, input);
            else await coursesApi.createPlatformCourse(input);
            committed = true;
            if (editing && removedAttachmentKeys.length) {
                await coursesApi.deletePlatformCourseAttachments(removedAttachmentKeys).catch(() => message.warning("课程已保存，已移除附件的存储清理稍后可在媒体管理中处理"));
            }
            message.success(editing ? "课程已更新" : "课程草稿已创建");
            setEditorOpen(false);
            setEditing(null);
            setSavedAttachments([]);
            setPendingFiles([]);
            setRemovedAttachmentKeys([]);
            form.resetFields();
            await load();
        } catch (error) {
            if (!committed && uploadedKeys.length) await coursesApi.deletePlatformCourseAttachments(uploadedKeys).catch(() => undefined);
            message.error(errorMessage(error, "课程保存失败"));
            throw error;
        } finally {
            setUploadingFileName("");
            setSaving(false);
        }
    };

    const updateStatus = (course: PlatformCourse, next: "published" | "disabled") => {
        modal.confirm({
            title: next === "published" ? `发布“${course.title}”` : `停用“${course.title}”`,
            content: next === "published" ? "发布后可分配给学校。" : "停用后学校不能创建新的课程安排。",
            okText: next === "published" ? "确认发布" : "确认停用",
            cancelText: "取消",
            async onOk() {
                await coursesApi.updatePlatformCourse(course.id, { status: next });
                message.success(next === "published" ? "课程已发布" : "课程已停用");
                await load();
            },
        });
    };

    const searchSchools = async (keyword: string) => {
        const requestId = ++schoolRequestSequence.current;
        const result = await adminEducationApi.listSchools({ page: 1, pageSize: PAGE_SIZE, status: "active", keyword: keyword.trim() || undefined });
        if (requestId !== schoolRequestSequence.current) return;
        setSchools((current) => [...new Map([...current.filter((school) => schoolIds.includes(school.id)), ...result.items].map((school) => [school.id, school])).values()]);
    };

    const openAssign = async (course: PlatformCourse) => {
        setLoading(true);
        try {
            setSchoolIds([]);
            setSchools([]);
            await searchSchools("");
            setAssigning(course);
        } catch (error) {
            message.error(errorMessage(error, "学校列表加载失败"));
        } finally {
            setLoading(false);
        }
    };

    const assign = async () => {
        if (!assigning || !schoolIds.length) return;
        setSaving(true);
        try {
            await coursesApi.assignCourseToSchools(assigning.id, schoolIds);
            message.success(`已分配给 ${schoolIds.length} 所学校`);
            setAssigning(null);
            setSchoolIds([]);
        } catch (error) {
            message.error(errorMessage(error, "课程分配失败"));
        } finally {
            setSaving(false);
        }
    };

    const actions = (course: PlatformCourse) => (
        <div className="flex flex-wrap justify-end gap-1">
            <Button type="text" size="small" icon={<Pencil className="size-3.5" />} onClick={() => openEdit(course)}>
                编辑
            </Button>
            {course.status === "draft" ? (
                <Button type="text" size="small" icon={<Send className="size-3.5" />} onClick={() => updateStatus(course, "published")}>
                    发布
                </Button>
            ) : (
                <Button type="text" size="small" danger onClick={() => updateStatus(course, "disabled")}>
                    停用
                </Button>
            )}
            {course.status === "published" ? (
                <Button type="text" size="small" icon={<BookOpen className="size-3.5" />} onClick={() => void openAssign(course)}>
                    分配学校
                </Button>
            ) : null}
        </div>
    );

    const columns: TableColumnsType<PlatformCourse> = [
        {
            title: "课程",
            render: (_, course) => (
                <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-950 dark:text-zinc-100">{course.title}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">{course.summary || "暂无摘要"}</div>
                </div>
            ),
        },
        { title: "章节/课时", width: 110, render: (_, course) => course.chapters.length },
        { title: "附件", width: 80, render: (_, course) => course.attachments.length },
        { title: "状态", dataIndex: "status", width: 100, render: (value: PlatformCourseStatus) => <CourseStatusTag status={value} /> },
        { title: "更新时间", dataIndex: "updatedAt", width: 168, render: (value: string) => <span className="text-xs text-zinc-500">{formatTime(value)}</span> },
        { title: "操作", width: 280, align: "right", render: (_, course) => actions(course) },
    ];

    return (
        <section className="space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_112px] gap-2 sm:max-w-2xl">
                    <Input.Search
                        value={keyword}
                        allowClear
                        placeholder="搜索课程标题或摘要"
                        onChange={(event) => setKeyword(event.target.value)}
                        onSearch={(value) => {
                            setQueryKeyword(value.trim());
                            setPage(1);
                        }}
                    />
                    <Select
                        allowClear
                        value={status}
                        placeholder="状态"
                        options={[...courseStatusOptions]}
                        onChange={(value) => {
                            setStatus(value);
                            setPage(1);
                        }}
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <Button icon={<RefreshCw className="size-4" />} aria-label="刷新课程列表" loading={loading} onClick={() => void load()} />
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={openCreate}>
                        创建课程
                    </Button>
                </div>
            </div>

            <div className="hidden md:block">
                <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={false} scroll={{ x: 980 }} />
            </div>
            <div className="space-y-2 md:hidden" aria-busy={loading}>
                {items.map((course) => (
                    <article key={course.id} className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="truncate text-sm font-medium">{course.title}</h2>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{course.summary || "暂无摘要"}</p>
                            </div>
                            <CourseStatusTag status={course.status} />
                        </div>
                        <div className="mt-2 flex gap-3 text-xs text-zinc-500">
                            <span>{course.chapters.length} 个章节/课时</span>
                            <span>{course.attachments.length} 个附件</span>
                        </div>
                        <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">{actions(course)}</div>
                    </article>
                ))}
                {!loading && !items.length ? <EmptyText text="暂无平台课程" /> : null}
            </div>
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />

            <Modal
                title={editing ? "编辑课程" : "创建课程"}
                open={editorOpen}
                destroyOnHidden
                width="min(920px, calc(100vw - 24px))"
                centered
                okText="保存"
                cancelText="取消"
                confirmLoading={saving}
                onOk={() => form.submit()}
                onCancel={closeEditor}
                styles={{ body: { maxHeight: "min(70vh, 760px)", overflowY: "auto", paddingRight: 4 } }}
            >
                <Form form={form} layout="vertical" requiredMark={false} preserve={false} onFinish={(values) => void save(values)}>
                    <Form.Item label="课程标题" name="title" rules={[{ required: true, message: "请填写课程标题" }]}>
                        <Input maxLength={160} />
                    </Form.Item>
                    <Form.Item label="课程摘要" name="summary">
                        <Input.TextArea rows={2} maxLength={500} showCount />
                    </Form.Item>
                    <Form.Item label="平台课程正文" name="body">
                        <Input.TextArea rows={5} maxLength={12000} showCount />
                    </Form.Item>
                    <Form.List name="outline">
                        {(fields, { add, remove }) => (
                            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <h3 className="text-sm font-medium">章节与课时</h3>
                                    <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => add({ kind: "lesson", title: "" })}>
                                        添加
                                    </Button>
                                </div>
                                <div className="space-y-3">
                                    {fields.map((field) => (
                                        <div key={field.key} className="grid grid-cols-[112px_minmax(0,1fr)_32px] gap-2">
                                            <Form.Item name={[field.name, "kind"]} className="mb-0" rules={[{ required: true }]}>
                                                <Select options={[...outlineKindOptions]} />
                                            </Form.Item>
                                            <Form.Item name={[field.name, "title"]} className="mb-0" rules={[{ required: true, message: "请填写名称" }]}>
                                                <Input placeholder="章节或课时名称" maxLength={160} />
                                            </Form.Item>
                                            <Button danger type="text" icon={<Trash2 className="size-4" />} aria-label="删除章节或课时" onClick={() => remove(field.name)} />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </Form.List>
                    <section className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-medium">平台附件</h3>
                                <p className="mt-1 text-xs text-zinc-500">支持 Word、PPT、Excel、图片、视频和 ZIP，可一次选择多个本地文件。</p>
                            </div>
                            <Upload
                                multiple
                                accept={COURSE_ATTACHMENT_ACCEPT}
                                showUploadList={false}
                                beforeUpload={(file) => {
                                    if (!isAcceptedCourseAttachment(file.name)) {
                                        message.error("该文件格式不在课程附件支持范围内");
                                        return Upload.LIST_IGNORE;
                                    }
                                    setPendingFiles((current) => (current.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) ? current : [...current, file]));
                                    return false;
                                }}
                            >
                                <Button size="small" icon={<Plus className="size-3.5" />}>
                                    添加附件
                                </Button>
                            </Upload>
                        </div>
                        <div className="space-y-2">
                            {savedAttachments.map((attachment) => (
                                <AttachmentRow
                                    key={attachment.storageKey}
                                    name={attachment.fileName}
                                    meta={`${attachment.mimeType} · ${formatBytes(attachment.bytes)}`}
                                    href={`${attachment.url}?download=original`}
                                    onRemove={() => {
                                        setSavedAttachments((current) => current.filter((item) => item.storageKey !== attachment.storageKey));
                                        setRemovedAttachmentKeys((current) => [...current, attachment.storageKey]);
                                    }}
                                />
                            ))}
                            {pendingFiles.map((file) => (
                                <AttachmentRow
                                    key={`${file.name}-${file.lastModified}-${file.size}`}
                                    name={file.name}
                                    meta={`${file.type || "按扩展名识别"} · ${formatBytes(file.size)}`}
                                    onRemove={() => setPendingFiles((current) => current.filter((item) => item !== file))}
                                />
                            ))}
                            {!savedAttachments.length && !pendingFiles.length ? <div className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-700">尚未添加课程附件</div> : null}
                            {uploadingFileName ? (
                                <div className="text-xs text-blue-600 dark:text-blue-400" role="status">
                                    正在上传：{uploadingFileName}
                                </div>
                            ) : null}
                        </div>
                    </section>
                </Form>
            </Modal>

            <Modal
                title={`分配学校${assigning ? ` · ${assigning.title}` : ""}`}
                open={Boolean(assigning)}
                destroyOnHidden
                width="min(620px, calc(100vw - 24px))"
                okText="确认分配"
                cancelText="取消"
                confirmLoading={saving}
                okButtonProps={{ disabled: !schoolIds.length }}
                onOk={() => void assign()}
                onCancel={() => setAssigning(null)}
            >
                <Select
                    mode="multiple"
                    maxTagCount="responsive"
                    optionFilterProp="label"
                    showSearch
                    filterOption={false}
                    className="w-full"
                    placeholder="搜索并选择学校"
                    value={schoolIds}
                    options={schools.map((school) => ({ value: school.id, label: school.name }))}
                    onChange={setSchoolIds}
                    onSearch={(value) => void searchSchools(value)}
                />
            </Modal>
        </section>
    );
}

const courseStatusOptions = [
    { value: "draft", label: "草稿" },
    { value: "published", label: "已发布" },
    { value: "disabled", label: "已停用" },
] as const;

const outlineKindOptions = [
    { value: "chapter", label: "章节" },
    { value: "lesson", label: "课时" },
] as const;

function CourseStatusTag({ status }: { status: PlatformCourseStatus }) {
    if (status === "published") return <Tag color="green">已发布</Tag>;
    if (status === "disabled") return <Tag>已停用</Tag>;
    return <Tag color="gold">草稿</Tag>;
}

function outlineItems(value: unknown[]): CourseOutlineItem[] {
    return value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const source = item as Record<string, unknown>;
        if (typeof source.title !== "string") return [];
        return [{ kind: source.kind === "chapter" ? "chapter" : "lesson", title: source.title, description: typeof source.description === "string" ? source.description : "" } as CourseOutlineItem];
    });
}

function attachmentItems(value: unknown[]): CourseAttachment[] {
    return value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const source = item as Record<string, unknown>;
        if (typeof source.url !== "string" || typeof source.storageKey !== "string" || typeof source.fileName !== "string" || typeof source.mimeType !== "string" || !Number.isSafeInteger(source.bytes)) return [];
        return [
            {
                title: typeof source.title === "string" ? source.title : source.fileName,
                url: source.url,
                storageKey: source.storageKey,
                fileName: source.fileName,
                mimeType: source.mimeType,
                bytes: Number(source.bytes),
            },
        ];
    });
}

function AttachmentRow({ name, meta, href, onRemove }: { name: string; meta: string; href?: string; onRemove: () => void }) {
    const content = (
        <>
            <AttachmentIcon name={name} />
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" title={name}>
                    {name}
                </div>
                <div className="truncate text-xs text-zinc-500">{meta}</div>
            </div>
        </>
    );
    return (
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            {href ? (
                <a className="flex min-w-0 flex-1 items-center gap-2 text-inherit hover:text-blue-600" href={href} download>
                    {content}
                </a>
            ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2">{content}</div>
            )}
            <Button type="text" size="small" icon={<X className="size-4" />} aria-label={`移除附件 ${name}`} onClick={onRemove} />
        </div>
    );
}

function AttachmentIcon({ name }: { name: string }) {
    const extension = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
    if (extension === ".zip") return <Archive className="size-4 shrink-0 text-amber-600" />;
    if (extension === ".mp4" || extension === ".mov") return <Film className="size-4 shrink-0 text-blue-600" />;
    if (extension === ".png" || extension === ".jpg" || extension === ".jpeg" || extension === ".webp") return <ImageIcon className="size-4 shrink-0 text-emerald-600" />;
    if (extension === ".docx" || extension === ".pptx" || extension === ".xlsx") return <FileText className="size-4 shrink-0 text-indigo-600" />;
    return <Paperclip className="size-4 shrink-0 text-zinc-500" />;
}

function isAcceptedCourseAttachment(name: string) {
    const extension = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
    return COURSE_ATTACHMENT_EXTENSIONS.has(extension);
}

function formatBytes(value: number) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function textField(value: Record<string, unknown>, key: string) {
    return typeof value[key] === "string" ? value[key] : "";
}

function EmptyText({ text }: { text: string }) {
    return <div className="py-10 text-center text-sm text-zinc-500">{text}</div>;
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function formatTime(value: string) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? "-" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(time);
}
