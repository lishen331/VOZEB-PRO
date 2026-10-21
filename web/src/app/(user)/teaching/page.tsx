"use client";

import { Form } from "antd";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Select } from "@/components/gamma-ui/gamma-ant-select";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Drawer, Modal } from "@/components/gamma-ui/gamma-ant-modal";
import { Tabs } from "@/components/gamma-ui/gamma-ant-overlay";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Button, Checkbox, Pagination, Spin, Tag } from "@/components/gamma-ui/gamma-ant";
import { BookOpen, ClipboardCheck, Eye, PackageCheck, Plus, RefreshCw, Send, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
    CommercialOrderDelivery,
    CommercialOrderParticipantCandidate,
    CommercialOrderParticipantSubmission,
    SchoolCommercialOrder,
    SchoolContentReference,
    SchoolCourseAssignment,
    SchoolCourseOffering,
    SchoolPublicIdentity,
    TeachingAssignment,
    TeachingAssignmentKind,
    TeachingSubmission,
} from "@/lib/school-domain";
import { listCanvasProjectSummaries } from "@/services/api/canvas-projects";
import { commercialOrdersApi, type CommercialOrderSubmissions } from "@/services/api/commercial-orders";
import { coursesApi } from "@/services/api/courses";
import { listDramaProjectSummaries } from "@/services/api/drama-projects";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import { listWorkPublications } from "@/services/api/work-publications";
import { useSchoolContextStore } from "@/stores/use-school-context-store";
import { ProductionGroupMemberPanel } from "@/components/school/production-group-member-panel";
import { SubmissionReferenceList } from "@/components/school/submission-reference-list";
import { useUserStore } from "@/stores/use-user-store";
import { AssignmentCreateModal } from "./teaching-assignment-modal";
import { TeachingPrepBoard } from "./teaching-prep-board";
import { parseTeachingTab, teachingCourseHref, teachingHref, TEACHING_TAB_LABELS, type TeachingTab } from "./teaching-routes";
import { usePreparedLessons } from "./use-prepared-lessons";

type ReviewForm = { feedback: string };
type CommercialDeliveryForm = { note?: string };
type ReferenceCandidate = { reference: SchoolContentReference; title: string; detail: string };
const PAGE_SIZE = 12;

