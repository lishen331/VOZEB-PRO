"use client";

import type { FormInstance, TableColumnsType } from "antd";
import { App, Button, Empty, Form, Input, Modal, Pagination, Popconfirm, Select, Space, Table, Tabs, Tag, Tooltip } from "antd";
import { ArrowLeft, Ban, Building2, Eye, FilePlus2, FolderPlus, Pause, Pencil, Plus, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { hasAdminPermission } from "@/lib/admin-permissions";
import type { PublicUser } from "@/lib/auth/store";
import {
    IP_ASSET_KINDS,
    IP_AUTHORIZATION_MODES,
    IP_ITEM_CATEGORIES,
    IP_STATUSES,
    IP_VISIBILITIES,
    ipAuthorizationLabel,
    ipItemCategoryLabel,
    type IpAssetKind,
    type IpAuthorizationMode,
    type IpItemCategory,
    type IpStatus,
    type IpVisibility,
} from "@/lib/ip-library-domain";
import type { IpContentFileRecord, IpDetailRecord, IpItemRecord, IpPackageRecord, IpSchoolGrantStatus, IpSubIpDetailRecord } from "@/lib/server/database/repository-types";
import { adminEducationApi } from "@/services/api/admin-education";
import { adminIpLibraryApi, type AdminIpGrantItem, type AdminIpUsageItem } from "@/services/api/admin-ip-library";
import { IpContentUpload } from "./ip-content-upload";

const PAGE_SIZE = 12;
type AdminIp = IpPackageRecord & { subIpCount: number };
type IpForm = { title: string; slug: string; summary?: string; visibility: IpVisibility };
type SubIpItemForm = { kind: IpAssetKind; category: IpItemCategory; title: string; summary?: string; fileId: string; sortOrder?: number };
type SubIpForm = { title: string; summary?: string; coverFileId?: string; tags?: string[]; sourceNote?: string; sortOrder?: number; items: SubIpItemForm[] };
type GrantForm = { subIpId: string; schoolId: string; mode: IpAuthorizationMode; startsAt: string; endsAt?: string; note?: string };
type GrantPatchForm = { status: IpSchoolGrantStatus; endsAt?: string; note?: string };
type DetailTab = "content" | "grants" | "usage";
type DetailOpenIntent = { tab?: DetailTab; openGrant?: boolean };

export function AdminIpLibrarySection({ currentUser }: { currentUser: PublicUser }) {
    const canManageContent = hasAdminPermission(currentUser, "content.manage");
    const canManageEducation = hasAdminPermission(currentUser, "education.manage");
    const [opened, setOpened] = useState<{ detail: IpDetailRecord; initialTab: DetailTab; openGrantOnMount: boolean }>();
    return opened ? (
        <IpDetailEditor
            detail={opened.detail}
            initialTab={opened.initialTab}
            openGrantOnMount={opened.openGrantOnMount}
            onClose={() => setOpened(undefined)}
            onReload={(detail) => setOpened((current) => (current ? { ...current, detail, openGrantOnMount: false } : current))}
            canManageContent={canManageContent}
            canManageEducation={canManageEducation}
        />
    ) : (
        <IpList canManageContent={canManageContent} canManageEducation={canManageEducation} onOpen={(detail, intent = {}) => setOpened({ detail, initialTab: intent.tab || "content", openGrantOnMount: Boolean(intent.openGrant) })} />
    );
}

function IpList({ canManageContent, canManageEducation, onOpen }: { canManageContent: boolean; canManageEducation: boolean; onOpen: (detail: IpDetailRecord, intent?: DetailOpenIntent) => void }) {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<IpForm>();
    const [items, setItems] = useState<AdminIp[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<IpStatus>();
    const [visibility, setVisibility] = useState<IpVisibility>();
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await adminIpLibraryApi.list({ page, pageSize: PAGE_SIZE, keyword: keyword.trim() || undefined, status, visibility });
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            message.error(errorMessage(error, "IP 列表加载失败"));
        } finally {
            setLoading(false);
        }
    }, [keyword, message, page, status, visibility]);
    useEffect(() => void load(), [load]);
    const open = async (id: string, intent?: DetailOpenIntent) => {
        try {
            onOpen(await adminIpLibraryApi.get(id), intent);
        } catch (error) {
            message.error(errorMessage(error, "IP 详情加载失败"));
        }
    };
    const create = async () => {
        try {
            const value = await form.validateFields();
            setSaving(true);
            const ip = await adminIpLibraryApi.create(value);
            setCreateOpen(false);
            form.resetFields();
            await open(ip.id);
        } catch (error) {
            if (error && typeof error === "object" && "errorFields" in error) return;
            message.error(errorMessage(error, "创建 IP 失败"));
        } finally {
            setSaving(false);
        }
    };
    const toggle = async (ip: AdminIp) => {
        try {
            await adminIpLibraryApi.update(ip.id, { status: ip.status === "enabled" ? "disabled" : "enabled" });
            message.success(ip.status === "enabled" ? "已停用，老师和学生将无法访问" : "已启用");
            await load();
        } catch (error) {
            message.error(errorMessage(error, "更新 IP 状态失败"));
        }
    };
    const remove = (ip: AdminIp) =>
        modal.confirm({
            title: `删除“${ip.title}”`,
            content: "已授权给学校的 IP 不能删除。未授权的 IP 会删除其子 IP、内容、下载记录及关联文件，且无法恢复。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                await adminIpLibraryApi.remove(ip.id);
                message.success("IP 已删除");
                await load();
            },
        });
    const columns: TableColumnsType<AdminIp> = [
        {
            title: "IP",
            dataIndex: "title",
            render: (_, item) => (
                <div className="min-w-0 text-left">
                    <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">{item.title}</div>
                    <div className="mt-1 max-w-[34rem] truncate text-xs text-zinc-500">{item.summary || item.slug}</div>
                </div>
            ),
        },
        { title: "范围", width: 100, render: (_, item) => <Tag>{item.visibility === "school" ? "本校 IP" : "公共 IP"}</Tag> },
        { title: "子 IP", dataIndex: "subIpCount", width: 92, render: (count) => `${count} 个` },
        { title: "状态", width: 96, render: (_, item) => <Tag color={item.status === "enabled" ? "green" : "default"}>{item.status === "enabled" ? "启用" : "停用"}</Tag> },
        {
            title: "操作",
            width: 330,
            render: (_, item) => (
                <Space size={0} wrap>
                    <Button type="text" icon={<Eye className="size-4" />} aria-label="查看详情" onClick={() => void open(item.id)}>
                        详情
                    </Button>
                    {canManageEducation && item.visibility === "school" ? (
                        <Button type="text" icon={<Building2 className="size-4" />} onClick={() => void open(item.id, { tab: "grants", openGrant: true })}>
                            授权
                        </Button>
                    ) : null}
                    {canManageContent ? (
                        <>
                            <Button type="text" icon={item.status === "enabled" ? <Ban className="size-4" /> : <RotateCcw className="size-4" />} aria-label={item.status === "enabled" ? "停用 IP" : "启用 IP"} onClick={() => void toggle(item)}>
                                {item.status === "enabled" ? "停用" : "启用"}
                            </Button>
                            <Button type="text" danger icon={<Trash2 className="size-4" />} aria-label="删除 IP" onClick={() => remove(item)}>
                                删除
                            </Button>
                        </>
                    ) : null}
                </Space>
            ),
        },
    ];
    return (
        <section className="space-y-4" data-admin-ip-library>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                <div>
                    <h2 className="text-base font-semibold">IP 内容</h2>
                    <p className="mt-1 text-sm text-zinc-500">一个 IP 可以包含多个子 IP；保存后内容立即对有权限的用户生效。</p>
                </div>
                {canManageContent ? (
                    <Button
                        type="primary"
                        icon={<Plus className="size-4" />}
                        onClick={() => {
                            form.setFieldsValue({ visibility: "public" });
                            setCreateOpen(true);
                        }}
                    >
                        新建 IP
                    </Button>
                ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_130px_auto]">
                <Input.Search
                    allowClear
                    placeholder="搜索名称、简介或标识"
                    value={keyword}
                    onChange={(event) => {
                        setPage(1);
                        setKeyword(event.target.value);
                    }}
                    onSearch={() => void load()}
                />
                <Select
                    allowClear
                    placeholder="范围"
                    value={visibility}
                    options={IP_VISIBILITIES.map((value) => ({ value, label: value === "school" ? "本校 IP" : "公共 IP" }))}
                    onChange={(value) => {
                        setPage(1);
                        setVisibility(value);
                    }}
                />
                <Select
                    allowClear
                    placeholder="状态"
                    value={status}
                    options={IP_STATUSES.map((value) => ({ value, label: value === "enabled" ? "启用" : "停用" }))}
                    onChange={(value) => {
                        setPage(1);
                        setStatus(value);
                    }}
                />
                <Tooltip title="刷新">
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} aria-label="刷新列表" onClick={() => void load()} />
                </Tooltip>
            </div>
            <Table rowKey="id" size="middle" loading={loading} columns={columns} dataSource={items} pagination={false} scroll={{ x: 930 }} />
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />
            <Modal title="新建 IP" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => void create()} confirmLoading={saving} okText="创建并编辑" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical">
                    <Form.Item name="title" label="IP 名称" rules={[{ required: true, message: "请填写 IP 名称" }]}>
                        <Input autoFocus />
                    </Form.Item>
                    <Form.Item name="slug" label="IP 标识" rules={[{ required: true, message: "请填写 IP 标识" }]}>
                        <Input placeholder="例如 star-sea" />
                    </Form.Item>
                    <Form.Item name="visibility" label="可见范围" rules={[{ required: true }]}>
                        <Select options={IP_VISIBILITIES.map((value) => ({ value, label: value === "school" ? "本校 IP" : "公共 IP" }))} />
                    </Form.Item>
                    <Form.Item name="summary" label="简介">
                        <Input.TextArea autoSize={{ minRows: 3, maxRows: 5 }} />
                    </Form.Item>
                </Form>
            </Modal>
        </section>
    );
}

