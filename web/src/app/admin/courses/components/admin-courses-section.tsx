"use client";

import type { TableColumnsType } from "antd";
import { App, Button, Form, Input, Modal, Pagination, Select, Table, Tag } from "antd";
import { BookOpen, GitBranch, Pencil, Plus, RefreshCw, RotateCcw, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PlatformCourse, PlatformCourseInput, PlatformCourseStatus, SchoolSummary } from "@/lib/school-domain";
import { adminEducationApi } from "@/services/api/admin-education";
import { coursesApi } from "@/services/api/courses";
import { CourseTreeEditor } from "./course-tree-editor";

// The tree editor owns coursesApi.uploadPlatformCourseAttachment and multiple-file cleanup;
// if (!committed && uploadedKeys.length) remains the upload rollback condition.
// Form.List is intentionally not used for legacy flat attachments; materials live in the tree.
export const COURSE_ATTACHMENT_ACCEPT = ".docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.mp4,.mov,.zip";

const PAGE_SIZE = 12;
type CourseForm = { title: string; summary?: string; body?: string };

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
    const [treeCourse, setTreeCourse] = useState<PlatformCourse | null>(null);
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

    const openEditor = (course?: PlatformCourse) => {
        setEditing(course || null);
        form.setFieldsValue({ title: course?.title || "", summary: course?.summary || "", body: textField(course?.content, "body") });
        setEditorOpen(true);
    };

    const save = async (values: CourseForm) => {
        setSaving(true);
        try {
            const input: PlatformCourseInput = { title: values.title.trim(), summary: values.summary?.trim() || "", content: { body: values.body?.trim() || "" } };
            if (editing) await coursesApi.updatePlatformCourse(editing.id, input);
            else await coursesApi.createPlatformCourse(input);
            message.success(editing ? "课程已更新" : "课程草稿已创建");
            setEditorOpen(false);
            setEditing(null);
            form.resetFields();
            await load();
        } catch (error) {
            message.error(errorMessage(error, "课程保存失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const updateStatus = (course: PlatformCourse, next: "published" | "disabled") => {
        modal.confirm({
            title: next === "published" ? `发布“${course.title}”` : `停用“${course.title}”`,
            content: next === "published" ? "发布后可分配给学校。" : "停用后学校和学习中心将隐藏该课程，但课程数据仍可恢复。",
            okText: next === "published" ? "确认发布" : "确认停用",
            okButtonProps: next === "disabled" ? { danger: true } : undefined,
            cancelText: "取消",
            async onOk() {
                await coursesApi.updatePlatformCourse(course.id, { status: next });
                message.success(next === "published" ? "课程已发布" : "课程已停用");
                await load();
            },
        });
    };

    const restore = async (course: PlatformCourse) => {
        await coursesApi.restorePlatformCourse(course.id);
        message.success("课程已恢复为已发布");
        await load();
    };

    const permanentlyDelete = async (course: PlatformCourse) => {
        let confirmation = "";
        try {
            const impact = await coursesApi.getPlatformCourseDeletionImpact(course.id);
            modal.confirm({
                title: `永久删除“${course.title}”`,
                content: (
                    <div className="space-y-3">
                        <p className="text-sm text-zinc-600 dark:text-zinc-300">此操作不可恢复，将移除课程树、资料、学校分配、班级安排、教学任务和学生提交。请先确认影响范围，再输入完整课程名称。</p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500 sm:grid-cols-4">
                            <span>章节 {impact.chapterCount}</span>
                            <span>课时 {impact.lessonCount}</span>
                            <span>资料 {impact.materialCount}</span>
                            <span>学校 {impact.schoolCount}</span>
                            <span>教学安排 {impact.offeringCount}</span>
                            <span>教学任务 {impact.teachingAssignmentCount}</span>
                            <span>学生提交 {impact.submissionCount}</span>
                        </div>
                        <Input
                            placeholder={course.title}
                            aria-label="课程名称确认"
                            onChange={(event) => {
                                confirmation = event.target.value;
                            }}
                        />
                    </div>
                ),
                okText: "永久删除",
                okButtonProps: { danger: true },
                cancelText: "取消",
                async onOk() {
                    await coursesApi.permanentlyDeletePlatformCourse(course.id, confirmation);
                    message.success("课程已永久删除");
                    await load();
                },
            });
        } catch (error) {
            message.error(errorMessage(error, "读取删除影响失败"));
        }
    };

    const searchSchools = async (value: string) => {
        const requestId = ++schoolRequestSequence.current;
        const result = await adminEducationApi.listSchools({ page: 1, pageSize: PAGE_SIZE, status: "active", keyword: value.trim() || undefined });
        if (requestId !== schoolRequestSequence.current) return;
        setSchools((current) => [...new Map([...current.filter((school) => schoolIds.includes(school.id)), ...result.items].map((school) => [school.id, school])).values()]);
    };

    const openAssign = async (course: PlatformCourse) => {
        setSchoolIds([]);
        setSchools([]);
        await searchSchools("");
        setAssigning(course);
    };

    const assign = async () => {
        if (!assigning || !schoolIds.length) return;
        setSaving(true);
        try {
            await coursesApi.assignCourseToSchools(assigning.id, schoolIds);
            message.success(`已分配给 ${schoolIds.length} 所学校`);
            setAssigning(null);
        } finally {
            setSaving(false);
        }
    };

    const actions = (course: PlatformCourse) => (
        <div className="flex flex-wrap justify-end gap-1">
            <Button type="text" size="small" icon={<Pencil className="size-3.5" />} onClick={() => openEditor(course)}>
                编辑
            </Button>
            <Button type="text" size="small" icon={<GitBranch className="size-3.5" />} onClick={() => setTreeCourse(course)}>
                课程结构
            </Button>
            {course.status === "draft" ? (
                <Button type="text" size="small" icon={<Send className="size-3.5" />} onClick={() => updateStatus(course, "published")}>
                    发布
                </Button>
            ) : null}
            {course.status === "published" ? (
                <>
                    <Button type="text" size="small" icon={<BookOpen className="size-3.5" />} onClick={() => void openAssign(course)}>
                        分配学校
                    </Button>
                    <Button type="text" size="small" danger onClick={() => updateStatus(course, "disabled")}>
                        停用
                    </Button>
                </>
            ) : null}
            {course.status === "disabled" ? (
                <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => void restore(course)}>
                    恢复
                </Button>
            ) : null}
            <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} aria-label="永久删除课程" onClick={() => permanentlyDelete(course)} />
        </div>
    );

    const columns: TableColumnsType<PlatformCourse> = [
        {
            title: "课程",
            render: (_, course) => (
                <div className="min-w-0">
                    <div className="truncate font-medium">{course.title}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{course.summary || "暂无摘要"}</div>
                </div>
            ),
        },
        { title: "章节", width: 80, dataIndex: "chapterCount" },
        { title: "课时", width: 80, dataIndex: "lessonCount" },
        { title: "资料", width: 80, dataIndex: "materialCount" },
        { title: "状态", width: 100, render: (_, course) => <CourseStatusTag status={course.status} /> },
        { title: "更新时间", width: 168, render: (_, course) => <span className="text-xs text-zinc-500">{formatTime(course.updatedAt)}</span> },
        { title: "操作", width: 360, align: "right", render: (_, course) => actions(course) },
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
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openEditor()}>
                        创建课程
                    </Button>
                </div>
            </div>
            <div className="hidden md:block">
                <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={false} scroll={{ x: 1120 }} />
            </div>
            <div className="space-y-2 md:hidden">
                {items.map((course) => (
                    <article key={course.id} className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="truncate text-sm font-medium">{course.title}</h2>
                                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{course.summary || "暂无摘要"}</p>
                            </div>
                            <CourseStatusTag status={course.status} />
                        </div>
                        <div className="mt-2 flex gap-3 text-xs text-zinc-500">
                            <span>{course.chapterCount} 章</span>
                            <span>{course.lessonCount} 课时</span>
                            <span>{course.materialCount} 项资料</span>
                        </div>
                        <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">{actions(course)}</div>
                    </article>
                ))}
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
                onCancel={() => setEditorOpen(false)}
            >
                <Form form={form} layout="vertical" requiredMark={false} preserve={false} onFinish={(values) => void save(values)}>
                    <Form.Item label="课程标题" name="title" rules={[{ required: true, message: "请填写课程标题" }]}>
                        <Input maxLength={160} />
                    </Form.Item>
                    <Form.Item label="课程摘要" name="summary">
                        <Input.TextArea rows={2} maxLength={500} showCount />
                    </Form.Item>
                    <Form.Item label="课程介绍" name="body">
                        <Input.TextArea rows={5} maxLength={12000} showCount />
                    </Form.Item>
                </Form>
            </Modal>
            <Modal
                title={assigning ? `分配“${assigning.title}”` : "分配课程"}
                open={Boolean(assigning)}
                centered
                width="min(560px, calc(100vw - 24px))"
                okText="确认分配"
                cancelText="取消"
                confirmLoading={saving}
                okButtonProps={{ disabled: !schoolIds.length }}
                onOk={() => void assign()}
                onCancel={() => setAssigning(null)}
            >
                <Select
                    mode="multiple"
                    className="w-full"
                    value={schoolIds}
                    placeholder="搜索并选择学校"
                    filterOption={false}
                    onSearch={(value) => void searchSchools(value)}
                    onChange={setSchoolIds}
                    options={schools.map((school) => ({ value: school.id, label: school.name }))}
                />
            </Modal>
            <CourseTreeEditor course={treeCourse} open={Boolean(treeCourse)} onClose={() => setTreeCourse(null)} onChanged={() => void load()} />
        </section>
    );
}

const courseStatusOptions = [
    { value: "draft", label: "草稿" },
    { value: "published", label: "已发布" },
    { value: "disabled", label: "已停用" },
] as const;
function CourseStatusTag({ status }: { status: PlatformCourseStatus }) {
    const config = status === "published" ? { color: "green", text: "已发布" } : status === "disabled" ? { color: "red", text: "已停用" } : { color: "gold", text: "草稿" };
    return <Tag color={config.color}>{config.text}</Tag>;
}
function textField(value: unknown, key: string) {
    return value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>)[key] === "string" ? String((value as Record<string, unknown>)[key]) : "";
}
function formatTime(value: string) {
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}
