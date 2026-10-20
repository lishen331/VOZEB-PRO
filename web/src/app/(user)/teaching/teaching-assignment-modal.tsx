"use client";

import { useEffect, useState } from "react";
import { App, Form } from "antd";
import { Select } from "@/components/gamma-ui/gamma-ant-select";

import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Modal } from "@/components/gamma-ui/gamma-ant-modal";
import type { PlatformCourseDetail, SchoolCourseOffering, TeachingAssignmentKind } from "@/lib/school-domain";
import { coursesApi } from "@/services/api/courses";

/*
 * 创建作业弹窗：教学中心「作业」标签和课程备课页共用。
 * 备课页打开时会带上当前课程的班级与课时，老师只需补标题和要求。
 */

type AssignmentForm = { offeringId: string; chapterId?: string; lessonId?: string; kind: TeachingAssignmentKind; title: string; instructions?: string; dueAt?: string; resourceUrls?: string[] };

export const assignmentKindOptions = [
    { value: "lesson", label: "课时任务" },
    { value: "homework", label: "课后作业" },
    { value: "commercial_practice", label: "课程实训" },
] as const;

export interface AssignmentCreateModalProps {
    open: boolean;
    offerings: readonly SchoolCourseOffering[];
    /** 课程安排 → 课程树（key 为 offering.assignmentId），用于选章节 / 课时 */
    courseTrees: Record<string, Pick<PlatformCourseDetail, "chapters">>;
    initial?: { offeringId?: string; chapterId?: string; lessonId?: string; kind?: TeachingAssignmentKind };
    onClose: () => void;
    onCreated: () => Promise<void> | void;
}

export function AssignmentCreateModal({ open, offerings, courseTrees, initial, onClose, onCreated }: AssignmentCreateModalProps) {
    const { message } = App.useApp();
    const [form] = Form.useForm<AssignmentForm>();
    const [saving, setSaving] = useState(false);
    const activeOfferings = offerings.filter((item) => item.status === "active");
    const [offeringId, setOfferingId] = useState("");
    const chapters = courseTrees[offerings.find((item) => item.id === offeringId)?.assignmentId || ""]?.chapters || [];

    const initialOffering = initial?.offeringId || activeOfferings[0]?.id || "";
    // 弹窗每次打开都会重新挂载表单（destroyOnHidden），初始值用 initialValues 交给表单本身，选中的课程安排同步一份到本地状态
    useEffect(() => {
        if (open) setOfferingId(initialOffering);
    }, [initialOffering, open]);

    const createAssignment = async (values: AssignmentForm) => {
        setSaving(true);
        try {
            await coursesApi.createTeachingAssignment({
                offeringId: values.offeringId,
                chapterId: values.chapterId,
                lessonId: values.lessonId,
                kind: values.kind,
                title: values.title.trim(),
                instructions: values.instructions?.trim() || "",
                dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : undefined,
                resources: (values.resourceUrls || []).map((url) => ({ url })),
                status: "draft",
            });
            message.success("作业草稿已创建");
            onClose();
            await onCreated();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "作业创建失败");
            throw error;
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title="创建作业" open={open} destroyOnHidden width="min(620px, calc(100vw - 24px))" okText="保存草稿" cancelText="取消" confirmLoading={saving} onOk={() => form.submit()} onCancel={onClose}>
            <Form
                form={form}
                layout="vertical"
                requiredMark={false}
                preserve={false}
                initialValues={{ offeringId: initialOffering || undefined, chapterId: initial?.chapterId, lessonId: initial?.lessonId, kind: initial?.kind || "homework", resourceUrls: [] }}
                onFinish={(values) => void createAssignment(values)}
            >
                <div className="grid gap-x-3 sm:grid-cols-2">
                    <Form.Item label="课程安排" name="offeringId" className="sm:col-span-2" rules={[{ required: true, message: "请选择课程安排" }]}>
                        <Select
                            optionFilterProp="label"
                            options={activeOfferings.map((item) => ({ value: item.id, label: `${item.courseTitle} · ${item.className}` }))}
                            onChange={(value) => {
                                setOfferingId(value);
                                form.setFieldsValue({ chapterId: undefined, lessonId: undefined });
                            }}
                        />
                    </Form.Item>
                    <Form.Item label="关联章节" name="chapterId">
                        <Select allowClear placeholder="不限定章节" options={chapters.map((chapter) => ({ value: chapter.id, label: chapter.title }))} onChange={() => form.setFieldValue("lessonId", undefined)} />
                    </Form.Item>
                    <Form.Item label="关联课时" name="lessonId">
                        <Select
                            allowClear
                            placeholder="不限定课时"
                            options={chapters.flatMap((chapter) => chapter.lessons.map((lesson) => ({ value: lesson.id, label: `${chapter.title} · ${lesson.title}` })))}
                            onChange={() => form.setFieldValue("chapterId", undefined)}
                        />
                    </Form.Item>
                    <Form.Item label="类型" name="kind" rules={[{ required: true, message: "请选择类型" }]}>
                        <Select options={[...assignmentKindOptions]} />
                    </Form.Item>
                    <Form.Item label="截止时间" name="dueAt">
                        <Input type="datetime-local" />
                    </Form.Item>
                    <Form.Item label="标题" name="title" className="sm:col-span-2" rules={[{ required: true, message: "请填写标题" }]}>
                        <Input maxLength={160} />
                    </Form.Item>
                    <Form.Item label="要求" name="instructions" className="sm:col-span-2">
                        <Input.TextArea rows={5} maxLength={5000} showCount />
                    </Form.Item>
                    <Form.Item label="资料 URL" name="resourceUrls" className="sm:col-span-2">
                        <Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入 URL 后回车" />
                    </Form.Item>
                </div>
            </Form>
        </Modal>
    );
}