export default function TeachingPage() {
    const { message } = App.useApp();
    const context = useSchoolContextStore((state) => state.context);
    const user = useUserStore((state) => state.user);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { prepared } = usePreparedLessons(user?.id);
    const [reviewForm] = Form.useForm<ReviewForm>();
    const [offerings, setOfferings] = useState<SchoolCourseOffering[]>([]);
    const [courses, setCourses] = useState<SchoolCourseAssignment[]>([]);
    const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
    const [submissions, setSubmissions] = useState<TeachingSubmission[]>([]);
    const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [assignmentOpen, setAssignmentOpen] = useState(false);
    const [courseTrees, setCourseTrees] = useState<Record<string, Awaited<ReturnType<typeof coursesApi.getSchoolCourseTree>>>>({});
    const [creatingForOfferingId, setCreatingForOfferingId] = useState("");
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
    // 标签页写在地址里（/teaching?tab=…），从课程备课页返回时能回到原来的标签
    const activeTab = parseTeachingTab(searchParams.get("tab"));
    const setActiveTab = (tab: string) => router.replace(teachingHref(parseTeachingTab(tab)), { scroll: false });
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
            const treeEntries = await Promise.all(
                courseResult.items.map(async (item) => {
                    try {
                        return [item.id, await coursesApi.getSchoolCourseTree(item.id)] as const;
                    } catch {
                        return null;
                    }
                }),
            );
            setCourseTrees(Object.fromEntries(treeEntries.filter((entry): entry is readonly [string, Awaited<ReturnType<typeof coursesApi.getSchoolCourseTree>>] => Boolean(entry))));
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
        setCreatingForOfferingId(offeringId || "");
        setAssignmentOpen(true);
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
        reviewForm.resetFields();
        reviewForm.setFieldsValue({ feedback: submission.feedback || "" });
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

    const teacherName = user?.displayName || user?.username || "老师";
    const tabs = [
        {
            key: "prep",
            label: TEACHING_TAB_LABELS.prep,
            children: <TeachingPrepBoard teacherName={teacherName} schoolName={context?.school.name} courses={courses} offerings={offerings} prepared={prepared} loading={loading} />,
        },
        {
            key: "classes",
            label: TEACHING_TAB_LABELS.classes,
            children: (
                <ResponsiveGrid empty={!classOfferings.length && !loading} emptyText="暂无负责班级">
                    {classOfferings.map((offering) => (
                        <article key={offering.classId} className="rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-4 ring-1 ring-[var(--gm-border)]">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="truncate text-sm font-medium">{offering.className}</h2>
                                    <p className="mt-1 truncate text-xs text-[var(--gm-text-3)]">{offering.courseTitle}</p>
                                </div>
                                <OfferingStatus status={offering.status} />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <Link
                                    href={teachingCourseHref(offering.assignmentId, { from: "classes" })}
                                    className="inline-flex h-7 items-center gap-1 rounded-[var(--gm-radius-sm)] px-2.5 text-xs font-medium text-[var(--gm-text)] ring-1 ring-[var(--gm-border-strong)] transition-colors hover:bg-[var(--gm-wash)]"
                                >
                                    <BookOpen className="size-3.5" />
                                    进入备课
                                </Link>
                                <Button size="small" icon={<Plus className="size-3.5" />} disabled={offering.status !== "active"} onClick={() => openCreate(offering.id)}>
                                    布置作业
                                </Button>
                            </div>
                        </article>
                    ))}
                </ResponsiveGrid>
            ),
        },
        {
            key: "assignments",
            label: TEACHING_TAB_LABELS.assignments,
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
            label: TEACHING_TAB_LABELS.submissions,
            children: (
                <section className="space-y-3">
                    <Select className="w-full sm:max-w-md" value={selectedAssignmentId || undefined} placeholder="选择作业" options={assignments.map((item) => ({ value: item.id, label: item.title }))} onChange={selectAssignment} />
                    <SubmissionList submissions={submissions} canReview={selectedAssignment?.status === "published"} onReview={openReview} />
                </section>
            ),
        },
        {
            key: "orders",
            label: TEACHING_TAB_LABELS.orders,
            children: <CommercialOrdersTab />,
        },
    ];

    const pagination: Partial<Record<TeachingTab, { current: number; total: number; onChange: (page: number) => void }>> = {
        prep: { current: coursePage, total: courseTotal, onChange: setCoursePage },
        classes: { current: offeringPage, total: offeringTotal, onChange: setOfferingPage },
        assignments: { current: assignmentPage, total: assignmentTotal, onChange: setAssignmentPage },
        submissions: { current: submissionPage, total: submissionTotal, onChange: setSubmissionPage },
    };
    const page = pagination[activeTab];

    return (
        <main className="h-full min-h-0 overflow-y-auto px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
                <header className="flex items-start justify-between gap-3 pb-2">
                    <div className="min-w-0">
                        <h1 className="flex items-center gap-2 truncate text-lg font-semibold text-[var(--gm-text)] sm:text-xl">
                            <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full bg-[image:var(--gm-gradient)]" />
                            教学中心
                        </h1>
                        <p className="mt-1 text-xs text-[var(--gm-text-3)] sm:text-sm">{context?.school.name || "学校课程与作业"}</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} aria-label="刷新教学中心" loading={loading} onClick={() => void load()} />
                </header>
                <ProductionGroupMemberPanel />
                {loading && !courses.length && !assignments.length && activeTab !== "prep" ? (
                    <div className="flex min-h-40 items-center justify-center">
                        <Spin />
                    </div>
                ) : (
                    <>
                        <Tabs destroyOnHidden className="pt-2" activeKey={activeTab} items={tabs} onChange={setActiveTab} />
                        {page ? <Pagination className="mt-4" current={page.current} pageSize={PAGE_SIZE} total={page.total} hideOnSinglePage showSizeChanger={false} responsive onChange={page.onChange} /> : null}
                    </>
                )}
            </div>

            <AssignmentCreateModal open={assignmentOpen} offerings={offerings} courseTrees={courseTrees} initial={{ offeringId: creatingForOfferingId || undefined }} onClose={() => setAssignmentOpen(false)} onCreated={load} />

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

function CommercialOrdersTab() {
    const { message } = App.useApp();
    const [deliveryForm] = Form.useForm<CommercialDeliveryForm>();
    const [orders, setOrders] = useState<SchoolCommercialOrder[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<SchoolCommercialOrder | null>(null);
    const [details, setDetails] = useState<CommercialOrderSubmissions | null>(null);
    const [detailPage, setDetailPage] = useState(1);
    const [detailLoading, setDetailLoading] = useState(false);
    const [participantsOpen, setParticipantsOpen] = useState(false);
    const [participantIds, setParticipantIds] = useState<string[]>([]);
    const [participantOptions, setParticipantOptions] = useState<CommercialOrderParticipantCandidate[]>([]);
    const [deliveryOpen, setDeliveryOpen] = useState(false);
    const [candidates, setCandidates] = useState<ReferenceCandidate[]>([]);
    const [selectedReferences, setSelectedReferences] = useState<SchoolContentReference[]>([]);
    const [candidatePage, setCandidatePage] = useState(1);
    const [candidateHasMore, setCandidateHasMore] = useState(false);
    const [candidateLoading, setCandidateLoading] = useState(false);
    const listRequestSequence = useRef(0);
    const detailRequestSequence = useRef(0);
    const participantRequestSequence = useRef(0);
    const candidateRequestSequence = useRef(0);

    const loadOrders = useCallback(async () => {
        const requestId = ++listRequestSequence.current;
        setLoading(true);
        try {
            const result = await commercialOrdersApi.listTeachingCommercialOrders({ page, pageSize: PAGE_SIZE });
            if (requestId !== listRequestSequence.current) return;
            setOrders(result.items);
            setTotal(result.total);
        } catch (error) {
            if (requestId !== listRequestSequence.current) return;
            setOrders([]);
            setTotal(0);
            message.error(errorMessage(error, "商单任务加载失败"));
        } finally {
            if (requestId === listRequestSequence.current) setLoading(false);
        }
    }, [message, page]);

    const loadDetails = useCallback(
        async (orderId: string, targetPage: number) => {
            const requestId = ++detailRequestSequence.current;
            setDetailLoading(true);
            try {
                const result = await commercialOrdersApi.listCommercialOrderSubmissions(orderId, { page: targetPage, pageSize: PAGE_SIZE });
                if (requestId !== detailRequestSequence.current) return;
                setDetails(result);
                setSelectedOrder(result.order);
            } catch (error) {
                if (requestId !== detailRequestSequence.current) return;
                setDetails(null);
                message.error(errorMessage(error, "商单详情加载失败"));
            } finally {
                if (requestId === detailRequestSequence.current) setDetailLoading(false);
            }
        },
        [message],
    );

    const selectedOrderId = selectedOrder?.id;

    useEffect(() => void loadOrders(), [loadOrders]);
    useEffect(() => {
        if (selectedOrderId) void loadDetails(selectedOrderId, detailPage);
    }, [detailPage, loadDetails, selectedOrderId]);
    useEffect(
        () => () => {
            listRequestSequence.current += 1;
            detailRequestSequence.current += 1;
            participantRequestSequence.current += 1;
            candidateRequestSequence.current += 1;
        },
        [],
    );

    const openOrder = (order: SchoolCommercialOrder) => {
        setDetails(null);
        setDetailPage(1);
        setSelectedOrder(order);
    };

    const closeOrder = () => {
        detailRequestSequence.current += 1;
        setSelectedOrder(null);
        setDetails(null);
        setDetailLoading(false);
    };

    const refreshSelectedOrder = async () => {
        await loadOrders();
        if (selectedOrderId) await loadDetails(selectedOrderId, detailPage);
    };

    const openParticipants = async (order: SchoolCommercialOrder) => {
        const requestId = ++participantRequestSequence.current;
        setSaving(true);
        try {
            const result = await commercialOrdersApi.listCommercialOrderParticipantCandidates(order.id, { page: 1, pageSize: PAGE_SIZE });
            if (requestId !== participantRequestSequence.current) return;
            setParticipantOptions(mergeParticipantCandidates([], result.items, result.selectedMembershipIds));
            setParticipantIds(result.selectedMembershipIds);
            setParticipantsOpen(true);
        } catch (error) {
            if (requestId !== participantRequestSequence.current) return;
            message.error(errorMessage(error, "参与学生加载失败"));
        } finally {
            if (requestId === participantRequestSequence.current) setSaving(false);
        }
    };

    const searchParticipantCandidates = async (keyword: string) => {
        const order = selectedOrder;
        if (!order || order.status !== "assigned") return;
        const requestId = ++participantRequestSequence.current;
        try {
            const result = await commercialOrdersApi.listCommercialOrderParticipantCandidates(order.id, { page: 1, pageSize: PAGE_SIZE, keyword: keyword.trim() || undefined });
            if (requestId !== participantRequestSequence.current) return;
            setParticipantOptions((current) => mergeParticipantCandidates(current, result.items, participantIds));
        } catch (error) {
            if (requestId === participantRequestSequence.current) message.error(errorMessage(error, "参与学生搜索失败"));
        }
    };

    const closeParticipants = () => {
        participantRequestSequence.current += 1;
        setParticipantsOpen(false);
        setParticipantOptions([]);
    };

    const saveParticipants = async () => {
        if (!selectedOrder || selectedOrder.status !== "assigned" || !participantIds.length) return;
        setSaving(true);
        try {
            await commercialOrdersApi.configureCommercialOrderParticipants(selectedOrder.id, participantIds);
            message.success("参与学生已更新");
            closeParticipants();
            await refreshSelectedOrder();
        } catch (error) {
            message.error(errorMessage(error, "参与学生更新失败"));
        } finally {
            setSaving(false);
        }
    };

    const openDelivery = async (latest: CommercialOrderDelivery | undefined) => {
        const requestId = ++candidateRequestSequence.current;
        deliveryForm.resetFields();
        deliveryForm.setFieldsValue({ note: latest?.note || "" });
        setSelectedReferences(latest?.contentReferences || []);
        setDeliveryOpen(true);
        setCandidateLoading(true);
        try {
            const result = await loadReferenceCandidates(1);
            if (requestId !== candidateRequestSequence.current) return;
            setCandidates(result.items);
            setCandidatePage(1);
            setCandidateHasMore(result.hasMore);
        } catch (error) {
            if (requestId !== candidateRequestSequence.current) return;
            setCandidates([]);
            setCandidateHasMore(false);
            message.error(errorMessage(error, "成果列表加载失败"));
        } finally {
            if (requestId === candidateRequestSequence.current) setCandidateLoading(false);
        }
    };

    const loadMoreCandidates = async () => {
        const requestId = ++candidateRequestSequence.current;
        const nextPage = candidatePage + 1;
        setCandidateLoading(true);
        try {
            const result = await loadReferenceCandidates(nextPage);
            if (requestId !== candidateRequestSequence.current) return;
            setCandidates((current) => uniqueReferenceCandidates([...current, ...result.items]));
            setCandidatePage(nextPage);
            setCandidateHasMore(result.hasMore);
        } catch (error) {
            if (requestId !== candidateRequestSequence.current) return;
            message.error(errorMessage(error, "成果列表加载失败"));
        } finally {
            if (requestId === candidateRequestSequence.current) setCandidateLoading(false);
        }
    };

    const closeDelivery = () => {
        candidateRequestSequence.current += 1;
        setDeliveryOpen(false);
        setCandidateLoading(false);
        setCandidates([]);
    };

    const toggleReference = (reference: SchoolContentReference, checked: boolean) => {
        const key = referenceKey(reference);
        setSelectedReferences((current) => (checked ? [...current.filter((item) => referenceKey(item) !== key), reference] : current.filter((item) => referenceKey(item) !== key)));
    };

    const submitDelivery = async (values: CommercialDeliveryForm) => {
        const order = selectedOrder;
        if (!order || !(order.status !== "accepted" && (order.status === "in_progress" || order.status === "revision_required"))) return;
        if (!selectedReferences.length) {
            message.error("正式交付至少选择一项成果");
            return;
        }
        setSaving(true);
        try {
            await commercialOrdersApi.submitCommercialOrderDelivery(order.id, { note: values.note?.trim() || "", references: selectedReferences });
            message.success(order.status === "revision_required" ? "修改成果已重新交付" : "正式交付已提交");
            setDeliveryOpen(false);
            setCandidates([]);
            setSelectedReferences([]);
            await refreshSelectedOrder();
        } catch (error) {
            message.error(errorMessage(error, "正式交付失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="space-y-3">
            <div className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {orders.map((order) => (
                    <article key={order.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="truncate text-sm font-medium">{order.title}</h2>
                                <CommercialOrderStatusTag status={order.status} />
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{order.requirements || "暂无制作要求"}</p>
                            <p className="mt-1 text-xs text-zinc-500">{order.deadlineAt ? `截止 ${formatTime(order.deadlineAt)}` : "未设置截止时间"}</p>
                        </div>
                        <Button className="shrink-0 self-start sm:self-auto" size="small" icon={<Eye className="size-3.5" />} onClick={() => openOrder(order)}>
                            查看任务
                        </Button>
                    </article>
                ))}
                {!loading && !orders.length ? <EmptyText text="暂无负责商单" /> : null}
                {loading && !orders.length ? (
                    <div className="flex min-h-32 items-center justify-center">
                        <Spin />
                    </div>
                ) : null}
            </div>
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />

            <Drawer title={selectedOrder?.title || "商单详情"} open={Boolean(selectedOrder)} destroyOnHidden size="min(720px, 100vw)" onClose={closeOrder}>
                {selectedOrder ? (
                    <Spin spinning={detailLoading}>
                        <div className="space-y-5 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                                <CommercialOrderStatusTag status={selectedOrder.status} />
                                {selectedOrder.deadlineAt ? <span className="text-xs text-zinc-500">截止 {formatTime(selectedOrder.deadlineAt)}</span> : null}
                            </div>
                            <CommercialOrderSection title="制作要求" text={selectedOrder.requirements || "暂无制作要求"} />
                            <CommercialOrderSection title="验收标准" text={selectedOrder.acceptanceCriteria || "暂无验收标准"} />
                            {selectedOrder.platformFeedback ? <CommercialOrderSection title="平台反馈" text={selectedOrder.platformFeedback} tone="warning" /> : null}
                            {selectedOrder.referenceMaterials.length ? (
                                <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                                    <h2 className="font-medium">参考资料</h2>
                                    <ResourceList values={selectedOrder.referenceMaterials} emptyText="暂无参考资料" />
                                </section>
                            ) : null}
                            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h2 className="font-medium">参与学生与候选成果</h2>
                                    {selectedOrder.status !== "accepted" ? (
                                        selectedOrder.status === "assigned" ? (
                                            <Button size="small" icon={<Users className="size-3.5" />} loading={saving} onClick={() => void openParticipants(selectedOrder)}>
                                                安排参与学生
                                            </Button>
                                        ) : null
                                    ) : null}
                                </div>
                                <CommercialParticipantList items={details?.participants.items || []} />
                            </section>
                            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h2 className="font-medium">正式交付记录</h2>
                                    {selectedOrder.status !== "accepted" ? (
                                        selectedOrder.status === "in_progress" || selectedOrder.status === "revision_required" ? (
                                            <Button type="primary" size="small" icon={<PackageCheck className="size-3.5" />} onClick={() => void openDelivery(details?.deliveries.items[0])}>
                                                {selectedOrder.status === "revision_required" ? "重新正式交付" : "正式交付"}
                                            </Button>
                                        ) : null
                                    ) : null}
                                </div>
                                <CommercialDeliveryList items={details?.deliveries.items || []} />
                            </section>
                            <Pagination current={detailPage} pageSize={PAGE_SIZE} total={Math.max(details?.participants.total || 0, details?.deliveries.total || 0)} hideOnSinglePage showSizeChanger={false} responsive onChange={setDetailPage} />
                        </div>
                    </Spin>
                ) : null}
            </Drawer>

            <Modal
                title="安排参与学生"
                open={participantsOpen}
                destroyOnHidden
                width="min(560px, calc(100vw - 24px))"
                okText="保存安排"
                cancelText="取消"
                confirmLoading={saving}
                okButtonProps={{ disabled: !participantIds.length }}
                onOk={() => void saveParticipants()}
                onCancel={closeParticipants}
            >
                <p className="mb-3 text-sm leading-6 text-zinc-500">按公开账号 ID、用户名或姓名搜索本校可用学生。</p>
                <Select
                    className="w-full"
                    mode="multiple"
                    showSearch
                    value={participantIds}
                    placeholder="选择参与学生"
                    filterOption={false}
                    options={participantOptions.map((item) => ({ value: item.membershipId, label: publicIdentityLabel(item.participant) }))}
                    onChange={setParticipantIds}
                    onSearch={(value) => void searchParticipantCandidates(value)}
                />
            </Modal>

            <Modal
                title={selectedOrder?.status === "revision_required" ? "重新正式交付" : "正式交付"}
                open={deliveryOpen}
                destroyOnHidden
                width="min(720px, calc(100vw - 24px))"
                okText="提交交付"
                cancelText="取消"
                confirmLoading={saving}
                afterOpenChange={(open) => {
                    if (!open) deliveryForm.resetFields();
                }}
                onOk={() => deliveryForm.submit()}
                onCancel={closeDelivery}
            >
                <Form form={deliveryForm} layout="vertical" preserve={false} onFinish={(values) => void submitDelivery(values)}>
                    <Form.Item label="交付说明" name="note">
                        <Input.TextArea rows={4} maxLength={2000} showCount />
                    </Form.Item>
                    <section>
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-sm font-medium">选择现有成果</h2>
                            <span className="text-xs text-zinc-500">已选 {selectedReferences.length} 项</span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {candidates.map((candidate) => {
                                const checked = selectedReferences.some((item) => referenceKey(item) === referenceKey(candidate.reference));
                                return (
                                    <label key={referenceKey(candidate.reference)} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                                        <Checkbox checked={checked} onChange={(event) => toggleReference(candidate.reference, event.target.checked)} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm">{candidate.title}</span>
                                            <span className="mt-0.5 block truncate text-xs text-zinc-500">{candidate.detail}</span>
                                        </span>
                                    </label>
                                );
                            })}
                            {!candidateLoading && !candidates.length ? <p className="py-5 text-sm text-zinc-500 sm:col-span-2">暂无可交付成果</p> : null}
                        </div>
                        {candidateHasMore ? (
                            <Button className="mt-3" loading={candidateLoading} onClick={() => void loadMoreCandidates()}>
                                加载更多
                            </Button>
                        ) : null}
                        {candidateLoading && !candidates.length ? (
                            <div className="flex min-h-24 items-center justify-center">
                                <Spin />
                            </div>
                        ) : null}
                    </section>
                </Form>
            </Modal>
        </section>
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
                    <SubmissionReferenceList references={submission.resolvedContentReferences} />
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

function CommercialParticipantList({ items }: { items: CommercialOrderParticipantSubmission[] }) {
    return (
        <div className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((item) => (
                <article key={item.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                            <div className="truncate font-medium">{item.participant.displayName || "成员信息不可用"}</div>
                            {item.participant.accountId ? <div className="mt-0.5 text-xs text-zinc-500">ID：{item.participant.accountId}</div> : null}
                        </div>
                        <Tag color={item.status === "submitted" ? "blue" : undefined}>{item.status === "submitted" ? "已交候选" : "待提交"}</Tag>
                    </div>
                    {item.note ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.note}</p> : null}
                    <p className="mt-1 text-xs text-zinc-500">候选成果 {item.candidateReferences.length} 项</p>
                </article>
            ))}
            {!items.length ? <p className="py-5 text-sm text-zinc-500">暂无参与学生</p> : null}
        </div>
    );
}

function CommercialDeliveryList({ items }: { items: CommercialOrderDelivery[] }) {
    return (
        <div className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((item) => (
                <article key={item.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="font-medium">{item.submittedBy.displayName || "成员信息不可用"}</div>
                            <div className="mt-0.5 text-xs text-zinc-500">{formatTime(item.submittedAt)}</div>
                        </div>
                        <Tag color={item.status === "accepted" ? "green" : item.status === "revision_required" ? "orange" : "blue"}>{item.status === "accepted" ? "已验收" : item.status === "revision_required" ? "待修改" : "待验收"}</Tag>
                    </div>
                    {item.note ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.note}</p> : null}
                    <p className="mt-1 text-xs text-zinc-500">交付成果 {item.contentReferences.length} 项</p>
                    {item.platformFeedback ? <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">{item.platformFeedback}</p> : null}
                </article>
            ))}
            {!items.length ? <p className="py-5 text-sm text-zinc-500">暂无正式交付记录</p> : null}
        </div>
    );
}

function CommercialOrderSection({ title, text, tone = "default" }: { title: string; text: string; tone?: "default" | "warning" }) {
    return (
        <section className={tone === "warning" ? "rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30" : "border-t border-zinc-200 pt-4 dark:border-zinc-800"}>
            <h2 className="font-medium">{title}</h2>
            <p className={tone === "warning" ? "mt-2 whitespace-pre-wrap leading-6 text-amber-900 dark:text-amber-200" : "mt-2 whitespace-pre-wrap leading-6 text-zinc-600 dark:text-zinc-300"}>{text}</p>
        </section>
    );
}

function CommercialOrderStatusTag({ status }: Pick<SchoolCommercialOrder, "status">) {
    const labels = {
        draft: "草稿",
        assigned: "待开始",
        in_progress: "制作中",
        submitted: "待验收",
        revision_required: "待修改",
        accepted: "已验收",
        cancelled: "已取消",
    } as const;
    const colors = { draft: "gold", assigned: "cyan", in_progress: "blue", submitted: "purple", revision_required: "orange", accepted: "green", cancelled: undefined } as const;
    return <Tag color={colors[status]}>{labels[status]}</Tag>;
}

function ResponsiveGrid({ children, empty, emptyText }: { children: React.ReactNode; empty: boolean; emptyText: string }) {
    if (empty) return <EmptyText text={emptyText} />;
    return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
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

function uniqueReferenceCandidates(items: ReferenceCandidate[]) {
    return [...new Map(items.map((item) => [referenceKey(item.reference), item])).values()];
}

function referenceKey(reference: SchoolContentReference) {
    return `${reference.type}:${reference.id}`;
}

function mergeParticipantCandidates(current: CommercialOrderParticipantCandidate[], incoming: CommercialOrderParticipantCandidate[], selectedMembershipIds: string[]) {
    const selected = new Set(selectedMembershipIds);
    const merged = new Map(current.filter((item) => selected.has(item.membershipId)).map((item) => [item.membershipId, item]));
    for (const item of incoming) merged.set(item.membershipId, item);
    for (const membershipId of selected) {
        if (!merged.has(membershipId)) merged.set(membershipId, { membershipId, participant: { accountId: "", username: "", displayName: "已安排学生（搜索可查看身份）" } });
    }
    return [...merged.values()];
}

function publicIdentityLabel(identity: SchoolPublicIdentity) {
    return identity.accountId ? `${identity.displayName || "成员信息不可用"} · ID：${identity.accountId}` : identity.displayName || "成员信息不可用";
}

function assetKindLabel(kind: string) {
    return ({ image: "图片", video: "视频", audio: "音频", document: "文档" } as Record<string, string>)[kind] || "素材";
}

function formatTime(value: string) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? "-" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(time);
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
