"use client";

import { App, Button, Drawer, Form, Input, InputNumber, Select, Tag } from "antd";
import { CircleDollarSign, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PersonalComputeAdvance, ProductionGroupDetails } from "@/lib/school-compute-domain";
import { schoolComputeApi } from "@/services/api/school-compute";
import { useSchoolContextStore } from "@/stores/use-school-context-store";
import { useUserStore } from "@/stores/use-user-store";

type AdvanceForm = { orderId: string; amount: number; reason?: string };

export function ProductionGroupMemberPanel() {
    const { message } = App.useApp();
    const context = useSchoolContextStore((state) => state.context);
    const user = useUserStore((state) => state.user);
    const [groups, setGroups] = useState<ProductionGroupDetails[]>([]);
    const [advances, setAdvances] = useState<PersonalComputeAdvance[]>([]);
    const [selected, setSelected] = useState<ProductionGroupDetails | null>(null);
    const [advanceOpen, setAdvanceOpen] = useState(false);
    const [requestOpen, setRequestOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm<AdvanceForm>();
    const [requestForm] = Form.useForm<AdvanceForm>();
    const selectedIdRef = useRef<string | undefined>(undefined);
    const role = context?.membership.role;
    const permanentBalance = Number(user?.permanentPointsBalance || 0);

    const load = useCallback(async () => {
        if (!context || !["teacher", "student"].includes(role || "")) return;
        setLoading(true);
        try {
            const result = await schoolComputeApi.listTeachingGroups({ page: 1, pageSize: 100 });
            setGroups(result.items);
            if (selectedIdRef.current) {
                const current = result.items.find((group) => group.id === selectedIdRef.current) || null;
                setSelected(current);
                if (current) setAdvances((await schoolComputeApi.listOwnAdvances(current.id, { page: 1, pageSize: 100 })).items);
            }
        } catch (error) {
            message.error(errorMessage(error, "制作小组加载失败"));
        } finally {
            setLoading(false);
        }
    }, [context, message, role]);

    useEffect(() => void load(), [load]);

    const activeOrders = useMemo(() => selected?.orders.filter((order) => ["in_progress", "revision_required"].includes(order.status)) || [], [selected]);
    const isLeader = Boolean(selected && context?.membership.id === selected.leaderMembershipId);

    const openGroup = async (group: ProductionGroupDetails) => {
        selectedIdRef.current = group.id;
        setSelected(group);
        try {
            setAdvances((await schoolComputeApi.listOwnAdvances(group.id, { page: 1, pageSize: 100 })).items);
        } catch (error) {
            message.error(errorMessage(error, "个人垫付记录加载失败"));
        }
    };

    const createAdvance = async (values: AdvanceForm) => {
        if (!selected) return;
        try {
            const result = await schoolComputeApi.createPersonalAdvance(selected.id, { ...values, idempotencyKey: `personal-advance:${selected.id}:${Date.now()}` });
            setAdvances((current) => [result, ...current]);
            message.success("已使用个人永久积分补充小组算力");
            setAdvanceOpen(false);
            form.resetFields();
        } catch (error) {
            message.error(errorMessage(error, "个人垫付创建失败"));
        }
    };

    const requestAllocation = async (values: AdvanceForm) => {
        if (!selected) return;
        try {
            await schoolComputeApi.requestAllocation(selected.id, { orderId: values.orderId, amount: values.amount, reason: values.reason?.trim() || "组长申请追加制作算力" });
            message.success("追加申请已提交");
            setRequestOpen(false);
            requestForm.resetFields();
        } catch (error) {
            message.error(errorMessage(error, "追加申请提交失败"));
        }
    };

    if (!context || !["teacher", "student"].includes(role || "") || context.school.status !== "active" || context.membership.status !== "active") return null;

    return (
        <section data-production-group-member-panel className="mb-5 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="flex items-center gap-2">
                        <CircleDollarSign className="size-4" />
                        <h2 className="text-sm font-semibold">我的制作小组与算力</h2>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">个人永久积分余额：{permanentBalance.toFixed(2)} 点</p>
                </div>
                <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>
                    刷新
                </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {groups.map((group) => (
                    <article key={group.id} className={`rounded-md border p-3 ${selected?.id === group.id ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : "border-zinc-200 dark:border-zinc-800"}`}>
                        <button type="button" className="w-full text-left" onClick={() => void openGroup(group)}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium">{group.name}</span>
                                <span className="font-mono text-xs">{group.schoolPointsBalance.toFixed(2)} 点</span>
                            </div>
                            <p className="mt-1 text-xs text-zinc-500">
                                {group.members.length} 位成员 · {group.orders.length} 个商单
                            </p>
                        </button>
                    </article>
                ))}
            </div>
            {selected ? (
                <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">{selected.name} · 我的垫付</div>
                        {activeOrders.length ? (
                            <Button
                                size="small"
                                type="primary"
                                icon={<Plus className="size-3.5" />}
                                onClick={() => {
                                    form.resetFields();
                                    setAdvanceOpen(true);
                                }}
                            >
                                临时补充小组算力
                            </Button>
                        ) : null}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">仅使用个人永久积分，商单验收后按结算状态返还。</p>
                    {isLeader && activeOrders.length ? (
                        <Button
                            className="mt-2"
                            size="small"
                            onClick={() => {
                                requestForm.resetFields();
                                setRequestOpen(true);
                            }}
                        >
                            追加申请
                        </Button>
                    ) : null}
                    <div className="mt-3 divide-y divide-zinc-100 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                        {advances.map((advance) => (
                            <div key={advance.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                                <span>{advance.orderId}</span>
                                <span>剩余 {advance.remainingPoints.toFixed(2)} 点</span>
                                <Tag color={advance.status === "pending_school_confirmation" ? "orange" : "blue"}>{advance.status === "pending_school_confirmation" ? "待学校确认" : advance.status === "active" ? "使用中" : advance.status}</Tag>
                            </div>
                        ))}
                        {!advances.length ? <p className="py-4 text-xs text-zinc-500">暂无个人垫付记录</p> : null}
                    </div>
                </div>
            ) : null}
            <Drawer
                title="临时补充小组算力"
                open={advanceOpen}
                width="min(640px, 100vw)"
                destroyOnHidden
                onClose={() => setAdvanceOpen(false)}
                extra={
                    <Button type="primary" onClick={() => form.submit()}>
                        确认垫付
                    </Button>
                }
            >
                <Form form={form} layout="vertical" requiredMark={false} onFinish={(values) => void createAdvance(values)}>
                    <Form.Item label="商单" name="orderId" rules={[{ required: true, message: "请选择商单" }]}>
                        <Select options={activeOrders.map((order) => ({ value: order.id, label: order.title }))} />
                    </Form.Item>
                    <Form.Item label="垫付算力点数" name="amount" rules={[{ required: true, message: "请输入点数" }]}>
                        <InputNumber className="w-full" min={0.01} max={permanentBalance} precision={2} />
                    </Form.Item>
                    <p className="text-xs text-zinc-500">本操作只扣除你的个人永久积分，不使用每日赠送积分。</p>
                </Form>
            </Drawer>
            <Drawer
                title="追加小组算力申请"
                open={requestOpen}
                width="min(640px, 100vw)"
                destroyOnHidden
                onClose={() => setRequestOpen(false)}
                extra={
                    <Button type="primary" onClick={() => requestForm.submit()}>
                        提交申请
                    </Button>
                }
            >
                <Form form={requestForm} layout="vertical" requiredMark={false} onFinish={(values) => void requestAllocation(values)}>
                    <Form.Item label="商单" name="orderId" rules={[{ required: true, message: "请选择商单" }]}>
                        <Select options={activeOrders.map((order) => ({ value: order.id, label: order.title }))} />
                    </Form.Item>
                    <Form.Item label="申请算力点数" name="amount" rules={[{ required: true, message: "请输入点数" }]}>
                        <InputNumber className="w-full" min={0.01} precision={2} />
                    </Form.Item>
                    <Form.Item label="申请理由" name="reason">
                        <Input.TextArea rows={3} maxLength={200} />
                    </Form.Item>
                    <p className="text-xs text-zinc-500">申请将由学校管理员在审批区处理。</p>
                </Form>
            </Drawer>
        </section>
    );
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
