"use client";

import { App, Button, Drawer, Form, Input, InputNumber, Modal, Select, Spin, Tag } from "antd";
import { Check, CircleDollarSign, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { SchoolMember } from "@/lib/school-domain";
import type { ComputeAllocationRequest, ComputeSettlement, ProductionGroupDetails, SchoolComputePoolSummary } from "@/lib/school-compute-domain";
import { schoolApi } from "@/services/api/school";
import { schoolComputeApi } from "@/services/api/school-compute";
import { useSchoolContextStore } from "@/stores/use-school-context-store";

type GroupForm = { name: string; description?: string; leaderMembershipId: string; memberMembershipIds: string[] };
type AmountForm = { amount: number; reason: string; orderId?: string };
const PAGE_SIZE = 20;

export function ProductionGroupsPanel() {
    const { message } = App.useApp();
    const context = useSchoolContextStore((state) => state.context);
    const [pool, setPool] = useState<SchoolComputePoolSummary | null>(null);
    const [groups, setGroups] = useState<ProductionGroupDetails[]>([]);
    const [members, setMembers] = useState<SchoolMember[]>([]);
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [allocationGroup, setAllocationGroup] = useState<ProductionGroupDetails | null>(null);
    const [reviewGroup, setReviewGroup] = useState<ProductionGroupDetails | null>(null);
    const [settlementGroup, setSettlementGroup] = useState<ProductionGroupDetails | null>(null);
    const [requests, setRequests] = useState<ComputeAllocationRequest[]>([]);
    const [settlements, setSettlements] = useState<ComputeSettlement[]>([]);
    const [groupForm] = Form.useForm<GroupForm>();
    const [amountForm] = Form.useForm<AmountForm>();
    const canManage = Boolean(context?.canManageSchool);

    const load = useCallback(async () => {
        if (!canManage) return;
        setLoading(true);
        try {
            const [poolResult, groupResult, memberResult] = await Promise.all([
                schoolComputeApi.getPool(),
                schoolComputeApi.listGroups({ page: 1, pageSize: PAGE_SIZE, status: "active" }),
                schoolApi.listMembers({ page: 1, pageSize: 100, role: undefined, status: "active" }),
            ]);
            setPool(poolResult);
            setGroups(groupResult.items);
            setMembers(memberResult.items);
        } catch (error) {
            message.error(errorMessage(error, "制作小组加载失败"));
        } finally {
            setLoading(false);
        }
    }, [canManage, message]);

    useEffect(() => void load(), [load]);

    const memberOptions = useMemo(() => members.map((member) => ({ value: member.id, label: `${member.displayName} · ${member.accountId}` })), [members]);

    const createGroup = async (values: GroupForm) => {
        try {
            await schoolComputeApi.createGroup(values);
            message.success("制作小组已创建");
            setCreateOpen(false);
            groupForm.resetFields();
            await load();
        } catch (error) {
            message.error(errorMessage(error, "制作小组创建失败"));
        }
    };

    const openRequests = async (group: ProductionGroupDetails) => {
        try {
            const result = await schoolComputeApi.listAllocationRequests(group.id, { page: 1, pageSize: 100 });
            setRequests(result.items);
            setReviewGroup(group);
        } catch (error) {
            message.error(errorMessage(error, "追加申请加载失败"));
        }
    };

    const openSettlements = async (group: ProductionGroupDetails) => {
        try {
            const result = await schoolComputeApi.listSettlements(group.id, { page: 1, pageSize: 100 });
            setSettlements(result.items);
            setSettlementGroup(group);
        } catch (error) {
            message.error(errorMessage(error, "结算记录加载失败"));
        }
    };

    const allocate = async (values: AmountForm) => {
        if (!allocationGroup) return;
        try {
            await schoolComputeApi.allocate(allocationGroup.id, { ...values, idempotencyKey: `school-allocation:${allocationGroup.id}:${Date.now()}` });
            message.success("学校算力已分配");
            setAllocationGroup(null);
            amountForm.resetFields();
            await load();
        } catch (error) {
            message.error(errorMessage(error, "学校算力分配失败"));
        }
    };

    const review = async (request: ComputeAllocationRequest, decision: "approved" | "rejected") => {
        if (!reviewGroup) return;
        try {
            await schoolComputeApi.reviewAllocation(reviewGroup.id, request.id, { decision, note: decision === "approved" ? "学校管理员已批准" : "学校管理员已拒绝" });
            message.success(decision === "approved" ? "追加申请已批准" : "追加申请已拒绝");
            await openRequests(reviewGroup);
            await load();
        } catch (error) {
            message.error(errorMessage(error, "追加申请处理失败"));
        }
    };

    const confirmSettlement = async (settlement: ComputeSettlement) => {
        if (!settlementGroup) return;
        try {
            await schoolComputeApi.confirmSettlement(settlementGroup.id, settlement.id);
            message.success("已确认返还");
            await openSettlements(settlementGroup);
        } catch (error) {
            message.error(errorMessage(error, "返还确认失败"));
        }
    };

    if (!canManage) return null;

    return (
        <section data-production-groups-panel className="space-y-4 py-2">
            <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <CircleDollarSign className="size-5" />
                        <h2 className="text-lg font-semibold">制作小组与算力</h2>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">学校管理员管理小组、分配学校算力并确认个人垫付返还。</p>
                </div>
                <div className="flex gap-2">
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load()}>
                        刷新
                    </Button>
                    <Button
                        type="primary"
                        icon={<Plus className="size-4" />}
                        onClick={() => {
                            groupForm.resetFields();
                            setCreateOpen(true);
                        }}
                    >
                        新建小组
                    </Button>
                </div>
            </div>
            {pool ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric label="可用学校算力" value={pool.availablePoints} />
                    <Metric label="小组已分配" value={pool.allocatedPoints} />
                    <Metric label="已消耗" value={pool.consumedPoints} />
                    <Metric label="总额度" value={pool.totalPoints} />
                </div>
            ) : (
                <Spin size="small" />
            )}
            <div className="grid gap-3 xl:grid-cols-2">
                {groups.map((group) => {
                    const openOrder = group.orders.some((order) => ["in_progress", "revision_required"].includes(order.status));
                    return (
                        <article key={group.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="truncate font-semibold">{group.name}</h3>
                                        <Tag color="green">{group.status === "active" ? "可用" : group.status}</Tag>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{group.description || "暂无小组说明"}</p>
                                </div>
                                <span className="font-mono text-sm">{group.schoolPointsBalance.toFixed(2)} 点</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                                <span>{group.members.length} 位成员</span>
                                <span>{group.orders.length} 个商单</span>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                    size="small"
                                    icon={<CircleDollarSign className="size-3.5" />}
                                    disabled={!openOrder}
                                    onClick={() => {
                                        amountForm.resetFields();
                                        setAllocationGroup(group);
                                    }}
                                >
                                    分配算力
                                </Button>
                                <Button size="small" onClick={() => void openRequests(group)}>
                                    追加申请 {group.orders.length ? "与审批" : ""}
                                </Button>
                                <Button size="small" onClick={() => void openSettlements(group)}>
                                    返还确认
                                </Button>
                            </div>
                        </article>
                    );
                })}
                {!groups.length && !loading ? <p className="py-10 text-center text-sm text-zinc-500 xl:col-span-2">暂无可用制作小组</p> : null}
            </div>

            <Modal title="新建制作小组" open={createOpen} width="min(640px, 100vw)" destroyOnHidden okText="创建小组" cancelText="取消" onCancel={() => setCreateOpen(false)} onOk={() => void groupForm.submit()}>
                <Form form={groupForm} layout="vertical" requiredMark={false} onFinish={(values) => void createGroup(values)}>
                    <Form.Item label="小组名称" name="name" rules={[{ required: true, message: "请填写小组名称" }]}>
                        <Input maxLength={120} />
                    </Form.Item>
                    <Form.Item label="小组说明" name="description">
                        <Input.TextArea rows={3} maxLength={2000} />
                    </Form.Item>
                    <Form.Item label="成员" name="memberMembershipIds" rules={[{ required: true, message: "请选择成员" }]}>
                        <Select mode="multiple" options={memberOptions} placeholder="选择本校 active 成员" />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.memberMembershipIds !== next.memberMembershipIds}>
                        {() => (
                            <Form.Item label="组长" name="leaderMembershipId" rules={[{ required: true, message: "请选择组长" }]}>
                                <Select options={memberOptions.filter((item) => (groupForm.getFieldValue("memberMembershipIds") || []).includes(item.value))} placeholder="从成员中选择组长" />
                            </Form.Item>
                        )}
                    </Form.Item>
                </Form>
            </Modal>
            <Modal
                title={`${allocationGroup?.name || "小组"} · 分配学校算力`}
                open={Boolean(allocationGroup)}
                width="min(640px, 100vw)"
                destroyOnHidden
                okText="确认分配"
                cancelText="取消"
                onCancel={() => setAllocationGroup(null)}
                onOk={() => void amountForm.submit()}
            >
                <Form form={amountForm} layout="vertical" requiredMark={false} onFinish={(values) => void allocate(values)}>
                    <Form.Item label="算力点数" name="amount" rules={[{ required: true, message: "请输入算力点数" }]}>
                        <InputNumber className="w-full" min={0.01} precision={2} />
                    </Form.Item>
                    <Form.Item label="操作原因" name="reason" rules={[{ required: true, message: "请填写原因" }]}>
                        <Input.TextArea rows={3} maxLength={200} />
                    </Form.Item>
                    <Form.Item label="绑定商单" name="orderId">
                        <Select allowClear options={allocationGroup?.orders.filter((order) => ["in_progress", "revision_required"].includes(order.status)).map((order) => ({ value: order.id, label: order.title }))} />
                    </Form.Item>
                </Form>
            </Modal>
            <Drawer title="追加申请审批" open={Boolean(reviewGroup)} width="min(640px, 100vw)" destroyOnHidden onClose={() => setReviewGroup(null)}>
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {requests.map((request) => (
                        <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <div>
                                <div className="text-sm font-medium">
                                    {request.amount.toFixed(2)} 点 · {request.reason}
                                </div>
                                <Tag color={request.status === "pending" ? "orange" : request.status === "approved" ? "green" : "default"}>{request.status}</Tag>
                            </div>
                            {request.status === "pending" ? (
                                <div className="flex gap-2">
                                    <Button size="small" type="primary" icon={<Check className="size-3.5" />} onClick={() => void review(request, "approved")}>
                                        批准
                                    </Button>
                                    <Button size="small" onClick={() => void review(request, "rejected")}>
                                        拒绝
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                    ))}
                    {!requests.length ? <p className="py-8 text-center text-sm text-zinc-500">暂无追加申请</p> : null}
                </div>
            </Drawer>
            <Drawer title="个人垫付返还确认" open={Boolean(settlementGroup)} width="min(640px, 100vw)" destroyOnHidden onClose={() => setSettlementGroup(null)}>
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {settlements.map((settlement) => (
                        <div key={settlement.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <div>
                                <div className="text-sm font-medium">商单 {settlement.orderId}</div>
                                <Tag color={settlement.status === "pending_school_confirmation" ? "orange" : "green"}>{settlement.status === "pending_school_confirmation" ? "待确认" : settlement.status}</Tag>
                            </div>
                            {settlement.status === "pending_school_confirmation" ? (
                                <Button size="small" type="primary" onClick={() => void confirmSettlement(settlement)}>
                                    确认返还
                                </Button>
                            ) : null}
                        </div>
                    ))}
                    {!settlements.length ? <p className="py-8 text-center text-sm text-zinc-500">暂无待确认结算</p> : null}
                </div>
            </Drawer>
        </section>
    );
}

function Metric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="mt-1 font-mono text-base font-semibold">{value.toFixed(2)}</div>
        </div>
    );
}
function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
