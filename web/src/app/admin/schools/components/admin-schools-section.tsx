"use client";

import type { FormInstance, TableColumnsType } from "antd";
import { App, Button, Drawer, Form, Input, Modal, Pagination, Select, Table, Tag } from "antd";
import { Eye, Pencil, Plus, RefreshCw, School, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PublicUser } from "@/lib/auth/store";
import { hasAdminPermission } from "@/lib/admin-permissions";
import type { CreateSchoolInput, SchoolDetail, SchoolStatus, SchoolSummary, UpdateSchoolInput } from "@/lib/school-domain";
import { adminEducationApi } from "@/services/api/admin-education";
import { AdminSchoolMembersList } from "./admin-school-members-list";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

type SchoolForm = {
    name: string;
    status?: SchoolStatus;
    city?: string;
    contact?: string;
    administratorUsername?: string;
    administratorDisplayName?: string;
    administratorEmail?: string;
    administratorPassword?: string;
};

export function AdminSchoolsSection({ currentUser }: { currentUser: PublicUser }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<SchoolForm>();
    const [items, setItems] = useState<SchoolSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<SchoolStatus | undefined>();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [editing, setEditing] = useState<SchoolDetail | null>();
    const [viewing, setViewing] = useState<SchoolDetail | null>();
    const [selectedSchool, setSelectedSchool] = useState<SchoolSummary | null>(null);
    const requestSequence = useRef(0);
    const canManageEducation = hasAdminPermission(currentUser, "education.manage");

    const load = useCallback(async () => {
        const requestId = ++requestSequence.current;
        setLoading(true);
        setError("");
        try {
            const result = await adminEducationApi.listSchools({ page, pageSize, keyword: keyword.trim() || undefined, status });
            if (requestId !== requestSequence.current) return;
            setItems(result.items);
            setTotal(result.total);
        } catch (loadError) {
            if (requestId !== requestSequence.current) return;
            setItems([]);
            setTotal(0);
            setError(loadError instanceof Error ? loadError.message : "学校管理列表加载失败");
        } finally {
            if (requestId === requestSequence.current) setLoading(false);
        }
    }, [keyword, page, pageSize, status]);

    useEffect(() => {
        void load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ status: "active" });
    };

    const openEdit = async (school: SchoolSummary) => {
        setLoading(true);
        try {
            const detail = await adminEducationApi.getSchool(school.id);
            const profile = detail.profile;
            setEditing(detail);
            form.setFieldsValue({
                name: detail.name,
                status: detail.status,
                city: typeof profile.city === "string" ? profile.city : "",
                contact: typeof profile.contact === "string" ? profile.contact : "",
            });
        } catch (detailError) {
            message.error(detailError instanceof Error ? detailError.message : "学校资料加载失败");
        } finally {
            setLoading(false);
        }
    };

    const openDetail = async (school: SchoolSummary) => {
        try {
            setViewing(await adminEducationApi.getSchool(school.id));
        } catch (detailError) {
            message.error(detailError instanceof Error ? detailError.message : "学校详情加载失败");
        }
    };

    const save = async (values: SchoolForm) => {
        setSaving(true);
        const profile = { city: values.city?.trim() || "", contact: values.contact?.trim() || "" };
        try {
            if (editing) {
                const patch: UpdateSchoolInput = { name: values.name, status: values.status, profile };
                await adminEducationApi.updateSchool(editing.id, patch);
                message.success("学校资料已更新");
            } else {
                const input: CreateSchoolInput = {
                    name: values.name,
                    profile,
                    administrator: {
                        username: values.administratorUsername || "",
                        displayName: values.administratorDisplayName,
                        email: values.administratorEmail,
                        password: values.administratorPassword || "",
                    },
                };
                await adminEducationApi.createSchool(input);
                message.success("学校与首位管理员已创建");
            }
            setEditing(undefined);
            form.resetFields();
            await load();
        } catch (saveError) {
            message.error(saveError instanceof Error ? saveError.message : "保存学校失败");
            throw saveError;
        } finally {
            setSaving(false);
        }
    };

    const columns: TableColumnsType<SchoolSummary> = [
        {
            title: "学校",
            key: "school",
            render: (_, school) => (
                <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-950 dark:text-zinc-100">{school.name}</div>
                    <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{profileSummary(school)}</div>
                </div>
            ),
        },
        {
            title: "首位管理员",
            key: "administrator",
            width: 220,
            render: (_, school) => <AdministratorIdentity school={school} />,
        },
        { title: "状态", dataIndex: "status", width: 100, render: (value: SchoolStatus) => <SchoolStatusTag status={value} /> },
        { title: "创建时间", dataIndex: "createdAt", width: 168, render: (value: string) => <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatTime(value)}</span> },
        {
            title: "操作",
            key: "actions",
            width: canManageEducation ? 220 : 100,
            align: "right",
            render: (_, school) => (
                <div className="flex justify-end gap-1">
                    <Button type="text" size="small" icon={<Users className="size-3.5" />} onClick={() => setSelectedSchool(school)}>
                        成员
                    </Button>
                    {canManageEducation ? (
                        <Button type="text" size="small" icon={<Eye className="size-3.5" />} onClick={() => void openDetail(school)}>
                            详情
                        </Button>
                    ) : null}
                    {canManageEducation ? (
                        <Button type="text" size="small" icon={<Pencil className="size-3.5" />} onClick={() => void openEdit(school)}>
                            编辑
                        </Button>
                    ) : null}
                </div>
            ),
        },
    ];

    const modalOpen = editing !== undefined;
    if (selectedSchool) return <AdminSchoolMembersList school={selectedSchool} onBack={() => setSelectedSchool(null)} />;
    return (
        <div className="min-w-0 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 gap-2">
                    <Input.Search
                        allowClear
                        value={keyword}
                        placeholder="搜索学校名称"
                        className="max-w-sm"
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            setPage(1);
                        }}
                    />
                    <Select
                        allowClear
                        value={status}
                        placeholder="状态"
                        className="w-28"
                        options={[
                            { value: "active", label: "可用" },
                            { value: "disabled", label: "停用" },
                        ]}
                        onChange={(value) => {
                            setStatus(value);
                            setPage(1);
                        }}
                    />
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} aria-label="刷新学校列表" onClick={() => void load()} />
                    {canManageEducation ? (
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={openCreate} data-create-school>
                            新建学校
                        </Button>
                    ) : null}
                </div>
            </div>
            {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}
            <div className="hidden md:block">
                <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={false} scroll={{ x: 720 }} />
            </div>
            <div className="space-y-2 md:hidden">
                {items.map((school) => (
                    <div key={school.id} data-school-card={school.id} className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">{school.name}</div>
                                <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{profileSummary(school)}</div>
                                <div className="mt-2">
                                    <AdministratorIdentity school={school} />
                                </div>
                            </div>
                            <SchoolStatusTag status={school.status} />
                        </div>
                        <div className="mt-2 flex justify-end gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                            <Button type="text" size="small" icon={<Users className="size-3.5" />} onClick={() => setSelectedSchool(school)}>
                                成员
                            </Button>
                            {canManageEducation ? (
                                <Button type="text" size="small" icon={<Eye className="size-3.5" />} onClick={() => void openDetail(school)}>
                                    详情
                                </Button>
                            ) : null}
                            {canManageEducation ? (
                                <Button type="text" size="small" icon={<Pencil className="size-3.5" />} onClick={() => void openEdit(school)}>
                                    编辑
                                </Button>
                            ) : null}
                        </div>
                    </div>
                ))}
                {!loading && !items.length ? <div className="py-10 text-center text-sm text-zinc-500">暂无学校</div> : null}
            </div>
            <div className="overflow-x-auto">
                <Pagination
                    responsive
                    current={page}
                    pageSize={pageSize}
                    total={total}
                    showSizeChanger
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    hideOnSinglePage={false}
                    showTotal={(count, range) => `${range[0]}-${range[1]} / 共 ${count} 所学校`}
                    onChange={(nextPage, nextPageSize) => {
                        setPage(nextPageSize === pageSize ? nextPage : 1);
                        if (nextPageSize !== pageSize) setPageSize(nextPageSize);
                    }}
                    onShowSizeChange={(_, nextPageSize) => {
                        setPage(1);
                        setPageSize(nextPageSize);
                    }}
                />
            </div>

            {canManageEducation ? (
                <Modal
                    forceRender
                    title={editing ? "编辑学校" : "新建学校"}
                    open={modalOpen}
                    okText={editing ? "保存修改" : "创建学校"}
                    cancelText="取消"
                    confirmLoading={saving}
                    width={560}
                    onOk={() => form.submit()}
                    onCancel={() => {
                        setEditing(undefined);
                        form.resetFields();
                    }}
                >
                    <SchoolEditorForm form={form} editing={Boolean(editing)} onFinish={save} />
                </Modal>
            ) : null}
            {canManageEducation ? (
                <Drawer title="学校详情" open={Boolean(viewing)} size={Math.min(560, typeof window === "undefined" ? 560 : window.innerWidth)} onClose={() => setViewing(null)}>
                    {viewing ? <SchoolDetailView school={viewing} /> : null}
                </Drawer>
            ) : null}
        </div>
    );
}

