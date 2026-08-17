"use client";

import { App, Button, Checkbox, Drawer, Form, Input, Pagination, Spin, Tabs, Tag } from "antd";
import { BookOpen, CheckCircle2, ClipboardList, Eye, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { PlatformCourse, SchoolContentReference, SchoolCourseAssignment, TeachingAssignment, TeachingSubmission } from "@/lib/school-domain";
import { listCanvasProjectSummaries } from "@/services/api/canvas-projects";
import { coursesApi } from "@/services/api/courses";
import { listDramaProjectSummaries } from "@/services/api/drama-projects";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import { listWorkPublications } from "@/services/api/work-publications";
import { useSchoolContextStore } from "@/stores/use-school-context-store";

type ReferenceCandidate = { reference: SchoolContentReference; title: string; detail: string };
type SubmissionForm = { note?: string };
const PAGE_SIZE = 12;

export default function LearningPage() {
    const { message } = App.useApp();
    const context = useSchoolContextStore((state) => state.context);
    const [form] = Form.useForm<SubmissionForm>();
    const [courses, setCourses] = useState<SchoolCourseAssignment[]>([]);
    const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
    const [submissions, setSubmissions] = useState<Record<string, TeachingSubmission | undefined>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [viewingCourse, setViewingCourse] = useState<PlatformCourse | null>(null);
    const [viewingLesson, setViewingLesson] = useState<{ course: PlatformCourse; item: unknown; index: number } | null>(null);
    const [submitting, setSubmitting] = useState<TeachingAssignment | null>(null);
    const [candidates, setCandidates] = useState<ReferenceCandidate[]>([]);
    const [selectedReferences, setSelectedReferences] = useState<SchoolContentReference[]>([]);
    const [candidateLoading, setCandidateLoading] = useState(false);
    const [candidatePage, setCandidatePage] = useState(1);
    const [candidateHasMore, setCandidateHasMore] = useState(false);
    const [coursePage, setCoursePage] = useState(1);
    const [courseTotal, setCourseTotal] = useState(0);
    const [assignmentPage, setAssignmentPage] = useState(1);
    const [assignmentTotal, setAssignmentTotal] = useState(0);
    const [activeTab, setActiveTab] = useState("courses");
    const loadRequestSequence = useRef(0);
    const loadAbortController = useRef<AbortController | null>(null);

    const load = useCallback(async () => {
        const requestId = ++loadRequestSequence.current;
        loadAbortController.current?.abort();
        const controller = new AbortController();
        loadAbortController.current = controller;
        setLoading(true);
        try {
            const [courseResult, assignmentResult] = await Promise.all([
                coursesApi.listTeachingCourses({ page: coursePage, pageSize: PAGE_SIZE }, { signal: controller.signal }),
                coursesApi.listTeachingAssignments({ page: assignmentPage, pageSize: PAGE_SIZE }, { signal: controller.signal }),
            ]);
            const submissionPage = assignmentResult.items.length
                ? await coursesApi.listOwnSubmissions({ page: 1, pageSize: PAGE_SIZE, assignmentIds: assignmentResult.items.map((assignment) => assignment.id) }, { signal: controller.signal })
                : { items: [] as TeachingSubmission[] };
            if (requestId !== loadRequestSequence.current) return;
            setCourses(courseResult.items);
            setCourseTotal(courseResult.total);
            setAssignments(assignmentResult.items);
            setAssignmentTotal(assignmentResult.total);
            setSubmissions(Object.fromEntries(submissionPage.items.map((submission) => [submission.assignmentId, submission])));
        } catch (error) {
            if (controller.signal.aborted || requestId !== loadRequestSequence.current) return;
            setCourses([]);
            setAssignments([]);
            setSubmissions({});
            message.error(errorMessage(error, "学习中心加载失败"));
        } finally {
            if (requestId === loadRequestSequence.current) setLoading(false);
        }
    }, [assignmentPage, coursePage, message]);

    useEffect(() => void load(), [load]);
    useEffect(() => () => loadAbortController.current?.abort(), []);

    const lessons = useMemo(() => courses.flatMap((item) => item.course.chapters.map((chapter, index) => ({ course: item.course, item: chapter, index }))), [courses]);
    const homework = useMemo(() => assignments.filter((item) => item.kind !== "commercial_practice"), [assignments]);
    const practices = useMemo(() => assignments.filter((item) => item.kind === "commercial_practice"), [assignments]);
    const pending = useMemo(() => homework.filter((item) => item.status === "published" && (!submissions[item.id] || submissions[item.id]?.status === "revision_required")), [homework, submissions]);
    const submitted = useMemo(
        () =>
            homework.filter((item) => {
                const submission = submissions[item.id];
                return Boolean(submission) && (item.status === "closed" || submission?.status !== "revision_required");
            }),
        [homework, submissions],
    );
    const feedback = useMemo(() => Object.values(submissions).filter((item): item is TeachingSubmission => Boolean(item?.feedback)), [submissions]);

    const openSubmission = async (assignment: TeachingAssignment) => {
        const existing = submissions[assignment.id];
        const canSubmit = assignment.status === "published" && (!existing || existing.status === "revision_required");
        setSelectedReferences(existing?.contentReferences || []);
        setSubmitting(assignment);
        if (!canSubmit) {
            setCandidates([]);
            setCandidateHasMore(false);
            return;
        }
        setCandidateLoading(true);
        try {
            const result = await loadReferenceCandidates(1);
            setCandidates(result.items);
            setCandidatePage(1);
            setCandidateHasMore(result.hasMore);
        } catch (error) {
            setCandidates([]);
            message.error(errorMessage(error, "成果列表加载失败"));
        } finally {
            setCandidateLoading(false);
        }
    };

    const loadMoreCandidates = async () => {
        const nextPage = candidatePage + 1;
        setCandidateLoading(true);
        try {
            const result = await loadReferenceCandidates(nextPage);
            setCandidates((current) => uniqueCandidates([...current, ...result.items]));
            setCandidatePage(nextPage);
            setCandidateHasMore(result.hasMore);
        } catch (error) {
            message.error(errorMessage(error, "成果列表加载失败"));
        } finally {
            setCandidateLoading(false);
        }
    };

    const toggleReference = (reference: SchoolContentReference, checked: boolean) => {
        const key = referenceKey(reference);
        setSelectedReferences((current) => (checked ? [...current.filter((item) => referenceKey(item) !== key), reference] : current.filter((item) => referenceKey(item) !== key)));
    };

    const submit = async (values: SubmissionForm) => {
        const existing = submitting ? submissions[submitting.id] : undefined;
        if (!submitting || submitting.status !== "published" || (existing && existing.status !== "revision_required")) return;
        setSaving(true);
        try {
            const result = await coursesApi.submitAssignment(submitting.id, { note: values.note?.trim() || "", references: selectedReferences });
            setSubmissions((current) => ({ ...current, [submitting.id]: result }));
            message.success("作业已提交");
            setSubmitting(null);
            setCandidates([]);
            setSelectedReferences([]);
            form.resetFields();
        } catch (error) {
            message.error(errorMessage(error, "作业提交失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const tabs = [
        {
            key: "courses",
            label: "我的课程",
            children: (
                <ResponsiveGrid empty={!courses.length && !loading} emptyText="暂无班级课程">
                    {courses.map((item) => (
                        <article key={item.id} className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                            <h2 className="truncate text-sm font-medium">{item.course.title}</h2>
                            <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-zinc-500">{item.course.summary || "暂无摘要"}</p>
                            <div className="mt-3 flex items-center justify-between gap-2">
                                <span className="text-xs text-zinc-500">{item.course.chapters.length} 个课时</span>
                                <Button size="small" icon={<BookOpen className="size-3.5" />} onClick={() => setViewingCourse(item.course)}>
                                    查看课程
                                </Button>
                            </div>
                        </article>
                    ))}
                </ResponsiveGrid>
            ),
        },
        {
            key: "lessons",
            label: "课时",
            children: (
                <div className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                    {lessons.map((lesson) => (
                        <div key={`${lesson.course.id}-${lesson.index}`} className="flex items-center justify-between gap-3 py-3">
                            <div className="min-w-0">
                                <h2 className="truncate text-sm font-medium">{outlineTitle(lesson.item) || `课时 ${lesson.index + 1}`}</h2>
                                <p className="mt-0.5 truncate text-xs text-zinc-500">{lesson.course.title}</p>
                            </div>
                            <Button size="small" icon={<Eye className="size-3.5" />} onClick={() => setViewingLesson(lesson)}>
                                课时详情
                            </Button>
                        </div>
                    ))}
                    {!loading && !lessons.length ? <EmptyText text="暂无课时" /> : null}
                </div>
            ),
        },
        {
            key: "pending",
            label: `待交作业${pending.length ? ` ${pending.length}` : ""}`,
            children: <AssignmentList items={pending} submissions={submissions} actionLabel="提交作业" onOpen={openSubmission} />,
        },
        {
            key: "submitted",
            label: "已交作业",
            children: <AssignmentList items={submitted} submissions={submissions} actionLabel="查看提交" onOpen={openSubmission} />,
        },
        {
            key: "practice",
            label: "实训",
            children: <AssignmentList items={practices} submissions={submissions} actionLabel="提交成果" onOpen={openSubmission} />,
        },
        {
            key: "feedback",
            label: "反馈",
            children: (
                <div className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                    {feedback.map((submission) => {
                        const assignment = assignments.find((item) => item.id === submission.assignmentId);
                        return (
                            <article key={submission.id} className="py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 className="truncate text-sm font-medium">{assignment?.title || "课程作业"}</h2>
                                    <SubmissionStatus status={submission.status} />
                                </div>
                                <p className="mt-2 whitespace-pre-wrap rounded-md bg-zinc-50 px-3 py-2 text-sm leading-6 dark:bg-zinc-900">{submission.feedback}</p>
                            </article>
                        );
                    })}
                    {!feedback.length ? <EmptyText text="暂无老师反馈" /> : null}
                </div>
            ),
        },
    ];

    return (
        <main className="h-full min-h-0 overflow-y-auto px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
                <header className="flex items-start justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-semibold text-zinc-950 sm:text-xl dark:text-zinc-100">学习中心</h1>
                        <p className="mt-1 text-xs text-zinc-500 sm:text-sm">{context?.school.name || "班级课程与作业"}</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} aria-label="刷新学习中心" loading={loading} onClick={() => void load()} />
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
                            current={activeTab === "courses" || activeTab === "lessons" ? coursePage : assignmentPage}
                            pageSize={PAGE_SIZE}
                            total={activeTab === "courses" || activeTab === "lessons" ? courseTotal : assignmentTotal}
                            hideOnSinglePage
                            showSizeChanger={false}
                            responsive
                            onChange={activeTab === "courses" || activeTab === "lessons" ? setCoursePage : setAssignmentPage}
                        />
                    </>
                )}
            </div>

            <Drawer title={viewingCourse?.title || "课程详情"} open={Boolean(viewingCourse)} destroyOnHidden size="min(720px, 100vw)" onClose={() => setViewingCourse(null)}>
                {viewingCourse ? <CourseDetail course={viewingCourse} /> : null}
            </Drawer>

            <Drawer title={viewingLesson ? outlineTitle(viewingLesson.item) || `课时 ${viewingLesson.index + 1}` : "课时详情"} open={Boolean(viewingLesson)} destroyOnHidden size="min(620px, 100vw)" onClose={() => setViewingLesson(null)}>
                {viewingLesson ? (
                    <div className="space-y-4">
                        <p className="text-xs text-zinc-500">{viewingLesson.course.title}</p>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">{outlineDescription(viewingLesson.item) || "本课时暂无补充说明"}</p>
                    </div>
                ) : null}
            </Drawer>

            <Drawer
                title={submitting?.title || "提交作业"}
                open={Boolean(submitting)}
                destroyOnHidden
                size="min(720px, 100vw)"
                afterOpenChange={(open) => {
                    if (!open || !submitting) return;
                    const existing = submissions[submitting.id];
                    if (submitting.status !== "published" || (existing && existing.status !== "revision_required")) return;
                    form.resetFields();
                    form.setFieldsValue({ note: existing?.note || "" });
                }}
                onClose={() => setSubmitting(null)}
                extra={
                    submitting?.status === "published" && (!submissions[submitting.id] || submissions[submitting.id]?.status === "revision_required") ? (
                        <Button type="primary" icon={<Send className="size-4" />} loading={saving} onClick={() => form.submit()}>
                            提交
                        </Button>
                    ) : null
                }
            >
                {submitting ? (
                    <div className="space-y-5">
                        <section>
                            <div className="flex flex-wrap items-center gap-2">
                                <AssignmentKind kind={submitting.kind} />
                                {submissions[submitting.id] ? <SubmissionStatus status={submissions[submitting.id]!.status} /> : <Tag>未提交</Tag>}
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">{submitting.instructions || "暂无作业说明"}</p>
                        </section>
                        {submissions[submitting.id]?.feedback ? (
                            <section className="rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
                                <h2 className="text-sm font-medium text-amber-900 dark:text-amber-200">老师反馈</h2>
                                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-800 dark:text-amber-300">{submissions[submitting.id]?.feedback}</p>
                            </section>
                        ) : null}
                        {submitting.status === "published" && (!submissions[submitting.id] || submissions[submitting.id]?.status === "revision_required") ? (
                            <>
                                <Form form={form} layout="vertical" requiredMark={false} preserve={false} onFinish={(values) => void submit(values)}>
                                    <Form.Item label="提交说明" name="note">
                                        <Input.TextArea rows={4} maxLength={2000} showCount />
                                    </Form.Item>
                                </Form>
                                <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                                    <h2 className="text-sm font-medium">选择现有成果</h2>
                                    {candidateLoading && !candidates.length ? (
                                        <div className="flex min-h-24 items-center justify-center">
                                            <Spin size="small" />
                                        </div>
                                    ) : (
                                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                            {candidates.map((candidate) => {
                                                const checked = selectedReferences.some((item) => referenceKey(item) === referenceKey(candidate.reference));
                                                return (
                                                    <label key={referenceKey(candidate.reference)} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                                                        <Checkbox checked={checked} onChange={(event) => toggleReference(candidate.reference, event.target.checked)} />
                                                        <span className="min-w-0">
                                                            <span className="block truncate text-sm font-medium">{candidate.title}</span>
                                                            <span className="mt-0.5 block truncate text-xs text-zinc-500">{candidate.detail}</span>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                            {!candidates.length ? <p className="py-5 text-sm text-zinc-500 sm:col-span-2">暂无可引用成果</p> : null}
                                        </div>
                                    )}
                                    {candidateHasMore ? (
                                        <Button className="mt-3" loading={candidateLoading} onClick={() => void loadMoreCandidates()}>
                                            加载更多
                                        </Button>
                                    ) : null}
                                </section>
                            </>
                        ) : null}
                        {submissions[submitting.id] ? (
                            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                                <h2 className="text-sm font-medium">提交记录</h2>
                                <p className="mt-2 text-xs text-zinc-500">
                                    {formatTime(submissions[submitting.id]!.submittedAt)} · {submissions[submitting.id]!.contentReferences.length} 项成果
                                </p>
                            </section>
                        ) : null}
                    </div>
                ) : null}
            </Drawer>
        </main>
    );
}

function AssignmentList({ items, submissions, actionLabel, onOpen }: { items: TeachingAssignment[]; submissions: Record<string, TeachingSubmission | undefined>; actionLabel: string; onOpen: (assignment: TeachingAssignment) => void }) {
    return (
        <div className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {items.map((assignment) => {
                const submission = submissions[assignment.id];
                return (
                    <article key={assignment.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="truncate text-sm font-medium">{assignment.title}</h2>
                                <AssignmentKind kind={assignment.kind} />
                                {submission ? <SubmissionStatus status={submission.status} /> : <Tag>未提交</Tag>}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{assignment.instructions || "暂无说明"}</p>
                            <p className="mt-1 truncate text-xs text-zinc-500">
                                {assignment.courseTitle} · {assignment.className}
                            </p>
                            {assignment.dueAt ? <p className="mt-1 text-xs text-zinc-500">截止 {formatTime(assignment.dueAt)}</p> : null}
                        </div>
                        <Button className="shrink-0 self-start sm:self-auto" size="small" icon={submission || assignment.status === "closed" ? <Eye className="size-3.5" /> : <ClipboardList className="size-3.5" />} onClick={() => void onOpen(assignment)}>
                            {assignment.status === "published" && (!submission || submission.status === "revision_required") ? actionLabel : "查看详情"}
                        </Button>
                    </article>
                );
            })}
            {!items.length ? <EmptyText text="暂无对应作业" /> : null}
        </div>
    );
}

function ResponsiveGrid({ children, empty, emptyText }: { children: ReactNode; empty: boolean; emptyText: string }) {
    if (empty) return <EmptyText text={emptyText} />;
    return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function CourseDetail({ course }: { course: PlatformCourse }) {
    const body = typeof course.content.body === "string" ? course.content.body : "";
    return (
        <div className="space-y-5">
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">{body || course.summary || "暂无正文"}</p>
            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <h2 className="text-sm font-medium">课时</h2>
                <div className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
                    {course.chapters.map((item, index) => (
                        <div key={`${index}-${outlineTitle(item)}`} className="py-2">
                            <div className="text-sm font-medium">{outlineTitle(item) || `课时 ${index + 1}`}</div>
                            {outlineDescription(item) ? <p className="mt-1 text-xs leading-5 text-zinc-500">{outlineDescription(item)}</p> : null}
                        </div>
                    ))}
                    {!course.chapters.length ? <p className="py-3 text-sm text-zinc-500">暂无课时</p> : null}
                </div>
            </section>
            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <h2 className="text-sm font-medium">课程附件</h2>
                <ResourceList values={course.attachments} emptyText="暂无课程附件" />
            </section>
        </div>
    );
}

function ResourceList({ values, emptyText }: { values: unknown[]; emptyText: string }) {
    return (
        <div className="mt-2 space-y-2">
            {values.map((value, index) => {
                const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
                const title = typeof source.title === "string" ? source.title : `附件 ${index + 1}`;
                const url = typeof source.url === "string" ? source.url : "";
                return url ? (
                    <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="block truncate text-cyan-700 hover:underline dark:text-cyan-300">
                        {title}
                    </a>
                ) : (
                    <div key={index} className="text-sm text-zinc-500">
                        {title}
                    </div>
                );
            })}
            {!values.length ? <p className="text-sm text-zinc-500">{emptyText}</p> : null}
        </div>
    );
}

async function loadReferenceCandidates(page: number): Promise<{ items: ReferenceCandidate[]; hasMore: boolean }> {
    const results = await Promise.allSettled([
        listWorkPublications({ page, pageSize: PAGE_SIZE }),
        listCanvasProjectSummaries({ page, pageSize: PAGE_SIZE }),
        listDramaProjectSummaries({ page, pageSize: PAGE_SIZE }),
        listLibraryAssetPage({ page, pageSize: PAGE_SIZE }),
    ]);
    const candidates: ReferenceCandidate[] = [];
    const works = results[0].status === "fulfilled" ? results[0].value.items : [];
    const canvases = results[1].status === "fulfilled" ? results[1].value.projects : [];
    const dramas = results[2].status === "fulfilled" ? results[2].value.projects : [];
    const assets = results[3].status === "fulfilled" ? results[3].value.assets : [];
    candidates.push(...works.map((item) => ({ reference: { type: "work" as const, id: item.id }, title: item.currentVersion?.title || item.slug, detail: "作品" })));
    candidates.push(...canvases.map((item) => ({ reference: { type: "canvas" as const, id: item.id }, title: item.title, detail: `Canvas · ${item.nodeCount} 个节点` })));
    candidates.push(...dramas.map((item) => ({ reference: { type: "drama" as const, id: item.id }, title: item.title, detail: `短剧 · ${item.episodeCount} 集` })));
    candidates.push(...assets.map((item) => ({ reference: { type: "asset" as const, id: item.id }, title: item.title, detail: `素材 · ${assetKindLabel(item.kind)}` })));
    const hasMore = [
        results[0].status === "fulfilled" && page * results[0].value.pageSize < results[0].value.total,
        results[1].status === "fulfilled" && page * results[1].value.pageSize < results[1].value.total,
        results[2].status === "fulfilled" && page * results[2].value.pageSize < results[2].value.total,
        results[3].status === "fulfilled" && page * results[3].value.pageSize < results[3].value.total,
    ].some(Boolean);
    return { items: candidates, hasMore };
}

function uniqueCandidates(items: ReferenceCandidate[]) {
    return [...new Map(items.map((item) => [referenceKey(item.reference), item])).values()];
}

function AssignmentKind({ kind }: Pick<TeachingAssignment, "kind">) {
    if (kind === "commercial_practice") return <Tag color="purple">实训</Tag>;
    if (kind === "lesson") return <Tag color="cyan">课时</Tag>;
    return <Tag color="blue">作业</Tag>;
}

function SubmissionStatus({ status }: Pick<TeachingSubmission, "status">) {
    if (status === "reviewed")
        return (
            <Tag icon={<CheckCircle2 className="size-3" />} color="green">
                已批改
            </Tag>
        );
    if (status === "revision_required") return <Tag color="orange">待修改</Tag>;
    return <Tag color="blue">已提交</Tag>;
}

function outlineTitle(value: unknown) {
    return value && typeof value === "object" && typeof (value as Record<string, unknown>).title === "string" ? String((value as Record<string, unknown>).title) : "";
}

function outlineDescription(value: unknown) {
    return value && typeof value === "object" && typeof (value as Record<string, unknown>).description === "string" ? String((value as Record<string, unknown>).description) : "";
}

function referenceKey(reference: SchoolContentReference) {
    return `${reference.type}:${reference.id}`;
}

function assetKindLabel(kind: "text" | "image" | "video" | "audio") {
    return kind === "text" ? "文本" : kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
}

function EmptyText({ text }: { text: string }) {
    return <div className="py-10 text-center text-sm text-zinc-500">{text}</div>;
}

function formatTime(value: string) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? "-" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(time);
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
