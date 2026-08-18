"use client";

import type { TableColumnsType } from "antd";
import { App, Button, Drawer, Form, Input, InputNumber, Modal, Pagination, Select, Table, Tag } from "antd";
import { CheckCircle2, Eye, Pencil, Plus, RefreshCw, RotateCcw, School, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AdminCommercialOrder, AdminCommercialOrderDetails, CommercialOrderInput, CommercialOrderStatus, SchoolSummary } from "@/lib/school-domain";
import { adminEducationApi } from "@/services/api/admin-education";
import { commercialOrdersApi } from "@/services/api/commercial-orders";

const PAGE_SIZE = 12;
type OrderForm = Omit<CommercialOrderInput, "internalAmountCents" | "referenceMaterials"> & { internalAmountYuan: number; referenceUrls?: string[] };
type ReviewForm = { feedback?: string };

export function AdminCommercialOrdersSection() {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<OrderForm>();
    const [reviewForm] = Form.useForm<ReviewForm>();
    const [items, setItems] = useState<AdminCommercialOrder[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [queryKeyword, setQueryKeyword] = useState("");
    const [status, setStatus] = useState<CommercialOrderStatus>();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<AdminCommercialOrder | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [assigning, setAssigning] = useState<AdminCommercialOrder | null>(null);
    const [schools, setSchools] = useState<SchoolSummary[]>([]);
    const [schoolId, setSchoolId] = useState<string>();
    const [details, setDetails] = useState<AdminCommercialOrderDetails | null>(null);
    const [assignedSchool, setAssignedSchool] = useState<SchoolSummary | null>(null);
    const [deliveryPage, setDeliveryPage] = useState(1);
    const [reviewing, setReviewing] = useState<"revision_required" | "accepted" | null>(null);
    const schoolRequestSequence = useRef(0);
    const detailRequestSequence = useRef(0);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await commercialOrdersApi.listPlatformCommercialOrders({ page, pageSize: PAGE_SIZE, keyword: queryKeyword || undefined, status });
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            setItems([]);
            setTotal(0);
            message.error(errorMessage(error, "商单列表加载失败"));
        } finally {
            setLoading(false);
        }
    }, [message, page, queryKeyword, status]);

    useEffect(() => void load(), [load]);

    const openEditor = (order: AdminCommercialOrder | null) => {
        form.resetFields();
        form.setFieldsValue(
            order
                ? {
                      title: order.title,
                      requirements: order.requirements,
                      acceptanceCriteria: order.acceptanceCriteria,
                      internalAmountYuan: order.internalAmountCents / 100,
                      deadlineAt: toLocalDateTime(order.deadlineAt),
                      referenceUrls: referenceUrls(order.referenceMaterials),
                  }
                : { internalAmountYuan: 0, referenceUrls: [] },
        );
        setEditing(order);
        setEditorOpen(true);
    };

    const save = async (values: OrderForm) => {
        setSaving(true);
        try {
            const input: CommercialOrderInput = {
                title: values.title.trim(),
                requirements: values.requirements?.trim() || "",
                acceptanceCriteria: values.acceptanceCriteria?.trim() || "",
                internalAmountCents: Math.round(Number(values.internalAmountYuan) * 100),
                deadlineAt: values.deadlineAt ? new Date(values.deadlineAt).toISOString() : undefined,
                referenceMaterials: (values.referenceUrls || []).map((url) => ({ url })),
            };
            if (editing) await commercialOrdersApi.updateCommercialOrder(editing.id, input);
            else await commercialOrdersApi.createCommercialOrder(input);
            message.success(editing ? "商单已更新" : "商单草稿已创建");
            setEditorOpen(false);
            setEditing(null);
            await load();
        } catch (error) {
            message.error(errorMessage(error, "商单保存失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const searchSchools = async (value: string) => {
        const requestId = ++schoolRequestSequence.current;
        const result = await adminEducationApi.listSchools({ page: 1, pageSize: PAGE_SIZE, status: "active", keyword: value.trim() || undefined });
        if (requestId === schoolRequestSequence.current) setSchools(result.items);
    };

    const openAssign = async (order: AdminCommercialOrder) => {
        setAssigning(order);
        setSchoolId(order.assignedSchoolId);
        setSchools([]);
        try {
            await searchSchools("");
        } catch (error) {
            message.error(errorMessage(error, "学校列表加载失败"));
        }
    };

    const assign = async () => {
        if (!assigning || !schoolId) return;
        setSaving(true);
        try {
            await commercialOrdersApi.assignCommercialOrder(assigning.id, schoolId);
            message.success("承接学校已保存");
            setAssigning(null);
            await load();
        } catch (error) {
            message.error(errorMessage(error, "商单分配失败"));
        } finally {
            setSaving(false);
        }
    };

    const loadDetails = async (orderId: string, nextPage = 1) => {
        const requestId = ++detailRequestSequence.current;
        const value = await commercialOrdersApi.getPlatformCommercialOrder(orderId, { page: nextPage, pageSize: PAGE_SIZE });
        if (requestId !== detailRequestSequence.current) return;
        const school = value.order.assignedSchoolId ? await adminEducationApi.getSchool(value.order.assignedSchoolId).catch(() => null) : null;
        if (requestId !== detailRequestSequence.current) return;
        setDetails(value);
        setDeliveryPage(nextPage);
        setAssignedSchool(school);
    };

    const openDetails = async (order: AdminCommercialOrder) => {
        setLoading(true);
        try {
            await loadDetails(order.id);
        } catch (error) {
            message.error(errorMessage(error, "商单详情加载失败"));
        } finally {
            setLoading(false);
        }
    };

    const cancel = (order: AdminCommercialOrder) => {
        modal.confirm({
            title: `取消“${order.title}”`,
            content: "取消后不能继续配置、制作或提交。",
            okText: "确认取消",
            cancelText: "返回",
            okButtonProps: { danger: true },
            async onOk() {
                await commercialOrdersApi.cancelCommercialOrder(order.id);
                message.success("商单已取消");
                if (details?.order.id === order.id) setDetails(null);
                await load();
            },
        });
    };

    const openReview = (decision: "revision_required" | "accepted") => {
        setReviewing(decision);
        reviewForm.resetFields();
    };

    const review = async (values: ReviewForm) => {
        if (!details || !reviewing) return;
        setSaving(true);
        try {
            await commercialOrdersApi.reviewCommercialOrder(details.order.id, { decision: reviewing, feedback: values.feedback?.trim() || "" });
            message.success(reviewing === "accepted" ? "商单已验收通过" : "商单已退回修改");
            setReviewing(null);
            await Promise.all([loadDetails(details.order.id, 1), load()]);
        } catch (error) {
            message.error(errorMessage(error, "商单验收失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const actions = (order: AdminCommercialOrder) => (
        <div className="flex flex-wrap justify-end gap-1">
            <Button type="text" size="small" icon={<Eye className="size-3.5" />} onClick={() => void openDetails(order)}>
                查看
            </Button>
            {order.status === "accepted" ? null : (
                <>
                    {order.status === "draft" ? (
                        <Button type="text" size="small" icon={<Pencil className="size-3.5" />} onClick={() => openEditor(order)}>
                            编辑
                        </Button>
                    ) : null}
                    {order.status === "draft" || order.status === "assigned" ? (
                        <Button type="text" size="small" icon={<School className="size-3.5" />} onClick={() => void openAssign(order)}>
                            {order.assignedSchoolId ? "更换学校" : "分配学校"}
                        </Button>
                    ) : null}
                    {canCancel(order.status) ? (
                        <Button danger type="text" size="small" icon={<XCircle className="size-3.5" />} onClick={() => cancel(order)}>
                            取消
                        </Button>
                    ) : null}
                </>
            )}
        </div>
    );

    const columns: TableColumnsType<AdminCommercialOrder> = [
        {
            title: "商单",
            render: (_, order) => (
                <div className="min-w-0">
                    <div className="truncate font-medium">{order.title}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{order.requirements || "暂无需求说明"}</div>
                </div>
            ),
        },
        { title: "内部金额", width: 120, render: (_, order) => formatAmount(order.internalAmountCents) },
        { title: "承接学校", width: 110, render: (_, order) => (order.assignedSchoolId ? "已分配" : "未分配") },
        { title: "状态", width: 110, render: (_, order) => <OrderStatus status={order.status} /> },
        { title: "更新时间", width: 168, render: (_, order) => <span className="text-xs text-zinc-500">{formatTime(order.updatedAt)}</span> },
        { title: "操作", width: 290, align: "right", render: (_, order) => actions(order) },
    ];

    return (
        <section className="space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_128px] gap-2 sm:max-w-2xl">
                    <Input.Search
                        value={keyword}
                        allowClear
                        placeholder="搜索商单标题"
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
                        options={[...statusOptions]}
                        onChange={(value) => {
                            setStatus(value);
                            setPage(1);
                        }}
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <Button icon={<RefreshCw className="size-4" />} aria-label="刷新商单列表" loading={loading} onClick={() => void load()} />
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openEditor(null)}>
                        创建商单
                    </Button>
                </div>
            </div>

            <div className="hidden md:block">
                <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={false} scroll={{ x: 980 }} />
            </div>
            <div className="space-y-2 md:hidden" aria-busy={loading}>
                {items.map((order) => (
                    <article key={order.id} className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="truncate text-sm font-medium">{order.title}</h2>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{order.requirements || "暂无需求说明"}</p>
                            </div>
                            <OrderStatus status={order.status} />
                        </div>
                        <div className="mt-2 flex gap-3 text-xs text-zinc-500">
                            <span>{formatAmount(order.internalAmountCents)}</span>
                            <span>{order.assignedSchoolId ? "已分配学校" : "未分配学校"}</span>
                        </div>
                        <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">{actions(order)}</div>
                    </article>
                ))}
                {!loading && !items.length ? <EmptyText text="暂无平台商单" /> : null}
            </div>
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />

            <Drawer
                title={editing ? "编辑商单" : "创建商单"}
                open={editorOpen}
                destroyOnHidden
                size="min(760px, 100vw)"
                afterOpenChange={(open) => {
                    if (!open) form.resetFields();
                }}
                onClose={() => setEditorOpen(false)}
                extra={
                    <Button type="primary" loading={saving} onClick={() => form.submit()}>
                        保存
                    </Button>
                }
            >
                <Form form={form} layout="vertical" requiredMark={false} preserve={false} onFinish={(values) => void save(values)}>
                    <Form.Item label="商单标题" name="title" rules={[{ required: true, message: "请填写商单标题" }]}>
                        <Input maxLength={160} />
                    </Form.Item>
                    <Form.Item label="需求说明" name="requirements">
                        <Input.TextArea rows={5} maxLength={5000} showCount />
                    </Form.Item>
                    <Form.Item label="验收标准" name="acceptanceCriteria">
                        <Input.TextArea rows={4} maxLength={5000} showCount />
                    </Form.Item>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item label="内部金额（元）" name="internalAmountYuan" rules={[{ required: true, message: "请填写内部金额" }]}>
                            <InputNumber className="w-full" min={0} precision={2} />
                        </Form.Item>
                        <Form.Item label="截止时间" name="deadlineAt">
                            <Input type="datetime-local" />
                        </Form.Item>
                    </div>
                    <Form.Item label="参考资料 URL" name="referenceUrls">
                        <Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入 URL 后回车" />
                    </Form.Item>
                </Form>
            </Drawer>

            <Modal
                title={`分配学校${assigning ? ` · ${assigning.title}` : ""}`}
                open={Boolean(assigning)}
                destroyOnHidden
                width="min(560px, calc(100vw - 24px))"
                okText="确认分配"
                cancelText="取消"
                confirmLoading={saving}
                okButtonProps={{ disabled: !schoolId }}
                onOk={() => void assign()}
                onCancel={() => setAssigning(null)}
            >
                <Select
                    className="w-full"
                    showSearch
                    filterOption={false}
                    optionFilterProp="label"
                    placeholder="搜索并选择承接学校"
                    value={schoolId}
                    options={schools.map((school) => ({ value: school.id, label: school.name }))}
                    onChange={setSchoolId}
                    onSearch={(value) => void searchSchools(value)}
                />
            </Modal>

            <Drawer title={details?.order.title || "商单详情"} open={Boolean(details)} destroyOnHidden size="min(760px, 100vw)" onClose={() => setDetails(null)}>
                {details ? <OrderDetails details={details} schoolName={assignedSchool?.name} deliveryPage={deliveryPage} onDeliveryPage={(nextPage) => void loadDetails(details.order.id, nextPage)} onReview={openReview} /> : null}
            </Drawer>

            <Modal
                title={reviewing === "accepted" ? "验收通过" : "退回修改"}
                open={Boolean(reviewing)}
                destroyOnHidden
                width="min(520px, calc(100vw - 24px))"
                okText="确认"
                cancelText="取消"
                confirmLoading={saving}
                afterOpenChange={(open) => {
                    if (!open) reviewForm.resetFields();
                }}
                onOk={() => reviewForm.submit()}
                onCancel={() => setReviewing(null)}
            >
                <Form form={reviewForm} layout="vertical" preserve={false} onFinish={(values) => void review(values)}>
                    <Form.Item label="平台反馈" name="feedback" rules={[{ required: reviewing === "revision_required", message: "退回修改时请填写原因" }]}>
                        <Input.TextArea rows={4} maxLength={5000} showCount />
                    </Form.Item>
                </Form>
            </Modal>
        </section>
    );
}

function OrderDetails({
    details,
    schoolName,
    deliveryPage,
    onDeliveryPage,
    onReview,
}: {
    details: AdminCommercialOrderDetails;
    schoolName?: string;
    deliveryPage: number;
    onDeliveryPage: (page: number) => void;
    onReview: (decision: "revision_required" | "accepted") => void;
}) {
    const order = details.order;
    const latest = details.deliveries.items[0];
    return (
        <div className="space-y-5 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="状态" value={<OrderStatus status={order.status} />} />
                <Detail label="内部金额" value={formatAmount(order.internalAmountCents)} />
                <Detail label="承接学校" value={schoolName || (order.assignedSchoolId ? "已分配学校" : "未分配")} />
                <Detail label="截止时间" value={order.deadlineAt ? formatTime(order.deadlineAt) : "未设置"} />
            </div>
            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <h3 className="font-medium">需求说明</h3>
                <p className="mt-2 whitespace-pre-wrap leading-6 text-zinc-600 dark:text-zinc-300">{order.requirements || "暂无需求说明"}</p>
            </section>
            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <h3 className="font-medium">验收标准</h3>
                <p className="mt-2 whitespace-pre-wrap leading-6 text-zinc-600 dark:text-zinc-300">{order.acceptanceCriteria || "暂无验收标准"}</p>
            </section>
            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <h3 className="font-medium">正式交付</h3>
                <div className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
                    {details.deliveries.items.map((delivery) => (
                        <article key={delivery.id} className="py-3">
                            <div className="flex items-center justify-between gap-2">
                                <span>{delivery.submittedBy.displayName}</span>
                                <Tag>{delivery.contentReferences.length} 项成果</Tag>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">{delivery.note || "未填写说明"}</p>
                            <div className="mt-1 text-xs text-zinc-500">{formatTime(delivery.submittedAt)}</div>
                            {delivery.platformFeedback ? <p className="mt-2 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900">{delivery.platformFeedback}</p> : null}
                        </article>
                    ))}
                    {!details.deliveries.items.length ? <EmptyText text="暂无正式交付" /> : null}
                </div>
                <Pagination className="mt-3" current={deliveryPage} pageSize={details.deliveries.pageSize} total={details.deliveries.total} hideOnSinglePage showSizeChanger={false} responsive onChange={onDeliveryPage} />
            </section>
            {order.status === "submitted" && latest?.status === "submitted" ? (
                <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                    <Button icon={<RotateCcw className="size-4" />} onClick={() => onReview("revision_required")}>
                        退回修改
                    </Button>
                    <Button type="primary" icon={<CheckCircle2 className="size-4" />} onClick={() => onReview("accepted")}>
                        验收通过
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="mt-1">{value}</div>
        </div>
    );
}
function OrderStatus({ status }: { status: CommercialOrderStatus }) {
    const item = statusOptions.find((option) => option.value === status);
    return <Tag color={status === "accepted" ? "green" : status === "revision_required" ? "orange" : status === "submitted" || status === "in_progress" ? "blue" : status === "draft" ? "gold" : undefined}>{item?.label || status}</Tag>;
}
function canCancel(status: CommercialOrderStatus) {
    return status === "draft" || status === "assigned" || status === "in_progress" || status === "revision_required";
}
function referenceUrls(values: unknown[]) {
    return values.flatMap((value) => (value && typeof value === "object" && typeof (value as Record<string, unknown>).url === "string" ? [String((value as Record<string, unknown>).url)] : []));
}
function toLocalDateTime(value?: string) {
    if (!value) return undefined;
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}
function formatAmount(cents: number) {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(cents / 100);
}
function formatTime(value: string) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? "-" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(time);
}
function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
function EmptyText({ text }: { text: string }) {
    return <div className="py-8 text-center text-sm text-zinc-500">{text}</div>;
}

const statusOptions = [
    { value: "draft", label: "草稿" },
    { value: "assigned", label: "待配置" },
    { value: "in_progress", label: "制作中" },
    { value: "submitted", label: "待验收" },
    { value: "revision_required", label: "待修改" },
    { value: "accepted", label: "已验收" },
    { value: "cancelled", label: "已取消" },
] as const;