function SchoolEditorForm({ form, editing, onFinish }: { form: FormInstance<SchoolForm>; editing: boolean; onFinish: (values: SchoolForm) => Promise<void> }) {
    return (
        <Form form={form} layout="vertical" requiredMark={false} onFinish={(values) => void onFinish(values)}>
            <div className="grid gap-x-3 sm:grid-cols-2">
                <Form.Item label="学校名称" name="name" className="sm:col-span-2" rules={[{ required: true, message: "请填写学校名称" }]}>
                    <Input maxLength={120} />
                </Form.Item>
                <Form.Item label="所在城市" name="city">
                    <Input maxLength={80} />
                </Form.Item>
                <Form.Item label="联系方式" name="contact">
                    <Input maxLength={120} />
                </Form.Item>
                {editing ? (
                    <Form.Item label="学校状态" name="status" className="sm:col-span-2">
                        <Select
                            options={[
                                { value: "active", label: "可用" },
                                { value: "disabled", label: "停用" },
                            ]}
                        />
                    </Form.Item>
                ) : (
                    <>
                        <Form.Item label="管理员用户名" name="administratorUsername" rules={[{ required: true, message: "请填写管理员用户名" }]}>
                            <Input autoComplete="off" />
                        </Form.Item>
                        <Form.Item label="管理员姓名" name="administratorDisplayName">
                            <Input />
                        </Form.Item>
                        <Form.Item label="管理员邮箱" name="administratorEmail">
                            <Input type="email" />
                        </Form.Item>
                        <Form.Item label="初始密码" name="administratorPassword" rules={[{ required: true, message: "请填写初始密码" }]}>
                            <Input.Password autoComplete="new-password" />
                        </Form.Item>
                    </>
                )}
            </div>
        </Form>
    );
}