function IpDetailEditor({
    detail,
    initialTab,
    openGrantOnMount,
    onClose,
    onReload,
    canManageContent,
    canManageEducation,
}: {
    detail: IpDetailRecord;
    initialTab: DetailTab;
    openGrantOnMount: boolean;
    onClose: () => void;
    onReload: (detail: IpDetailRecord) => void;
    canManageContent: boolean;
    canManageEducation: boolean;
}) {
    const { message, modal } = App.useApp();
    const [ipForm] = Form.useForm<IpForm>();
    const [subForm] = Form.useForm<SubIpForm>();
    const [grantForm] = Form.useForm<GrantForm>();
    const [selectedSubIpId, setSelectedSubIpId] = useState<string | undefined>(detail.subIps[0]?.id);
    const [files, setFiles] = useState<IpContentFileRecord[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [saving, setSaving] = useState(false);
    const [grantOpen, setGrantOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<DetailTab>(initialTab);
    const [grantIntentPending, setGrantIntentPending] = useState(openGrantOnMount);
    const [grants, setGrants] = useState<AdminIpGrantItem[]>([]);
    const [usage, setUsage] = useState<AdminIpUsageItem[]>([]);
    const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
    const selected = detail.subIps.find((item) => item.id === selectedSubIpId) || detail.subIps[0];
    const reload = useCallback(async () => {
        try {
            onReload(await adminIpLibraryApi.get(detail.id));
        } catch (error) {
            message.error(errorMessage(error, "刷新 IP 详情失败"));
        }
    }, [detail.id, message, onReload]);
    useEffect(() => {
        ipForm.setFieldsValue({ title: detail.title, slug: detail.slug, summary: detail.summary, visibility: detail.visibility });
    }, [detail, ipForm]);
    useEffect(() => {
        if (!selected) return;
        subForm.setFieldsValue({ title: selected.title, summary: selected.summary, coverFileId: selected.coverFileId, tags: selected.tags, sourceNote: selected.sourceNote, sortOrder: selected.sortOrder, items: selected.items.map(itemForm) });
        setFiles([]);
        setLoadingFiles(true);
        void adminIpLibraryApi
            .listFiles(detail.id, selected.id)
            .then(setFiles)
            .catch((error) => message.error(errorMessage(error, "内容文件加载失败")))
            .finally(() => setLoadingFiles(false));
    }, [detail.id, message, selected, subForm]);
    const addFile = useCallback((file: IpContentFileRecord) => {
        setFiles((current) => (current.some((item) => item.id === file.id) ? current : [...current, file]));
    }, []);
    const removeFile = useCallback(
        (fileId: string) => {
            setFiles((current) => current.filter((file) => file.id !== fileId));
            if (subForm.getFieldValue("coverFileId") === fileId) subForm.setFieldValue("coverFileId", undefined);
            const items = subForm.getFieldValue("items") as SubIpItemForm[] | undefined;
            items?.forEach((item, index) => {
                if (item?.fileId === fileId) subForm.setFieldValue(["items", index, "fileId"], undefined);
            });
        },
        [subForm],
    );
    const saveIp = async () => {
        try {
            setSaving(true);
            await adminIpLibraryApi.update(detail.id, await ipForm.validateFields());
            message.success("IP 信息已保存");
            await reload();
        } catch (error) {
            message.error(errorMessage(error, "保存 IP 信息失败"));
        } finally {
            setSaving(false);
        }
    };
    const saveSubIp = async () => {
        if (!selected) return;
        try {
            setSaving(true);
            await adminIpLibraryApi.updateSubIp(detail.id, selected.id, await subForm.validateFields());
            message.success("子 IP 内容已保存，已立即生效");
            await reload();
        } catch (error) {
            message.error(errorMessage(error, "保存子 IP 失败"));
        } finally {
            setSaving(false);
        }
    };
    const addSubIp = async () => {
        const name = `子 IP ${detail.subIps.length + 1}`;
        try {
            const subIp = await adminIpLibraryApi.createSubIp(detail.id, { title: name, summary: "", tags: [], sourceNote: "" });
            setSelectedSubIpId(subIp.id);
            message.success("子 IP 已添加");
            await reload();
        } catch (error) {
            message.error(errorMessage(error, "添加子 IP 失败"));
        }
    };
    const deleteSubIp = (subIp: IpSubIpDetailRecord) =>
        modal.confirm({
            title: `删除“${subIp.title}”`,
            content: "会删除此子 IP 的内容、学校授权和文件。",
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                await adminIpLibraryApi.deleteSubIp(detail.id, subIp.id);
                setSelectedSubIpId(undefined);
                await reload();
            },
        });
    const loadGrants = useCallback(async () => {
        try {
            const result = await adminIpLibraryApi.listGrants(detail.id, { pageSize: 100 });
            setGrants(result.items);
        } catch (error) {
            message.error(errorMessage(error, "学校授权加载失败"));
        }
    }, [detail.id, message]);
    const loadUsage = useCallback(async () => {
        try {
            const result = await adminIpLibraryApi.listUsage({ ipId: detail.id, pageSize: 100 });
            setUsage(result.items);
        } catch (error) {
            message.error(errorMessage(error, "下载记录加载失败"));
        }
    }, [detail.id, message]);
    const openGrant = useCallback(async () => {
        try {
            const result = await adminEducationApi.listSchools({ pageSize: 100, status: "active" });
            setSchools(result.items);
            grantForm.setFieldsValue({ subIpId: selected?.id, mode: "multi_school", startsAt: new Date().toISOString() });
            setGrantOpen(true);
        } catch (error) {
            message.error(errorMessage(error, "学校列表加载失败"));
        }
    }, [grantForm, message, selected?.id]);
    useEffect(() => {
        if (initialTab === "grants") void loadGrants();
    }, [initialTab, loadGrants]);
    useEffect(() => {
        if (!grantIntentPending) return;
        setGrantIntentPending(false);
        void openGrant();
    }, [grantIntentPending, openGrant]);
    const createGrant = async () => {
        try {
            await adminIpLibraryApi.createGrant(detail.id, await grantForm.validateFields());
            setGrantOpen(false);
            message.success("学校授权已生效");
            await loadGrants();
        } catch (error) {
            message.error(errorMessage(error, "创建学校授权失败"));
        }
    };
    const updateGrant = async (grant: AdminIpGrantItem, input: { status: IpSchoolGrantStatus; endsAt?: string | null; note?: string }) => {
        try {
            await adminIpLibraryApi.updateGrant(detail.id, grant.id, input);
            message.success("学校授权已更新");
            await loadGrants();
            return true;
        } catch (error) {
            message.error(errorMessage(error, "更新学校授权失败"));
            return false;
        }
    };
    const tabs = [
        {
            key: "content",
            label: "内容编辑",
            children: selected ? (
                <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
                    <aside className="border-b border-zinc-200 pb-4 lg:border-b-0 lg:border-r lg:pr-4 dark:border-zinc-800">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-medium">子 IP</span>
                            {canManageContent ? (
                                <Tooltip title="添加子 IP">
                                    <Button type="text" icon={<FolderPlus className="size-4" />} aria-label="添加子 IP" onClick={() => void addSubIp()} />
                                </Tooltip>
                            ) : null}
                        </div>
                        <div className="grid gap-1">
                            {detail.subIps.map((subIp) => (
                                <div
                                    key={subIp.id}
                                    className={`flex min-w-0 items-center gap-1 border p-2 ${subIp.id === selected.id ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900" : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}
                                >
                                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedSubIpId(subIp.id)}>
                                        <span className="block truncate text-sm font-medium">{subIp.title}</span>
                                        <span className="mt-0.5 block text-xs text-zinc-500">{subIp.items.length} 项内容</span>
                                    </button>
                                    {canManageContent && detail.subIps.length > 1 ? (
                                        <Tooltip title="删除子 IP">
                                            <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} aria-label="删除子 IP" onClick={() => deleteSubIp(subIp)} />
                                        </Tooltip>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </aside>
                    <SubIpEditor ipId={detail.id} subIp={selected} form={subForm} files={files} loadingFiles={loadingFiles} disabled={!canManageContent} saving={saving} onSave={saveSubIp} onFileUploaded={addFile} onFileDeleted={removeFile} />
                </div>
            ) : (
                <Empty description="暂无子 IP" />
            ),
        },
        ...(canManageEducation && detail.visibility === "school"
            ? [{ key: "grants", label: "学校授权", children: <GrantPanel detail={detail} grants={grants} selectedSubIpId={selected?.id} onLoad={loadGrants} onCreate={openGrant} onUpdate={updateGrant} /> }]
            : []),
        { key: "usage", label: "下载记录", children: <UsagePanel usage={usage} onLoad={loadUsage} /> },
    ];
    return (
        <section className="space-y-4" data-admin-ip-detail>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                <div className="flex min-w-0 items-center gap-2">
                    <Tooltip title="返回 IP 列表">
                        <Button type="text" icon={<ArrowLeft className="size-4" />} aria-label="返回 IP 列表" onClick={onClose} />
                    </Tooltip>
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold">{detail.title}</h2>
                        <p className="mt-0.5 text-sm text-zinc-500">{detail.status === "enabled" ? "已启用，保存的内容会立即生效" : "已停用，学校管理员仍可查看授权记录"}</p>
                    </div>
                </div>
                <Space>
                    <Tag color={detail.status === "enabled" ? "green" : "default"}>{detail.status === "enabled" ? "启用" : "停用"}</Tag>
                    <Tooltip title="刷新详情">
                        <Button icon={<RefreshCw className="size-4" />} aria-label="刷新详情" onClick={() => void reload()} />
                    </Tooltip>
                </Space>
            </div>
            <div className="border-b border-zinc-200 pb-4 dark:border-zinc-800">
                <Form form={ipForm} layout="vertical">
                    <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Form.Item name="title" label="IP 名称" rules={[{ required: true }]}>
                            <Input disabled={!canManageContent} />
                        </Form.Item>
                        <Form.Item name="slug" label="IP 标识" rules={[{ required: true }]}>
                            <Input disabled={!canManageContent} />
                        </Form.Item>
                        <Form.Item name="visibility" label="可见范围">
                            <Select disabled={!canManageContent} options={IP_VISIBILITIES.map((value) => ({ value, label: value === "school" ? "本校 IP" : "公共 IP" }))} />
                        </Form.Item>
                        <div className="flex items-end pb-6">
                            {canManageContent ? (
                                <Button type="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => void saveIp()}>
                                    保存 IP 信息
                                </Button>
                            ) : null}
                        </div>
                    </div>
                    <Form.Item name="summary" label="简介" className="!mb-0">
                        <Input.TextArea disabled={!canManageContent} autoSize={{ minRows: 2, maxRows: 4 }} />
                    </Form.Item>
                </Form>
            </div>
            <Tabs
                items={tabs}
                destroyOnHidden
                onChange={(key) => {
                    setActiveTab(key as DetailTab);
                    if (key === "grants") void loadGrants();
                    if (key === "usage") void loadUsage();
                }}
                activeKey={activeTab}
            />
            <Modal title="授权给学校" open={grantOpen} onCancel={() => setGrantOpen(false)} onOk={() => void createGrant()} okText="确认授权" cancelText="取消" destroyOnHidden>
                <Form form={grantForm} layout="vertical">
                    <Form.Item name="subIpId" label="子 IP" rules={[{ required: true }]}>
                        <Select options={detail.subIps.map((item) => ({ value: item.id, label: item.title }))} />
                    </Form.Item>
                    <Form.Item name="schoolId" label="学校" rules={[{ required: true }]}>
                        <Select showSearch optionFilterProp="label" options={schools.map((item) => ({ value: item.id, label: item.name }))} />
                    </Form.Item>
                    <Form.Item name="mode" label="授权方式" rules={[{ required: true }]}>
                        <Select options={IP_AUTHORIZATION_MODES.map((value) => ({ value, label: ipAuthorizationLabel(value) }))} />
                    </Form.Item>
                    <Form.Item name="startsAt" label="开始时间" rules={[{ required: true }]}>
                        <Input placeholder="ISO 时间，例如 2026-09-06T00:00:00Z" />
                    </Form.Item>
                    <Form.Item name="endsAt" label="结束时间">
                        <Input placeholder="留空表示长期有效" />
                    </Form.Item>
                    <Form.Item name="note" label="备注">
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
                    </Form.Item>
                </Form>
            </Modal>
        </section>
    );
}

function SubIpEditor({
    ipId,
    subIp,
    form,
    files,
    loadingFiles,
    disabled,
    saving,
    onSave,
    onFileUploaded,
    onFileDeleted,
}: {
    ipId: string;
    subIp: IpSubIpDetailRecord;
    form: FormInstance<SubIpForm>;
    files: IpContentFileRecord[];
    loadingFiles: boolean;
    disabled: boolean;
    saving: boolean;
    onSave: () => Promise<void>;
    onFileUploaded: (file: IpContentFileRecord) => void;
    onFileDeleted: (fileId: string) => void;
}) {
    return (
        <Form form={form} layout="vertical">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
                <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">{subIp.title}</h3>
                    <p className="mt-1 text-xs text-zinc-500">编辑完成点击保存，即刻更新此子 IP 内容。</p>
                </div>
                {!disabled ? (
                    <Button type="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => void onSave()}>
                        保存子 IP
                    </Button>
                ) : null}
            </div>
            <div className="mt-4 grid gap-x-4 sm:grid-cols-2">
                <Form.Item name="title" label="子 IP 名称" rules={[{ required: true }]}>
                    <Input disabled={disabled} />
                </Form.Item>
                <Form.Item name="tags" label="标签">
                    <Select disabled={disabled} mode="tags" tokenSeparators={[",", "，"]} />
                </Form.Item>
                <Form.Item name="summary" label="简介">
                    <Input.TextArea disabled={disabled} autoSize={{ minRows: 2, maxRows: 4 }} />
                </Form.Item>
                <Form.Item name="sourceNote" label="来源说明">
                    <Input.TextArea disabled={disabled} autoSize={{ minRows: 2, maxRows: 4 }} />
                </Form.Item>
                <Form.Item name="coverFileId" label="封面">
                    <IpContentUpload ipId={ipId} subIpId={subIp.id} kind="image" files={files} disabled={disabled || loadingFiles} onUploaded={onFileUploaded} onDeleted={onFileDeleted} />
                </Form.Item>
            </div>
            <Form.List name="items">
                {(fields, { add, remove }) => (
                    <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                        <div className="flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold">详细内容</h4>
                            {!disabled ? (
                                <Button icon={<FilePlus2 className="size-4" />} onClick={() => add({ kind: "text", category: "story_summary", title: "", summary: "", sortOrder: fields.length })}>
                                    添加内容
                                </Button>
                            ) : null}
                        </div>
                        <div className="mt-3 grid gap-3">
                            {fields.map((field, index) => (
                                <div key={field.key} className="border border-zinc-200 p-3 dark:border-zinc-800">
                                    <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
                                        <Form.Item name={[field.name, "kind"]} label="类型" rules={[{ required: true }]}>
                                            <Select disabled={disabled} options={IP_ASSET_KINDS.map((kind) => ({ value: kind, label: kind === "text" ? "文本" : kind === "image" ? "图片" : kind === "audio" ? "音频" : "视频" }))} />
                                        </Form.Item>
                                        <Form.Item noStyle shouldUpdate={(prev, current) => prev.items?.[field.name]?.kind !== current.items?.[field.name]?.kind}>
                                            {({ getFieldValue }) => {
                                                const kind = (getFieldValue(["items", field.name, "kind"]) as IpAssetKind) || "text";
                                                return (
                                                    <Form.Item name={[field.name, "category"]} label="分类" rules={[{ required: true }]}>
                                                        <Select disabled={disabled} options={IP_ITEM_CATEGORIES[kind].map((value) => ({ value, label: ipItemCategoryLabel(value) }))} />
                                                    </Form.Item>
                                                );
                                            }}
                                        </Form.Item>
                                        <Form.Item name={[field.name, "title"]} label="标题" rules={[{ required: true }]}>
                                            <Input disabled={disabled} />
                                        </Form.Item>
                                        <Form.Item name={[field.name, "sortOrder"]} label="排序">
                                            <Input type="number" disabled={disabled} />
                                        </Form.Item>
                                        <Form.Item name={[field.name, "summary"]} label="说明" className="sm:col-span-2">
                                            <Input disabled={disabled} />
                                        </Form.Item>
                                        <Form.Item noStyle shouldUpdate={(prev, current) => prev.items?.[field.name]?.kind !== current.items?.[field.name]?.kind}>
                                            {({ getFieldValue }) => {
                                                const kind = (getFieldValue(["items", field.name, "kind"]) as IpAssetKind) || "text";
                                                return (
                                                    <Form.Item name={[field.name, "fileId"]} label="原文件" className="sm:col-span-2" rules={[{ required: true, message: "请选择 IP 内容文件" }]}>
                                                        <IpContentUpload ipId={ipId} subIpId={subIp.id} kind={kind} files={files} disabled={disabled} onUploaded={onFileUploaded} onDeleted={onFileDeleted} />
                                                    </Form.Item>
                                                );
                                            }}
                                        </Form.Item>
                                    </div>
                                    {!disabled ? (
                                        <div className="mt-2 flex justify-end">
                                            <Button type="text" danger icon={<Trash2 className="size-4" />} onClick={() => remove(index)}>
                                                删除内容
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Form.List>
        </Form>
    );
}

function GrantPanel({
    detail,
    grants,
    selectedSubIpId,
    onLoad,
    onCreate,
    onUpdate,
}: {
    detail: IpDetailRecord;
    grants: AdminIpGrantItem[];
    selectedSubIpId?: string;
    onLoad: () => Promise<void>;
    onCreate: () => Promise<void>;
    onUpdate: (grant: AdminIpGrantItem, input: { status: IpSchoolGrantStatus; endsAt?: string | null; note?: string }) => Promise<boolean>;
}) {
    const [form] = Form.useForm<GrantPatchForm>();
    const [editing, setEditing] = useState<AdminIpGrantItem>();
    const visible = selectedSubIpId ? grants.filter((item) => item.subIpId === selectedSubIpId) : grants;
    const save = async () => {
        if (!editing) return;
        const values = await form.validateFields();
        if (await onUpdate(editing, { ...values, endsAt: values.endsAt?.trim() || null })) setEditing(undefined);
    };
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-500">授权后，该校管理员、教师和学生可直接访问对应子 IP。</p>
                <Space>
                    <Tooltip title="刷新">
                        <Button icon={<RefreshCw className="size-4" />} aria-label="刷新学校授权" onClick={() => void onLoad()} />
                    </Tooltip>
                    <Button type="primary" icon={<Building2 className="size-4" />} onClick={() => void onCreate()}>
                        授权学校
                    </Button>
                </Space>
            </div>
            <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={visible}
                columns={[
                    { title: "学校", render: (_, item) => item.school?.name || item.schoolId },
                    { title: "子 IP", render: (_, item) => item.subIp?.title || detail.subIps.find((subIp) => subIp.id === item.subIpId)?.title || item.subIpId },
                    { title: "方式", render: (_, item) => ipAuthorizationLabel(item.mode) },
                    { title: "状态", render: (_, item) => <Tag color={item.status === "active" ? "green" : item.status === "suspended" ? "gold" : "default"}>{grantStatusLabel(item.status)}</Tag> },
                    { title: "有效期", render: (_, item) => `${formatTime(item.startsAt)} - ${item.endsAt ? formatTime(item.endsAt) : "长期"}` },
                    {
                        title: "操作",
                        width: 128,
                        render: (_, item) => (
                            <Space size={0}>
                                <Tooltip title="编辑授权">
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<Pencil className="size-3.5" />}
                                        aria-label="编辑授权"
                                        onClick={() => {
                                            form.setFieldsValue({ status: item.status, endsAt: item.endsAt, note: item.note });
                                            setEditing(item);
                                        }}
                                    />
                                </Tooltip>
                                {item.status === "active" ? (
                                    <Tooltip title="暂停授权">
                                        <Button type="text" size="small" icon={<Pause className="size-3.5" />} aria-label="暂停授权" onClick={() => void onUpdate(item, { status: "suspended" })} />
                                    </Tooltip>
                                ) : (
                                    <Tooltip title="恢复授权">
                                        <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} aria-label="恢复授权" onClick={() => void onUpdate(item, { status: "active" })} />
                                    </Tooltip>
                                )}
                                {item.status !== "revoked" ? (
                                    <Popconfirm title="撤销此学校授权？" okText="撤销" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => onUpdate(item, { status: "revoked" })}>
                                        <Tooltip title="撤销授权">
                                            <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} aria-label="撤销授权" />
                                        </Tooltip>
                                    </Popconfirm>
                                ) : null}
                            </Space>
                        ),
                    },
                ]}
                scroll={{ x: 860 }}
            />
            <Modal title="编辑学校授权" open={Boolean(editing)} onCancel={() => setEditing(undefined)} onOk={() => void save()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical">
                    <Form.Item name="status" label="授权状态" rules={[{ required: true }]}>
                        <Select
                            options={[
                                { value: "active", label: "生效" },
                                { value: "suspended", label: "暂停" },
                                { value: "revoked", label: "已撤销" },
                                { value: "expired", label: "已到期" },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="endsAt" label="结束时间">
                        <Input placeholder="留空表示长期有效" />
                    </Form.Item>
                    <Form.Item name="note" label="备注">
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
function grantStatusLabel(status: IpSchoolGrantStatus) {
    return status === "active" ? "生效" : status === "suspended" ? "暂停" : status === "revoked" ? "已撤销" : "已到期";
}
function UsagePanel({ usage, onLoad }: { usage: AdminIpUsageItem[]; onLoad: () => Promise<void> }) {
    return (
        <div className="space-y-3">
            <div className="flex justify-end">
                <Tooltip title="刷新">
                    <Button icon={<RefreshCw className="size-4" />} aria-label="刷新下载记录" onClick={() => void onLoad()} />
                </Tooltip>
            </div>
            <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={usage}
                columns={[
                    { title: "用户", render: (_, item) => item.user?.displayName || "已删除用户" },
                    { title: "学校", render: (_, item) => item.school?.name || "-" },
                    { title: "类型", dataIndex: "downloadType" },
                    { title: "结果", render: (_, item) => <Tag color={item.result === "succeeded" ? "green" : "red"}>{item.result === "succeeded" ? "成功" : "失败"}</Tag> },
                    { title: "时间", render: (_, item) => formatTime(item.createdAt) },
                ]}
                scroll={{ x: 620 }}
            />
        </div>
    );
}
function itemForm(item: IpItemRecord): SubIpItemForm {
    return { kind: item.kind, category: item.category, title: item.title, summary: item.summary, fileId: item.fileId, sortOrder: item.sortOrder };
}
function formatTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
