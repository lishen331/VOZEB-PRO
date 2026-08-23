"use client";

import { App, Button, Drawer, Form, Input, InputNumber, Modal, Pagination, Select, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { CircleDollarSign, Eye, LockKeyhole, Plus, RefreshCw, UnlockKeyhole } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PublicUser } from "@/lib/auth/store";
import { hasAllAdminPermissions } from "@/lib/admin-permissions";
import type { AdminSchoolComputePool, AdminSchoolComputePoolDetails, SchoolComputePoolStatus } from "@/lib/school-compute-domain";
import { adminSchoolComputeApi } from "@/services/api/admin-school-compute";

type MutationForm = { amount: number; reason: string };
const PAGE_SIZE = 20;

export function AdminSchoolComputeSection({ currentUser }: { currentUser: PublicUser }) {
    const { message } = App.useApp();
    const [items, setItems] = useState<AdminSchoolComputePool[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<SchoolComputePoolStatus | undefined>();
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<AdminSchoolComputePoolDetails | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [mutation, setMutation] = useState<"credit" | "adjust" | null>(null);
    const [form] = Form.useForm<MutationForm>();
    const canMutate = hasAllAdminPermissions(currentUser, ["education.manage", "billing.manage"]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await adminSchoolComputeApi.listPools({ page, pageSize: PAGE_SIZE, keyword: keyword.trim() || undefined, status });
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            message.error(errorMessage(error, "学校算力池加载失败"));
            setItems([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [keyword, message, page, status]);

    useEffect(() => void load(), [load]);

    const openDetails = useCallback(
        async (schoolId: string) => {
            try {
                setSelected(await adminSchoolComputeApi.getPool(schoolId));
                setDrawerOpen(true);
            } catch (error) {
                message.error(errorMessage(error, "学校算力池详情加载失败"));
            }
        },
        [message],
    );

    const openMutation = (kind: "credit" | "adjust") => {
        form.resetFields();
        setMutation(kind);
    };

    const submitMutation = async (values: MutationForm) => {
        if (!selected || !mutation) return;
        const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${mutation}-${Date.now()}`;
        try {
            const next = mutation === "credit" ? await adminSchoolComputeApi.credit(selected.schoolId, { ...values, idempotencyKey }) : await adminSchoolComputeApi.adjust(selected.schoolId, { ...values, idempotencyKey });
            setSelected(next);
            setMutation(null);
            message.success(mutation === "credit" ? "学校算力池已充值" : "学校算力池已调账");
            await load();
        } catch (error) {
            message.error(errorMessage(error, "学校算力池操作失败"));
        }
    };

    const toggleStatus = async () => {
        if (!selected) return;
        const nextStatus = selected.status === "frozen" ? "active" : "frozen";
        try {
            const next = await adminSchoolComputeApi.setStatus(selected.schoolId, nextStatus);
            setSelected(next);
            message.success(nextStatus === "frozen" ? "算力池已冻结" : "算力池已恢复");
            await load();
        } catch (error) {
            message.error(errorMessage(error, "算力池状态更新失败"));
        }
    };

    const columns = useMemo<TableColumnsType<AdminSchoolComputePool>>(
        () => [
            {
                title: "学校",
                dataIndex: "schoolName",
                render: (value: string, record) => (
                    <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">{value}</div>
                        <div className="text-xs text-zinc-500">{record.schoolId}</div>
                    </div>
                ),
            },
            { title: "总额度", dataIndex: "totalPoints", render: (value: number) => <span className="font-mono">{value.toFixed(2)}</span> },
            { title: "可用额度", dataIndex: "availablePoints", render: (value: number) => <span className="font-mono">{value.toFixed(2)}</span> },
            { title: "已分配", dataIndex: "allocatedPoints", render: (value: number) => <span className="font-mono">{value.toFixed(2)}</span> },
            { title: "已消耗", dataIndex: "consumedPoints", render: (value: number) => <span className="font-mono">{value.toFixed(2)}</span> },
            { title: "状态", dataIndex: "status", render: (value: SchoolComputePoolStatus) => <PoolStatusTag status={value} /> },
            {
                title: "操作",
                key: "actions",
                align: "right",
                render: (_, record) => (
                    <Button type="text" size="small" icon={<Eye className="size-3.5" />} onClick={() => void openDetails(record.schoolId)}>
                        查看详情
                    </Button>
                ),
            },
        ],
        [openDetails],
    );

    return (
        <section data-admin-school-compute className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <CircleDollarSign className="size-5 text-zinc-700 dark:text-zinc-300" />
                        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-100">学校算力池</h2>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">按学校查看总额度、可用额度、已分配和已消耗算力。</p>
                </div>
                <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load()}>
                    刷新
                </Button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input.Search
                    className="sm:max-w-sm"
                    allowClear
                    placeholder="搜索学校名称或 ID"
                    onSearch={(value) => {
                        setKeyword(value.trim());
                        setPage(1);
                    }}
                />
                <Select
                    className="w-full sm:w-32"
                    allowClear
                    placeholder="池状态"
                    value={status}
                    options={[
                        { value: "active", label: "可用" },
                        { value: "frozen", label: "已冻结" },
                        { value: "closed", label: "已关闭" },
                    ]}
                    onChange={(value) => {
                        setStatus(value);
                        setPage(1);
                    }}
                />
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                <Table rowKey="schoolId" loading={loading} columns={columns} dataSource={items} pagination={false} scroll={{ x: 780 }} />
            </div>
            <Pagination className="flex justify-end" current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={setPage} />

            <Drawer title={selected ? `${selected.schoolName} · 学校算力池` : "学校算力池详情"} open={drawerOpen} onClose={() => setDrawerOpen(false)} width="min(720px, 100vw)" destroyOnHidden>
                {selected ? (
                    <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Metric label="总额度" value={selected.totalPoints} />
                            <Metric label="可用额度" value={selected.availablePoints} />
                            <Metric label="已分配" value={selected.allocatedPoints} />
                            <Metric label="已消耗" value={selected.consumedPoints} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <PoolStatusTag status={selected.status} />
                            {canMutate ? (
                                <>
                                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openMutation("credit")}>
                                        充值
                                    </Button>
                                    <Button onClick={() => openMutation("adjust")}>调账</Button>
                                    <Button icon={selected.status === "frozen" ? <UnlockKeyhole className="size-4" /> : <LockKeyhole className="size-4" />} onClick={() => void toggleStatus()}>
                                        {selected.status === "frozen" ? "恢复算力池" : "冻结算力池"}
                                    </Button>
                                </>
                            ) : null}
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">最近流水</h3>
                            <div className="mt-2 divide-y divide-zinc-100 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                                {selected.ledger.items.map((entry) => (
                                    <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                        <span>{entry.type}</span>
                                        <span className="font-mono">{entry.amount.toFixed(2)}</span>
                                    </div>
                                ))}
                                {!selected.ledger.items.length ? <p className="py-5 text-sm text-zinc-500">暂无算力流水</p> : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </Drawer>

            <Modal title={mutation === "credit" ? "充值学校算力池" : "调账学校算力池"} open={Boolean(mutation)} width="min(640px, 100vw)" destroyOnHidden okText="确认" cancelText="取消" onCancel={() => setMutation(null)} onOk={() => void form.submit()}>
                <Form form={form} layout="vertical" requiredMark={false} onFinish={(values) => void submitMutation(values)}>
                    <Form.Item label="算力点数" name="amount" rules={[{ required: true, message: "请输入算力点数" }]}>
                        <InputNumber className="w-full" min={mutation === "credit" ? 0.01 : undefined} precision={2} />
                    </Form.Item>
                    <Form.Item label="操作原因" name="reason" rules={[{ required: true, message: "请填写操作原因" }]}>
                        <Input.TextArea rows={3} maxLength={200} showCount />
                    </Form.Item>
                </Form>
            </Modal>
        </section>
    );
}

function Metric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="mt-1 font-mono text-base font-semibold text-zinc-950 dark:text-zinc-100">{value.toFixed(2)}</div>
        </div>
    );
}
function PoolStatusTag({ status }: { status: SchoolComputePoolStatus }) {
    return <Tag color={status === "active" ? "green" : status === "frozen" ? "orange" : "default"}>{status === "active" ? "可用" : status === "frozen" ? "已冻结" : "已关闭"}</Tag>;
}
function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
