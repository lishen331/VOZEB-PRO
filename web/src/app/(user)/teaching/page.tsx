"use client";

import { App, Button, Drawer, Form, Input, Modal, Pagination, Select, Spin, Tabs, Tag } from "antd";
import { BookOpen, ClipboardCheck, Eye, Plus, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PlatformCourse, SchoolCourseAssignment, SchoolCourseOffering, TeachingAssignment, TeachingAssignmentKind, TeachingSubmission } from "@/lib/school-domain";
import { coursesApi } from "@/services/api/courses";
import { useSchoolContextStore } from "@/stores/use-school-context-store";

type AssignmentForm = { offeringId: string; kind: TeachingAssignmentKind; title: string; instructions?: string; dueAt?: string; resourceUrls?: string[] };
type ReviewForm = { feedback: string };
const PAGE_SIZE = 12;

export default function TeachingPage() {
    const { message } = App.useApp();
    const context = useSchoolContextStore((state) => state.context);
    const [assignmentForm] = Form.useForm<AssignmentForm>();
    const [reviewForm] = Form.useForm<ReviewForm>();
    const [offerings, setOfferings] = useState<SchoolCourseOffering[]>([]);
    const [courses, setCourses] = useState<SchoolCourseAssignment[]>([]);
    const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
    const [submissions, setSubmissions] = useState<TeachingSubmission[]>([]);
    const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [assignmentOpen, setAssignmentOpen] = useState(false);
    const [initialOfferingId, setInitialOfferingId] = useState("");
    const [viewingOffering, setViewingOffering] = useState<SchoolCourseOffering | null>(null);
    const [viewingCourse, setViewingCourse] = useState<PlatformCourse | null>(null);
    const [submissionsOpen, setSubmissionsOpen] = useState(false);
    const [reviewing, setReviewing] = useState<{ submission: TeachingSubmission; status: "reviewed" | "revision_required" } | null>(null);
    const [offeringPage, setOfferingPage] = useState(1);
    const [offeringTotal, setOfferingTotal] = useState(0);
    const [coursePage, setCoursePage] = useState(1);
    const [courseTotal, setCourseTotal] = useState(0);
    const [assignmentPage, setAssignmentPage] = useState(1);
    const [assignmentTotal, setAssignmentTotal] = useState(0);
    const [submissionPage, setSubmissionPage] = useState(1);
    const [submissionTotal, setSubmissionTotal] = useState(0);
    const [submissionSelectionRevision, setSubmissionSelectionRevision] = useState(0);
    const [activeTab, setActiveTab] = useState("classes");
    const submissionRequestSequence = useRef(0);
    const submissionAbortController = useRef<AbortController | null>(null);

    const selectAssignment = useCallback((assignmentId: string) => {
        submissionAbortController.current?.abort();
        submissionRequestSequence.current += 1;
        setSubmissions([]);
        setSubmissionTotal(0);
        setSubmissionPage(1);
        setSelectedAssignmentId(assignmentId);
        setSubmissionSelectionRevision((revision) => revision + 1);
    }, []);

    const loadSubmissions = useCallback(
        async (assignmentId: string) => {
            const requestId = ++submissionRequestSequence.current;
            submissionAbortController.current?.abort();
            setSubmissions([]);
            setSubmissionTotal(0);
            if (!assignmentId) {
                return;
            }
            const controller = new AbortController();
            submissionAbortController.current = controller;
            try {
                const result = await coursesApi.listSubmissions(assignmentId, { page: submissionPage, pageSize: PAGE_SIZE }, { signal: controller.signal });
                if (requestId !== submissionRequestSequence.current) return;
                setSubmissions(result.items);
                setSubmissionTotal(result.total);
            } catch (error) {
                if (controller.signal.aborted || requestId !== submissionRequestSequence.current) return;
                setSubmissions([]);
                setSubmissionTotal(0);
                message.error(errorMessage(error, "学生提交加载失败"));
            }
        },
        [message, submissionPage],
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [offeringResult, courseResult, assignmentResult] = await Promise.all([
                coursesApi.listTeachingOfferings({ page: offeringPage, pageSize: PAGE_SIZE }),
                coursesApi.listTeachingCourses({ page: coursePage, pageSize: PAGE_SIZE }),
                coursesApi.listTeachingAssignments({ page: assignmentPage, pageSize: PAGE_SIZE }),
            ]);
            setOfferings(offeringResult.items);
            setOfferingTotal(offeringResult.total);
            setCourses(courseResult.items);
            setCourseTotal(courseResult.total);
            setAssignments(assignmentResult.items);
            setAssignmentTotal(assignmentResult.total);
            selectAssignment(assignmentResult.items[0]?.id || "");
        } catch (error) {
            setOfferings([]);
            setCourses([]);
            setAssignments([]);
            setSubmissions([]);
            message.error(errorMessage(error, "教学中心加载失败"));
        } finally {
            setLoading(false);
        }
    }, [assignmentPage, coursePage, message, offeringPage, selectAssignment]);

    useEffect(() => void load(), [load]);
    useEffect(() => void loadSubmissions(selectedAssignmentId), [loadSubmissions, selectedAssignmentId, submissionSelectionRevision]);
    useEffect(() => () => submissionAbortController.current?.abort(), []);

    const classOfferings = useMemo(() => Array.from(new Map(offerings.map((item) => [item.classId, item])).values()), [offerings]);
    const selectedAssignment = assignments.find((assignment) => assignment.id === selectedAssignmentId);

    const openCreate = (offeringId?: string) => {
        setInitialOfferingId(offeringId || offerings[0]?.id || "");
        setAssignmentOpen(true);
    };

    const createAssignment = async (values: AssignmentForm) => {
        setSaving(true);
        try {
            await coursesApi.createTeachingAssignment({
                offeringId: values.offeringId,
                kind: values.kind,
                title: values.title.trim(),
                instructions: values.instructions?.trim() || "",
                dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : undefined,
                resources: (values.resourceUrls || []).map((url) => ({ url })),
                status: "draft",
            });
            message.success("作业草稿已创建");
            setAssignmentOpen(false);
            assignmentForm.resetFields();
            await load();
        } catch (error) {
            message.error(errorMessage(error, "作业创建失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const updateStatus = async (assignment: TeachingAssignment, status: "published" | "closed") => {
        setSaving(true);
        try {
            await coursesApi.updateTeachingAssignment(assignment.id, { status });
            message.success(status === "published" ? "作业已发布" : "作业已关闭");
            await load();
        } catch (error) {
            message.error(errorMessage(error, "作业状态更新失败"));
        } finally {
            setSaving(false);
        }
    };

    const openSubmissions = async (assignment: TeachingAssignment) => {
        selectAssignment(assignment.id);
        setSubmissionsOpen(true);
    };

    const openReview = (submission: TeachingSubmission, status: "reviewed" | "revision_required") => {
        setReviewing({ submission, status });
    };

    const submitReview = async (values: ReviewForm) => {
        if (!reviewing) return;
        setSaving(true);
        try {
            await coursesApi.reviewSubmission(reviewing.submission.id, { status: reviewing.status, feedback: values.feedback.trim() });
            message.success(reviewing.status === "reviewed" ? "批改已通过" : "已退回修改");
            setReviewing(null);
            await loadSubmissions(selectedAssignmentId);
        } catch (error) {
            message.error(errorMessage(error, "批改保存失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const tabs = [
        {
            key: "classes",
            label: "我的班级",
            children: (
                <ResponsiveGrid empty={!classOfferings.length && !loading} emptyText="暂无负责班级">
                    {classOfferings.map((offering) => (
                        <article key={offering.classId} className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="truncate text-sm font-medium">{offering.className}</h2>
                                    <p className="mt-1 truncate text-xs text-zinc-500">{offering.courseTitle}</p>
                                </div>
                                <OfferingStatus status={offering.status} />
                            </div>
                            <Button className="mt-3" size="small" icon={<Eye className="size-3.5" />} onClick={() => setViewingOffering(offering)}>
                                查看安排
                            </Button>
                        </article>
                    ))}
                </ResponsiveGrid>
            ),
        },
        {
            key: "courses",
            label: "我的课程",
            children: (
                <ResponsiveGrid empty={!courses.length && !loading} emptyText="暂无负责课程">
                    {courses.map((item) => (
                        <article key={item.id} className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                            <h2 className="truncate text-sm font-medium">{item.course.title}</h2>
                            <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-zinc-500">{item.course.summary || "暂无摘要"}</p>
                            <div className="mt-3 flex items-center justify-between gap-2">
                                <span className="text-xs text-zinc-500">{item.course.chapters.length} 个章节/课时</span>
                                <Button size="small" icon={<BookOpen className="size-3.5" />} onClick={() => setViewingCourse(item.course)}>
                                    阅读
                                </Button>
                            </div>
                        </article>
                    ))}
                </ResponsiveGrid>
            ),
        },
        {
            key: "assignments",
            label: "作业",
            children: (
                <section className="space-y-3">
                    <div className="flex justify-end">
                        <Button type="primary" icon={<Plus className="size-4" />} disabled={!offerings.some((item) => item.status === "active")} onClick={() => openCreate()}>
                            创建作业
                        </Button>
                    </div>
                    <div className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                        {assignments.map((assignment) => (
                            <div key={assignment.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="truncate text-sm font-medium">{assignment.title}</h2>
                                        <AssignmentStatus status={assignment.status} />
                                        <Tag>{assignmentKindLabel(assignment.kind)}</Tag>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{assignment.instructions || "暂无说明"}</p>
                                    <p className="mt-1 truncate text-xs text-zinc-500">
                                        {assignment.courseTitle} · {assignment.className}
                                    </p>
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-1">
                                    <Button size="small" icon={<ClipboardCheck className="size-3.5" />} onClick={() => void openSubmissions(assignment)}>
                                        学生提交
                                    </Button>
                                    {assignment.status === "draft" ? (
                                        <Button size="small" type="primary" icon={<Send className="size-3.5" />} loading={saving} onClick={() => void updateStatus(assignment, "published")}>
                                            发布
                                        </Button>
                                    ) : null}
                                    {assignment.status === "published" ? (
                                        <Button size="small" loading={saving} onClick={() => void updateStatus(assignment, "closed")}>
                                            关闭
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                        {!loading && !assignments.length ? <EmptyText text="暂无作业" /> : null}
                    </div>
                </section>
            ),
        },
        {
            key: "submissions",
            label: "学生提交",
            children: (
                <section className="space-y-3">
                    <Select className="w-full sm:max-w-md" value={selectedAssignmentId || undefined} placeholder="选择作业" options={assignments.map((item) => ({ value: item.id, label: item.title }))} onChange={selectAssignment} />
                    <SubmissionList submissions={submissions} canReview={selectedAssignment?.status === "published"} onReview={openReview} />
                </section>
            ),
        },
    ];

    return (
        <main className="h-full min-h-0 overflow-y-auto px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
                <header className="flex items-start justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-semibold text-zinc-950 sm:text-xl dark:text-zinc-100">教学中心</h1>
                        <p className="mt-1 text-xs text-zinc-500 sm:text-sm">{context?.school.name || "学校课程与作业"}</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} aria-label="刷新教学中心" loading={loading} onClick={() => void load()} />
                </header>
                {loading && !courses.length && !assignments.length ? (
                    <div className="flex min-h-40 items-center justify-center">
                        <Spin />
                    </div>
                ) : (
                    <>
                        <Tabs destroyOnHidden className="pt-2" activeKey={activeTab} items={tabs} onChange={setActiveTab} />
                        <Pagination
                            className="mt-4"
                            current={activeTab === "classes" ? offeringPage : activeTab === "courses" ? coursePage : activeTab === "assignments" ? assignmentPage : submissionPage}
                            pageSize={PAGE_SIZE}
                            total={activeTab === "classes" ? offeringTotal : activeTab === "courses" ? courseTotal : activeTab === "assignments" ? assignmentTotal : submissionTotal}
                            hideOnSinglePage
                            showSizeChanger={false}
                            responsive
                            onChange={activeTab === "classes" ? setOfferingPage : activeTab === "courses" ? setCoursePage : activeTab === "assignments" ? setAssignmentPage : setSubmissionPage}
                        />
                    </>
                )}
            </div>

            <Modal
                title="创建作业"
                open={assignmentOpen}
                destroyOnHidden
                width="min(620px, calc(100vw - 24px))"
                okText="保存草稿"
                cancelText="取消"
                confirmLoading={saving}
                afterOpenChange={(open) => {
                    if (!open) return;
                    assignmentForm.resetFields();
                    assignmentForm.setFieldsValue({ offeringId: initialOfferingId, kind: "homework", resourceUrls: [] });
                }}
                onOk={() => assignmentForm.submit()}
                onCancel={() => setAssignmentOpen(false)}
            >
                <Form form={assignmentForm} layout="vertical" requiredMark={false} preserve={false} onFinish={(values) => void createAssignment(values)}>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item label="课程安排" name="offeringId" className="sm:col-span-2" rules={[{ required: true, message: "请选择课程安排" }]}>
                            <Select optionFilterProp="label" options={offerings.filter((item) => item.status === "active").map((item) => ({ value: item.id, label: `${item.courseTitle} · ${item.className}` }))} />
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

            <Drawer title="课程安排详情" open={Boolean(viewingOffering)} destroyOnHidden size="min(720px, 100vw)" onClose={() => setViewingOffering(null)}>
                {viewingOffering ? (
                    <div className="space-y-5 text-sm">
                        <DetailLine label="课程" value={viewingOffering.courseTitle} />
                        <DetailLine label="班级" value={viewingOffering.className} />
                        <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                            <h2 className="font-medium">补充资料</h2>
                            <ResourceList values={viewingOffering.supplementalResources} />
                        </section>
                        <Button type="primary" icon={<Plus className="size-4" />} disabled={viewingOffering.status !== "active"} onClick={() => openCreate(viewingOffering.id)}>
                            创建作业
                        </Button>
                    </div>
                ) : null}
            </Drawer>

            <Drawer title={viewingCourse?.title || "课程详情"} open={Boolean(viewingCourse)} destroyOnHidden size="min(720px, 100vw)" onClose={() => setViewingCourse(null)}>
                {viewingCourse ? <CourseDetail course={viewingCourse} /> : null}
            </Drawer>

            <Drawer title="学生提交" open={submissionsOpen} destroyOnHidden size="min(720px, 100vw)" onClose={() => setSubmissionsOpen(false)}>
                <SubmissionList submissions={submissions} canReview={selectedAssignment?.status === "published"} onReview={openReview} />
            </Drawer>

            <Modal
                title={reviewing?.status === "reviewed" ? "批改通过" : "退回修改"}
                open={Boolean(reviewing)}
                destroyOnHidden
                width="min(520px, calc(100vw - 24px))"
                okText="确认"
                cancelText="取消"
                confirmLoading={saving}
                afterOpenChange={(open) => {
                    if (!open || !reviewing) return;
                    reviewForm.resetFields();
                    reviewForm.setFieldsValue({ feedback: reviewing.submission.feedback || "" });
                }}
                onOk={() => reviewForm.submit()}
                onCancel={() => setReviewing(null)}
            >
                <Form form={reviewForm} layout="vertical" preserve={false} onFinish={(values) => void submitReview(values)}>
                    <Form.Item label="反馈" name="feedback" rules={[{ required: reviewing?.status === "revision_required", message: "退回修改时请填写反馈" }]}>
                        <Input.TextArea rows={4} maxLength={2000} showCount />
                    </Form.Item>
                </Form>
            </Modal>
        </main>
    );
}

function SubmissionList({ submissions, canReview, onReview }: { submissions: TeachingSubmission[]; canReview: boolean; onReview: (submission: TeachingSubmission, status: "reviewed" | "revision_required") => void }) {
    return (
        <div className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {submissions.map((submission) => (
                <article key={submission.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="text-sm font-medium">{submission.student.displayName}</div>
                            {submission.student.accountId ? <div className="mt-0.5 text-xs text-zinc-500">ID：{submission.student.accountId}</div> : null}
                            <div className="mt-0.5 text-xs text-zinc-500">{formatTime(submission.submittedAt)}</div>
                        </div>
                        <SubmissionStatus status={submission.status} />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">{submission.note || "未填写说明"}</p>
                    <div className="mt-2 text-xs text-zinc-500">成果引用 {submission.contentReferences.length} 项</div>
                    {submission.feedback ? <p className="mt-2 rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">{submission.feedback}</p> : null}
                    {canReview && submission.status === "submitted" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="small" type="primary" onClick={() => onReview(submission, "reviewed")}>
                                批改通过
                            </Button>
                            <Button size="small" onClick={() => onReview(submission, "revision_required")}>
                                退回修改
                            </Button>
                        </div>
                    ) : null}
                </article>
            ))}
            {!submissions.length ? <EmptyText text="暂无学生提交" /> : null}
        </div>
    );
}

function ResponsiveGrid({ children, empty, emptyText }: { children: React.ReactNode; empty: boolean; emptyText: string }) {
    if (empty) return <EmptyText text={emptyText} />;
    return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function CourseDetail({ course }: { course: PlatformCourse }) {
    const body = typeof course.content.body === "string" ? course.content.body : "";
    return (
        <div className="space-y-5">
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">{body || course.summary || "暂无正文"}</p>
            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <h2 className="text-sm font-medium">章节与课时</h2>
                <div className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
                    {course.chapters.map((item, index) => (
                        <div key={`${index}-${itemTitle(item)}`} className="py-2 text-sm">
                            {itemTitle(item) || `课时 ${index + 1}`}
                        </div>
                    ))}
                    {!course.chapters.length ? <p className="py-3 text-sm text-zinc-500">暂无章节或课时</p> : null}
                </div>
            </section>
            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <h2 className="text-sm font-medium">课程附件</h2>
                <ResourceList values={course.attachments} emptyText="暂无课程附件" />
            </section>
        </div>
    );
}

function ResourceList({ values, emptyText = "暂无补充资料" }: { values: unknown[]; emptyText?: string }) {
    return (
        <div className="mt-2 space-y-2">
            {values.map((value, index) => {
                const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
                const title = typeof source.title === "string" ? source.title : `资料 ${index + 1}`;
                const url = typeof source.url === "string" ? source.url : "";
                return url ? (
                    <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="block truncate text-cyan-700 hover:underline dark:text-cyan-300">
                        {title}
                    </a>
                ) : (
                    <div key={index} className="text-zinc-500">
                        {title}
                    </div>
                );
            })}
            {!values.length ? <p className="text-zinc-500">{emptyText}</p> : null}
        </div>
    );
}

function DetailLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="text-zinc-500">{label}</span>
            <span className="truncate">{value}</span>
        </div>
    );
}

const assignmentKindOptions = [
    { value: "lesson", label: "课时任务" },
    { value: "homework", label: "课后作业" },
    { value: "commercial_practice", label: "课程实训" },
] as const;

function assignmentKindLabel(kind: TeachingAssignmentKind) {
    return kind === "lesson" ? "课时" : kind === "commercial_practice" ? "实训" : "作业";
}

function AssignmentStatus({ status }: Pick<TeachingAssignment, "status">) {
    if (status === "published") return <Tag color="blue">进行中</Tag>;
    if (status === "closed") return <Tag>已关闭</Tag>;
    return <Tag color="gold">草稿</Tag>;
}

function SubmissionStatus({ status }: Pick<TeachingSubmission, "status">) {
    if (status === "reviewed") return <Tag color="green">已批改</Tag>;
    if (status === "revision_required") return <Tag color="orange">待修改</Tag>;
    return <Tag color="blue">待批改</Tag>;
}

function OfferingStatus({ status }: Pick<SchoolCourseOffering, "status">) {
    return status === "active" ? <Tag color="green">进行中</Tag> : <Tag>已停用</Tag>;
}

function EmptyText({ text }: { text: string }) {
    return <div className="py-10 text-center text-sm text-zinc-500">{text}</div>;
}

function itemTitle(value: unknown) {
    return value && typeof value === "object" && typeof (value as Record<string, unknown>).title === "string" ? String((value as Record<string, unknown>).title) : "";
}

function formatTime(value: string) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? "-" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(time);
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