function SchoolDetailView({ school }: { school: SchoolDetail }) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                <span className="grid size-10 place-items-center rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                    <School className="size-5" />
                </span>
                <div className="min-w-0">
                    <div className="truncate font-semibold text-zinc-950 dark:text-zinc-100">{school.name}</div>
                    <SchoolStatusTag status={school.status} />
                </div>
            </div>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-3 text-sm">
                <dt className="text-zinc-500">所在城市</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{String(school.profile.city || "未填写")}</dd>
                <dt className="text-zinc-500">联系方式</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{String(school.profile.contact || "未填写")}</dd>
                <dt className="text-zinc-500">创建时间</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{formatTime(school.createdAt)}</dd>
                <dt className="text-zinc-500">更新时间</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{formatTime(school.updatedAt)}</dd>
            </dl>
        </div>
    );
}

function SchoolStatusTag({ status }: { status: SchoolStatus }) {
    return <Tag color={status === "active" ? "green" : "default"}>{status === "active" ? "可用" : "停用"}</Tag>;
}

function AdministratorIdentity({ school }: { school: SchoolSummary }) {
    const administrator = school.administrator;
    if (!administrator) return <span className="text-xs text-zinc-400">未找到可用管理员</span>;
    return (
        <div className="min-w-0">
            <div className="truncate text-sm text-zinc-800 dark:text-zinc-200">{administrator.displayName}</div>
            <div className="truncate text-xs text-zinc-500">
                ID：{administrator.accountId} · @{administrator.username}
            </div>
        </div>
    );
}

function profileSummary(school: SchoolSummary) {
    return [school.profile.city, school.profile.contact].filter((value): value is string => typeof value === "string" && Boolean(value.trim())).join(" · ") || "未填写学校资料";
}

function formatTime(value: string) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toLocaleString("zh-CN", { hour12: false }) : value;
}
