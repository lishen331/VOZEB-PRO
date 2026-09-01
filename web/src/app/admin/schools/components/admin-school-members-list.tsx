"use client";

import type { TableColumnsType } from "antd";
import { App, Button, Input, InputNumber, Modal, Pagination, Segmented, Select, Table, Tag } from "antd";
import { ArrowLeft, RefreshCw, WalletCards } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AdminSchoolMemberPoints, AdminSchoolMemberPointsAdjustmentInput, SchoolMemberRole, SchoolMembershipStatus, SchoolSummary } from "@/lib/school-domain";
import { adminEducationApi } from "@/services/api/admin-education";

const PAGE_SIZE = 20;

type AdjustmentDraft = {
    member: AdminSchoolMemberPoints;
    operation: "credit" | "debit";
    amount: number | null;
    reason: string;
    idempotencyKey: string;
};

export function AdminSchoolMembersList({ school, onBack }: { school: SchoolSummary; onBack: () => void }) {
    const { message } = App.useApp();
    const [items, setItems] = useState<AdminSchoolMemberPoints[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [role, setRole] = useState<SchoolMemberRole | undefined>();
    const [status, setStatus] = useState<SchoolMembershipStatus | undefined>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [draft, setDraft] = useState<AdjustmentDraft | null>(null);
    const [saving, setSaving] = useState(false);
    const requestSequence = useRef(0);

    const load = useCallback(async () => {
        const requestId = ++requestSequence.current;
        setLoading(true);
        setError("");
        try {
            const result = await adminEducationApi.listSchoolMembers(school.id, { page, pageSize: PAGE_SIZE, keyword: keyword.trim() || undefined, role, status });
            if (requestId !== requestSequence.current) return;
            setItems(result.items);
            setTotal(result.total);
        } catch (loadError) {
            if (requestId !== requestSequence.current) return;
            setItems([]);
            setTotal(0);
            setError(loadError instanceof Error ? loadError.message : "学校成员列表加载失败");
        } finally {
            if (requestId === requestSequence.current) setLoading(false);
        }
    }, [keyword, page, role, school.id, status]);

    useEffect(() => {
        void load();
    }, [load]);

    const openAdjustment = (member: AdminSchoolMemberPoints) => {
        setDraft({ member, operation: "credit", amount: null, reason: "", idempotencyKey: crypto.randomUUID() });
    };

    const submitAdjustment = async () => {
        if (!draft) return;
        const amountText = String(draft.amount ?? "").trim();
        if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(Number(amountText)) || Number(amountText) <= 0) {
            message.error("积分数量必须为最多两位小数的正数");
            return;
        }
        const reason = draft.reason.trim();
        if (!reason) {
            message.error("请填写调账原因");
            return;
        }
        const amount = Number(amountText);
        if (draft.operation === "debit" && amount > draft.member.permanentPoints) {
            message.error("个人永久积分不足");
            return;
        }
        const input: AdminSchoolMemberPointsAdjustmentInput = { operation: draft.operation, amount, reason, idempotencyKey: draft.idempotencyKey };
        setSaving(true);
        try {
            const result = await adminEducationApi.adjustSchoolMemberPoints(school.id, draft.member.id, input);
            setItems((current) => current.map((item) => (item.id === result.member.id ? result.member : item)));
            setDraft(null);
            message.success("成员个人永久积分已调整");
        } catch (saveError) {
            message.error(saveError instanceof Error ? saveError.message : "调整成员积分失败");
        } finally {
            setSaving(false);
        }
    };

    const columns: TableColumnsType<AdminSchoolMemberPoints> = [
        {
            title: "成员",
            key: "member",
            render: (_, member) => <MemberIdentity member={member} />,
        },
        { title: "学校角色", dataIndex: "role", width: 108, render: (value: SchoolMemberRole) => <Tag>{value === "teacher" ? "老师" : "学生"}</Tag> },
        {
            title: "状态",
            key: "status",
            width: 130,
            render: (_, member) => <MemberStatus member={member} />,
        },
        { title: "个人永久积分", dataIndex: "permanentPoints", width: 132, render: (value: number) => formatPoints(value) },
        { title: "每日积分", dataIndex: "dailyPoints", width: 100, render: (value: number) => formatPoints(value) },
        { title: "总积分", dataIndex: "totalPoints", width: 100, render: (value: number) => formatPoints(value) },
        {
            title: "操作",
            key: "actions",
            width: 128,
            align: "right",
            render: (_, member) => <Button type="text" size="small" icon={<WalletCards className="size-3.5" />} onClick={() => openAdjustment(member)}>调整积分</Button>,
        },
    ];

    const projectedBalance = draft?.amount && Number.isFinite(draft.amount) ? draft.member.permanentPoints + (draft.operation === "credit" ? draft.amount : -draft.amount) : null;
    return (
        <div className="min-w-0 space-y-3" data-school-members>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <Button type="text" size="small" icon={<ArrowLeft className="size-3.5" />} onClick={onBack}>返回学校列表</Button>
                    <h2 className="mt-1 truncate text-base font-semibold text-zinc-950 dark:text-zinc-100">{school.name}的成员</h2>
                </div>
                <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load()}>刷新</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
                <Input.Search
                    allowClear
                    value={keyword}
                    placeholder="搜索账号 ID、用户名、姓名或邮箱"
                    onChange={(event) => {
                        setKeyword(event.target.value);
                        setPage(1);
                    }}
                />
                <Select
                    allowClear
                    value={role}
                    placeholder="学校角色"
                    options={[{ value: "teacher", label: "老师" }, { value: "student", label: "学生" }]}
                    onChange={(value) => {
                        setRole(value);
                        setPage(1);
                    }}
                />
                <Select
                    allowClear
                    value={status}
                    placeholder="成员状态"
                    options={[{ value: "active", label: "可用" }, { value: "disabled", label: "停用" }]}
                    onChange={(value) => {
                        setStatus(value);
                        setPage(1);
                    }}
                />
            </div>
            {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}
            <div className="hidden md:block">
                <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={false} scroll={{ x: 920 }} />
            </div>
            <div className="space-y-2 md:hidden">
                {items.map((member) => (
                    <div key={member.id} className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-start justify-between gap-3">
                            <MemberIdentity member={member} />
                            <MemberStatus member={member} />
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 border-y border-zinc-100 py-2 text-xs dark:border-zinc-800">
                            <PointsMetric label="永久积分" value={member.permanentPoints} />
                            <PointsMetric label="每日积分" value={member.dailyPoints} />
                            <PointsMetric label="总积分" value={member.totalPoints} />
                        </div>
                        <div className="mt-2 flex justify-end"><Button type="text" size="small" icon={<WalletCards className="size-3.5" />} onClick={() => openAdjustment(member)}>调整积分</Button></div>
                    </div>
                ))}
                {!loading && !items.length ? <div className="py-10 text-center text-sm text-zinc-500">暂无匹配成员</div> : null}
            </div>
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} hideOnSinglePage onChange={setPage} />

            <Modal
                title={draft ? `调整 ${draft.member.accountId} 的个人永久积分` : "调整个人永久积分"}
                open={Boolean(draft)}
                width={Math.min(520, typeof window === "undefined" ? 520 : window.innerWidth)}
                okText="确认调整"
                cancelText="取消"
                confirmLoading={saving}
                onOk={() => void submitAdjustment()}
                onCancel={() => !saving && setDraft(null)}
            >
                {draft ? (
                    <div className="space-y-4">
                        <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                            当前个人永久积分：<strong>{formatPoints(draft.member.permanentPoints)}</strong>
                            {projectedBalance !== null ? <span className={projectedBalance < 0 ? "ml-2 text-red-600 dark:text-red-300" : "ml-2 text-zinc-500 dark:text-zinc-400"}>调整后：{formatPoints(projectedBalance)}</span> : null}
                        </div>
                        {draft.member.accountStatus === "disabled" ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">停用账号当前不能生成；本次调账不会改变账号状态。</div> : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                                操作
                                <Segmented className="block" value={draft.operation} options={[{ value: "credit", label: "增加" }, { value: "debit", label: "扣减" }]} onChange={(value) => setDraft((current) => current ? { ...current, operation: value as AdjustmentDraft["operation"] } : current)} />
                            </label>
                            <label className="space-y-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                                积分数量
                                <InputNumber className="w-full" min={0.01} precision={2} value={draft.amount} onChange={(value) => setDraft((current) => current ? { ...current, amount: value === null ? null : Number(value) } : current)} />
                            </label>
                        </div>
                        <label className="block space-y-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                            调账原因
                            <Input.TextArea value={draft.reason} autoSize={{ minRows: 3, maxRows: 6 }} maxLength={500} onChange={(event) => setDraft((current) => current ? { ...current, reason: event.target.value } : current)} />
                        </label>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}

function MemberIdentity({ member }: { member: AdminSchoolMemberPoints }) {
    return (
        <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">{member.displayName}</div>
            <div className="truncate text-xs text-zinc-500">账号 ID：{member.accountId} · @{member.username}</div>
            {member.email ? <div className="truncate text-xs text-zinc-400">{member.email}</div> : null}
        </div>
    );
}

function MemberStatus({ member }: { member: AdminSchoolMemberPoints }) {
    return <div className="flex shrink-0 flex-wrap justify-end gap-1"><Tag color={member.status === "active" ? "green" : "default"}>{member.status === "active" ? "成员可用" : "成员停用"}</Tag>{member.accountStatus === "disabled" ? <Tag color="orange">停用账号当前不能生成</Tag> : null}</div>;
}

function PointsMetric({ label, value }: { label: string; value: number }) {
    return <div><div className="text-zinc-500">{label}</div><div className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">{formatPoints(value)}</div></div>;
}

function formatPoints(value: number) {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}
