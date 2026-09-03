"use client";

import type { TableColumnsType } from "antd";
import { App, Button, Drawer, Form, Input, InputNumber, Modal, Pagination, Select, Space, Table, Tabs, Tag, Tooltip } from "antd";
import { Ban, Building2, FilePlus2, History, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdminUserIdentity } from "@/components/admin/admin-user-identity";
import { hasAdminPermission } from "@/lib/admin-permissions";
import type { PublicUser } from "@/lib/auth/store";
import { IP_ASSET_KINDS, IP_AUTHORIZATION_MODES, IP_ITEM_CATEGORIES, IP_STATUSES, IP_VISIBILITIES, ipAuthorizationLabel, type IpAssetKind, type IpAuthorizationMode, type IpItemCategory, type IpStatus, type IpVisibility } from "@/lib/ip-library-domain";
import type { SchoolSummary } from "@/lib/school-domain";
import type { IpContentFileRecord, IpDownloadResult, IpDownloadType, IpItemRecord, IpPackageRecord, IpSchoolGrantRecord, IpVersionRecord } from "@/lib/server/database/repository-types";
import { adminEducationApi } from "@/services/api/admin-education";
import { adminIpLibraryApi, type AdminIpGrantItem, type AdminIpUsageItem } from "@/services/api/admin-ip-library";
import { IpContentPreview } from "./ip-content-preview";
import { IpContentUpload } from "./ip-content-upload";

const PAGE_SIZE = 12;
type AdminIp = IpPackageRecord & { versionNumber: number; itemCount: number };
type IpForm = { title: string; slug: string; summary?: string; visibility: IpVisibility };
type VersionItemForm = { kind: IpAssetKind; category: IpItemCategory; title: string; summary?: string; fileId: string; sortOrder?: number };
type VersionForm = { title: string; summary?: string; coverFileId?: string; tags?: string[]; sourceNote?: string; changeNote?: string; items: VersionItemForm[] };
type GrantForm = { schoolId: string; mode: IpAuthorizationMode; startsAt: string; endsAt?: string; note?: string };

export function AdminIpLibrarySection({ currentUser }: { currentUser: PublicUser }) {
    const canManageContent = hasAdminPermission(currentUser, "content.manage");
    const canManageEducation = hasAdminPermission(currentUser, "education.manage");
    const tabs = [
        { key: "content", label: "IP 内容", children: <IpContentPanel canManageContent={canManageContent} canManageEducation={canManageEducation} /> },
        ...(canManageEducation ? [{ key: "grants", label: "学校授权", children: <GrantPanel /> }] : []),
        { key: "usage", label: "下载记录", children: <UsagePanel /> },
    ];
    return <Tabs items={tabs} destroyOnHidden />;
}

function IpContentPanel({ canManageContent, canManageEducation }: { canManageContent: boolean; canManageEducation: boolean }) {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<IpForm>();
    const [items, setItems] = useState<AdminIp[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [queryKeyword, setQueryKeyword] = useState("");
    const [status, setStatus] = useState<IpStatus>();
    const [visibility, setVisibility] = useState<IpVisibility>();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<AdminIp>();
    const [editorOpen, setEditorOpen] = useState(false);
    const [versionIp, setVersionIp] = useState<AdminIp>();
    const [grantIp, setGrantIp] = useState<AdminIp>();
    const requestId = useRef(0);
    const slugEditedRef = useRef(false);

    const load = useCallback(async () => {
        const id = ++requestId.current;
        setLoading(true);
        try {
            const result = await adminIpLibraryApi.list({ page, pageSize: PAGE_SIZE, keyword: queryKeyword || undefined, status, visibility });
            if (id !== requestId.current) return;
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            if (id === requestId.current) message.error(errorMessage(error, "IP 列表加载失败"));
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, [message, page, queryKeyword, status, visibility]);
    useEffect(() => void load(), [load]);

    const openEditor = (ip?: AdminIp) => {
        setEditing(ip);
        slugEditedRef.current = Boolean(ip);
        form.resetFields();
        form.setFieldsValue(ip ? { title: ip.title, slug: ip.slug, summary: ip.summary, visibility: ip.visibility } : { visibility: "public" });
        setEditorOpen(true);
    };
    const save = async (values: IpForm) => {
        setSaving(true);
        try {
            if (editing) await adminIpLibraryApi.update(editing.id, values);
            else await adminIpLibraryApi.create(values);
            message.success(editing ? "IP 已更新" : "IP 草稿已创建");
            setEditorOpen(false);
            await load();
        } catch (error) {
            const text = errorMessage(error, "IP 保存失败");
            const data = error && typeof error === "object" ? (error as { data?: { field?: string } }).data : undefined;
            if (data?.field === "slug") form.setFields([{ name: "slug", errors: [text] }]);
            message.error(text);
            throw error;
        } finally {
            setSaving(false);
        }
    };
    const disableIp = (ip: AdminIp) =>
        modal.confirm({
            title: `停用“${ip.title}”`,
            content: "停用后禁止新的查看和下载，历史版本仍保留。",
            okText: "确认停用",
            cancelText: "取消",
            async onOk() {
                await adminIpLibraryApi.update(ip.id, { status: "disabled" });
                message.success("IP 已停用");
                await load();
            },
        });
    const actions = (ip: AdminIp) => (
        <Space size={0} wrap>
            <Button type="text" size="small" icon={<History className="size-3.5" />} onClick={() => setVersionIp(ip)}>
                版本
            </Button>
            {canManageContent ? (
                <Button type="text" size="small" icon={<Pencil className="size-3.5" />} onClick={() => openEditor(ip)}>
                    编辑
                </Button>
            ) : null}
            {canManageEducation && ip.visibility === "school" ? (
                <Button type="text" size="small" icon={<Building2 className="size-3.5" />} onClick={() => setGrantIp(ip)}>
                    授权
                </Button>
            ) : null}
            {canManageContent && ip.status === "published" ? (
                <Button type="text" size="small" danger icon={<Ban className="size-3.5" />} onClick={() => disableIp(ip)}>
                    停用
                </Button>
            ) : null}
        </Space>
    );
    const columns: TableColumnsType<AdminIp> = [
        {
            title: "IP",
            render: (_, ip) => (
                <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-950 dark:text-zinc-100">{ip.title}</div>
                    <div className="mt-0.5 truncate text-xs text-zinc-500">
                        {ip.slug} · {ip.summary || "暂无简介"}
                    </div>
                </div>
            ),
        },
        {
            title: "发行",
            width: 150,
            render: (_, ip) => (
                <div className="space-y-1">
                    <IpStatusTag status={ip.status} />
                    <div className="text-xs text-zinc-500">{ip.visibility === "public" ? "公共 IP" : "本校 IP"}</div>
                </div>
            ),
        },
        {
            title: "当前版本",
            width: 110,
            render: (_, ip) => (
                <span className="text-sm">
                    v{ip.versionNumber || 0} · {ip.itemCount} 项
                </span>
            ),
        },
        { title: "更新时间", width: 160, dataIndex: "updatedAt", render: (value: string) => <span className="text-xs text-zinc-500">{formatTime(value)}</span> },
        { title: "操作", width: 270, align: "right", render: (_, ip) => actions(ip) },
    ];

    return (
        <section className="space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_108px_112px] gap-2 lg:max-w-3xl">
                    <Input.Search
                        value={keyword}
                        allowClear
                        placeholder="搜索 IP 名称、slug 或简介"
                        onChange={(event) => setKeyword(event.target.value)}
                        onSearch={(value) => {
                            setQueryKeyword(value.trim());
                            setPage(1);
                        }}
                    />
                    <Select
                        allowClear
                        value={visibility}
                        placeholder="范围"
                        options={visibilityOptions}
                        onChange={(value) => {
                            setVisibility(value);
                            setPage(1);
                        }}
                    />
                    <Select
                        allowClear
                        value={status}
                        placeholder="状态"
                        options={statusOptions}
                        onChange={(value) => {
                            setStatus(value);
                            setPage(1);
                        }}
                    />
                </div>
                <Space className="justify-end">
                    <Button icon={<RefreshCw className="size-4" />} aria-label="刷新 IP 列表" loading={loading} onClick={() => void load()} />
                    {canManageContent ? (
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openEditor()}>
                            创建 IP
                        </Button>
                    ) : null}
                </Space>
            </div>
            <div className="hidden md:block">
                <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={false} scroll={{ x: 940 }} />
            </div>
            <div className="space-y-2 md:hidden">
                {items.map((ip) => (
                    <article key={ip.id} className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="truncate text-sm font-medium">{ip.title}</h2>
                                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{ip.summary || "暂无简介"}</p>
                            </div>
                            <IpStatusTag status={ip.status} />
                        </div>
                        <div className="mt-2 text-xs text-zinc-500">
                            {ip.visibility === "public" ? "公共 IP" : "本校 IP"} · v{ip.versionNumber || 0} · {ip.itemCount} 项
                        </div>
                        <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">{actions(ip)}</div>
                    </article>
                ))}
            </div>
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage responsive showSizeChanger={false} onChange={setPage} />

            <Modal title={editing ? "编辑 IP 档案" : "创建 IP 档案"} open={editorOpen} destroyOnHidden width="min(640px, 100vw)" okText="保存" cancelText="取消" confirmLoading={saving} onCancel={() => setEditorOpen(false)} onOk={() => form.submit()}>
                <Form form={form} layout="vertical" onFinish={save} className="pt-2">
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item name="title" label="IP 名称" rules={[{ required: true, message: "请填写 IP 名称" }]}>
                            <Input
                                maxLength={120}
                                onChange={(event) => {
                                    if (!slugEditedRef.current && !editing) form.setFieldValue("slug", slugSuggestion(event.target.value));
                                }}
                            />
                        </Form.Item>
                        <Form.Item
                            name="slug"
                            label="slug"
                            rules={[
                                { required: true, message: "请填写 slug" },
                                { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: "使用小写字母、数字和连字符" },
                            ]}
                        >
                            <Input
                                onChange={() => {
                                    slugEditedRef.current = true;
                                }}
                            />
                        </Form.Item>
                    </div>
                    <Form.Item name="summary" label="简介">
                        <Input.TextArea rows={3} maxLength={1000} showCount />
                    </Form.Item>
                    <Form.Item name="visibility" label="前端范围" rules={[{ required: true }]}>
                        <Select options={visibilityOptions} />
                    </Form.Item>
                    <p className="-mt-2 text-xs text-zinc-500">公共 IP 可公开查看，不能绑定学校授权；学校授权仅适用于已发布的本校 IP。</p>
                </Form>
            </Modal>
            <VersionDrawer ip={versionIp} canManage={canManageContent} onClose={() => setVersionIp(undefined)} onChanged={load} />
            <GrantDrawer ip={grantIp} onClose={() => setGrantIp(undefined)} />
        </section>
    );
}

function VersionDrawer({ ip, canManage, onClose, onChanged }: { ip?: AdminIp; canManage: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<VersionForm>();
    const [versions, setVersions] = useState<IpVersionRecord[]>([]);
    const [files, setFiles] = useState<IpContentFileRecord[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editingVersion, setEditingVersion] = useState<IpVersionRecord>();
    const [saving, setSaving] = useState(false);
    const load = useCallback(async () => {
        if (!ip) return;
        setLoading(true);
        try {
            const [versionPage, fileRecords] = await Promise.all([adminIpLibraryApi.listVersions(ip.id, { page, pageSize: PAGE_SIZE }), adminIpLibraryApi.listFiles(ip.id)]);
            setVersions(versionPage.items);
            setTotal(versionPage.total);
            setFiles(fileRecords);
        } catch (error) {
            message.error(errorMessage(error, "版本列表加载失败"));
        } finally {
            setLoading(false);
        }
    }, [ip, message, page]);
    useEffect(() => void load(), [load]);
    const save = async (values: VersionForm) => {
        if (!ip) return;
        setSaving(true);
        try {
            if (editingVersion) await adminIpLibraryApi.updateVersion(ip.id, editingVersion.id, values);
            else await adminIpLibraryApi.createVersion(ip.id, values);
            message.success(editingVersion ? "草稿已保存" : "新版本草稿已创建");
            setCreating(false);
            setEditingVersion(undefined);
            form.resetFields();
            setPage(1);
            await load();
        } catch (error) {
            message.error(errorMessage(error, "版本创建失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };
    const openNew = () => {
        const current = versions.find((version) => version.id === ip?.currentVersionId);
        setEditingVersion(undefined);
        form.resetFields();
        form.setFieldsValue(current ? versionFormValue(current) : { title: "", summary: "", tags: [], sourceNote: "", changeNote: "", items: [] });
        setCreating(true);
    };
    const openEdit = (version: IpVersionRecord) => {
        setEditingVersion(version);
        form.resetFields();
        form.setFieldsValue(versionFormValue(version));
        setCreating(true);
    };
    const rememberFile = (file: IpContentFileRecord) => setFiles((current) => [file, ...current.filter((item) => item.id !== file.id)]);
    const publish = async (version: IpVersionRecord) => {
        if (!ip) return;
        setSaving(true);
        try {
            await adminIpLibraryApi.publishVersion(ip.id, version.id);
            message.success(`v${version.versionNumber} 已发布`);
            await Promise.all([load(), onChanged()]);
        } catch (error) {
            message.error(errorMessage(error, "版本发布失败"));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Drawer
            title={ip ? `${ip.title} · 版本历史` : "版本历史"}
            open={Boolean(ip)}
            width="min(760px, 100vw)"
            destroyOnHidden
            onClose={onClose}
            styles={{ wrapper: { maxWidth: "100vw" }, header: { minWidth: 0 } }}
            extra={
                canManage ? (
                    <Tooltip title="新建版本">
                        <Button type="primary" icon={<FilePlus2 className="size-4" />} aria-label="新建版本" onClick={openNew} />
                    </Tooltip>
                ) : null
            }
        >
            <div className="space-y-3" aria-busy={loading}>
                {versions.map((version) => (
                    <section key={version.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="font-medium">
                                    v{version.versionNumber} · {version.title}
                                </div>
                                <div className="mt-1 text-xs text-zinc-500">
                                    {version.items.length} 项内容 · {formatTime(version.publishedAt || version.createdAt)}
                                </div>
                            </div>
                            <Space>
                                <Tag color={version.status === "published" ? "green" : version.status === "draft" ? "gold" : "default"}>{versionStatusLabel[version.status]}</Tag>
                                {canManage && version.status === "draft" ? (
                                    <>
                                        <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => openEdit(version)}>
                                            编辑
                                        </Button>
                                        <Button size="small" type="primary" disabled={!versionReady(version, files)} loading={saving} onClick={() => void publish(version)}>
                                            发布
                                        </Button>
                                    </>
                                ) : null}
                            </Space>
                        </div>
                        {canManage && version.status === "draft" && !versionReady(version, files) ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{versionBlockReason(version, files)}</p> : null}
                        {version.summary ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{version.summary}</p> : null}
                        {version.tags.length ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {version.tags.map((tag) => (
                                    <Tag key={tag}>{tag}</Tag>
                                ))}
                            </div>
                        ) : null}
                        {version.coverFileId ? (
                            <div className="mt-3">
                                <IpContentPreview ipId={version.ipId} file={files.find((file) => file.id === version.coverFileId)} compact />
                            </div>
                        ) : null}
                        <VersionItems ipId={version.ipId} items={version.items} files={files} />
                    </section>
                ))}
            </div>
            <Pagination className="mt-3" current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />
            <Modal
                title={editingVersion ? `编辑 v${editingVersion.versionNumber} 草稿` : "创建不可覆盖的新版本"}
                open={creating}
                destroyOnHidden
                width="min(880px, 100vw)"
                okText="保存草稿"
                cancelText="取消"
                confirmLoading={saving}
                onCancel={() => {
                    setCreating(false);
                    setEditingVersion(undefined);
                }}
                onOk={() => form.submit()}
            >
                <Form form={form} layout="vertical" onFinish={save} className="pt-2">
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item name="title" label="版本名称" rules={[{ required: true, message: "请填写版本名称" }]}>
                            <Input maxLength={120} />
                        </Form.Item>
                        <Form.Item name="tags" label="标签">
                            <Select mode="tags" tokenSeparators={[",", "，"]} maxTagCount="responsive" />
                        </Form.Item>
                    </div>
                    <Form.Item name="summary" label="版本说明">
                        <Input.TextArea rows={2} maxLength={1000} />
                    </Form.Item>
                    {ip ? (
                        <Form.Item name="coverFileId" label="版本封面">
                            <IpContentUpload ipId={ip.id} kind="image" files={files} onUploaded={rememberFile} />
                        </Form.Item>
                    ) : null}
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item name="sourceNote" label="来源与署名">
                            <Input.TextArea rows={3} maxLength={1000} />
                        </Form.Item>
                        <Form.Item name="changeNote" label="版本变更">
                            <Input.TextArea rows={3} maxLength={1000} />
                        </Form.Item>
                    </div>
                    <Form.List name="items">
                        {(fields, { add, remove }) => (
                            <div className="space-y-3">
                                {fields.map((field, index) => (
                                    <VersionItemEditor key={field.key} ipId={ip?.id || ""} files={files} field={field} index={index} onUploaded={rememberFile} remove={() => remove(field.name)} />
                                ))}
                                <Button block icon={<Plus className="size-4" />} onClick={() => add({ kind: "text", category: "story_summary", title: "", fileId: "", sortOrder: fields.length })}>
                                    添加内容项
                                </Button>
                            </div>
                        )}
                    </Form.List>
                </Form>
            </Modal>
        </Drawer>
    );
}

function VersionItemEditor({ ipId, files, field, index, onUploaded, remove }: { ipId: string; files: IpContentFileRecord[]; field: { key: number; name: number }; index: number; onUploaded: (file: IpContentFileRecord) => void; remove: () => void }) {
    const form = Form.useFormInstance<VersionForm>();
    return (
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">内容项 {index + 1}</span>
                <Button type="text" danger aria-label={`删除内容项 ${index + 1}`} icon={<Trash2 className="size-4" />} onClick={remove} />
            </div>
            <div className="grid gap-x-3 sm:grid-cols-2">
                <Form.Item name={[field.name, "kind"]} label="类型" rules={[{ required: true }]}>
                    <Select
                        options={kindOptions}
                        onChange={(kind: IpAssetKind) => {
                            form.setFieldValue(["items", field.name, "category"], IP_ITEM_CATEGORIES[kind][0]);
                            form.setFieldValue(["items", field.name, "fileId"], undefined);
                        }}
                    />
                </Form.Item>
                <Form.Item noStyle shouldUpdate>
                    {({ getFieldValue }) => {
                        const kind = (getFieldValue(["items", field.name, "kind"]) || "text") as IpAssetKind;
                        const options = IP_ITEM_CATEGORIES[kind].map((value) => ({ value, label: categoryLabels[value] || value }));
                        return (
                            <Form.Item name={[field.name, "category"]} label="分类" rules={[{ required: true }]}>
                                <Select options={options} />
                            </Form.Item>
                        );
                    }}
                </Form.Item>
            </div>
            <Form.Item name={[field.name, "title"]} label="标题" rules={[{ required: true, message: "请填写内容项标题" }]}>
                <Input maxLength={120} />
            </Form.Item>
            <Form.Item noStyle shouldUpdate>
                {({ getFieldValue }) => {
                    const kind = (getFieldValue(["items", field.name, "kind"]) || "text") as IpAssetKind;
                    return (
                        <Form.Item name={[field.name, "fileId"]} label="IP 原文件" rules={[{ required: true, message: "请上传或选择 IP 原文件" }]}>
                            <IpContentUpload ipId={ipId} kind={kind} files={files} onUploaded={onUploaded} />
                        </Form.Item>
                    );
                }}
            </Form.Item>
            <div className="grid gap-x-3 sm:grid-cols-[1fr_110px]">
                <Form.Item name={[field.name, "summary"]} label="说明">
                    <Input />
                </Form.Item>
                <Form.Item name={[field.name, "sortOrder"]} label="排序">
                    <InputNumber min={0} precision={0} className="w-full" />
                </Form.Item>
            </div>
        </div>
    );
}

function VersionItems({ ipId, items, files }: { ipId: string; items: IpItemRecord[]; files: IpContentFileRecord[] }) {
    if (!items.length) return null;
    return (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {items.map((item) => (
                <div key={item.id} className="min-w-0 border-l-2 border-zinc-200 pl-2 dark:border-zinc-700">
                    <div className="truncate text-sm">{item.title}</div>
                    <div className="mb-2 text-xs text-zinc-500">
                        {kindLabel[item.kind]} · {categoryLabels[item.category] || item.category}
                    </div>
                    <IpContentPreview ipId={ipId} file={files.find((file) => file.id === item.fileId)} compact />
                </div>
            ))}
        </div>
    );
}

function versionFormValue(version: IpVersionRecord): VersionForm {
    return {
        title: version.title,
        summary: version.summary,
        coverFileId: version.coverFileId,
        tags: version.tags,
        sourceNote: version.sourceNote,
        changeNote: "",
        items: version.items.map((item) => ({ kind: item.kind, category: item.category, title: item.title, summary: item.summary, fileId: item.fileId, sortOrder: item.sortOrder })),
    };
}

function versionReady(version: IpVersionRecord, files: IpContentFileRecord[]) {
    if (!version.items.length) return false;
    const readyIds = new Set(files.filter((file) => file.status === "ready").map((file) => file.id));
    return (!version.coverFileId || readyIds.has(version.coverFileId)) && version.items.every((item) => readyIds.has(item.fileId));
}

function versionBlockReason(version: IpVersionRecord, files: IpContentFileRecord[]) {
    if (!version.items.length) return "IP 版本至少需要一个内容项";
    const byId = new Map(files.map((file) => [file.id, file]));
    const itemFiles = version.items.map((item) => byId.get(item.fileId));
    const coverFile = version.coverFileId ? byId.get(version.coverFileId) : undefined;
    if (itemFiles.some((file) => file?.status === "processing") || coverFile?.status === "processing") return "仍有内容文件处理中，请稍后再发布";
    if (itemFiles.some((file) => !file || file.status === "failed") || coverFile?.status === "failed") return "有内容文件处理失败，请重新上传";
    if (version.coverFileId && coverFile?.status !== "ready") return "IP 封面尚未准备完成";
    if (itemFiles.some((file) => file?.status !== "ready")) return "有内容文件尚未准备完成";
    return "当前版本暂不可发布";
}

function GrantPanel() {
    const { message } = App.useApp();
    const [items, setItems] = useState<AdminIp[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [keyword, setKeyword] = useState("");
    const [queryKeyword, setQueryKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<AdminIp>();
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await adminIpLibraryApi.list({ page, pageSize: PAGE_SIZE, keyword: queryKeyword || undefined, status: "published", visibility: "school" });
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            message.error(errorMessage(error, "可授权 IP 加载失败"));
        } finally {
            setLoading(false);
        }
    }, [message, page, queryKeyword]);
    useEffect(() => void load(), [load]);
    return (
        <section className="space-y-3">
            <div className="flex gap-2">
                <Input.Search
                    value={keyword}
                    allowClear
                    placeholder="搜索已发布的本校 IP"
                    onChange={(event) => setKeyword(event.target.value)}
                    onSearch={(value) => {
                        setQueryKeyword(value.trim());
                        setPage(1);
                    }}
                />
                <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load()} />
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {items.map((ip) => (
                    <article key={ip.id} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="min-w-0">
                            <h2 className="truncate text-sm font-medium">{ip.title}</h2>
                            <p className="mt-1 text-xs text-zinc-500">授权方式按学校单独设置 · v{ip.versionNumber}</p>
                        </div>
                        <Button size="small" icon={<ShieldCheck className="size-3.5" />} onClick={() => setSelected(ip)}>
                            管理授权
                        </Button>
                    </article>
                ))}
                {!items.length ? <EmptyText text="暂无可授权 IP。授权入口只展示已发布的本校 IP，公共 IP、草稿和已停用 IP 不在此列表。" /> : null}
            </div>
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />
            <GrantDrawer ip={selected} onClose={() => setSelected(undefined)} />
        </section>
    );
}

function GrantDrawer({ ip, onClose }: { ip?: AdminIp; onClose: () => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<GrantForm>();
    const [items, setItems] = useState<AdminIpGrantItem[]>([]);
    const [schools, setSchools] = useState<SchoolSummary[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const schoolRequest = useRef(0);
    const load = useCallback(async () => {
        if (!ip) return;
        setLoading(true);
        try {
            const result = await adminIpLibraryApi.listGrants(ip.id, { page, pageSize: PAGE_SIZE });
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            message.error(errorMessage(error, "授权列表加载失败"));
        } finally {
            setLoading(false);
        }
    }, [ip, message, page]);
    useEffect(() => void load(), [load]);
    const searchSchools = async (keyword = "") => {
        const id = ++schoolRequest.current;
        const result = await adminEducationApi.listSchools({ page: 1, pageSize: PAGE_SIZE, keyword: keyword.trim() || undefined, status: "active" });
        if (id === schoolRequest.current) setSchools(result.items);
    };
    const create = async (values: GrantForm) => {
        if (!ip) return;
        setLoading(true);
        try {
            await adminIpLibraryApi.createGrant(ip.id, { ...values, startsAt: localToIso(values.startsAt), endsAt: values.endsAt ? localToIso(values.endsAt) : undefined });
            message.success("学校授权已创建");
            setCreating(false);
            form.resetFields();
            await load();
        } catch (error) {
            message.error(errorMessage(error, "授权创建失败"));
            throw error;
        } finally {
            setLoading(false);
        }
    };
    const update = async (grant: IpSchoolGrantRecord, status: "active" | "suspended" | "revoked") => {
        if (!ip) return;
        setLoading(true);
        try {
            await adminIpLibraryApi.updateGrant(ip.id, grant.id, { status });
            message.success(status === "active" ? "授权已恢复" : status === "suspended" ? "授权已暂停" : "授权已撤销");
            await load();
        } catch (error) {
            message.error(errorMessage(error, "授权更新失败"));
        } finally {
            setLoading(false);
        }
    };
    return (
        <Drawer
            title={ip ? `${ip.title} · 学校授权` : "学校授权"}
            open={Boolean(ip)}
            width="min(760px, 100vw)"
            destroyOnHidden
            onClose={onClose}
            extra={
                <Button
                    type="primary"
                    icon={<Plus className="size-4" />}
                    onClick={() => {
                        form.resetFields();
                        form.setFieldsValue({ mode: "multi_school", startsAt: toLocalInput(new Date().toISOString()) });
                        setCreating(true);
                        void searchSchools();
                    }}
                >
                    新增授权
                </Button>
            }
        >
            <div className="space-y-2" aria-busy={loading}>
                {items.map((grant) => (
                    <article key={grant.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="font-medium">{grant.school?.name || "学校信息不可用"}</div>
                                <div className="mt-1 text-xs text-zinc-500">
                                    {ipAuthorizationLabel(grant.mode)} · {formatTime(grant.startsAt)} 至 {grant.endsAt ? formatTime(grant.endsAt) : "长期"}
                                </div>
                            </div>
                            <GrantStatusTag status={grant.status} />
                        </div>
                        <div className="mt-2 flex justify-end gap-1">
                            {grant.status === "active" ? (
                                <Button size="small" onClick={() => void update(grant, "suspended")}>
                                    暂停
                                </Button>
                            ) : grant.status === "suspended" ? (
                                <Button size="small" onClick={() => void update(grant, "active")}>
                                    恢复
                                </Button>
                            ) : null}
                            {grant.status !== "revoked" ? (
                                <Button size="small" danger onClick={() => void update(grant, "revoked")}>
                                    撤销
                                </Button>
                            ) : null}
                        </div>
                    </article>
                ))}
                {!items.length ? <EmptyText text="暂无学校授权记录。只有已发布的本校 IP 才能创建授权。" /> : null}
            </div>
            <Pagination className="mt-3" current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />
            <Modal title="新增学校授权" open={creating} destroyOnHidden width="min(560px, 100vw)" okText="创建授权" cancelText="取消" confirmLoading={loading} onCancel={() => setCreating(false)} onOk={() => form.submit()}>
                {items.filter((item) => item.status === "active").length ? (
                    <p className="mb-3 rounded-md bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                        当前有效授权：
                        {items
                            .filter((item) => item.status === "active")
                            .map((item) => `${item.school?.name || "学校"}（${ipAuthorizationLabel(item.mode)}，${formatTime(item.startsAt)} 至 ${item.endsAt ? formatTime(item.endsAt) : "长期"}）`)
                            .join("；")}
                    </p>
                ) : null}
                <Form form={form} layout="vertical" onFinish={create} className="pt-2">
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item name="schoolId" label="学校" rules={[{ required: true, message: "请选择学校" }]}>
                            <Select
                                showSearch
                                filterOption={false}
                                placeholder="搜索学校名称"
                                options={schools.map((school) => ({ value: school.id, label: school.name }))}
                                onSearch={(value) => void searchSchools(value)}
                                onOpenChange={(open) => {
                                    if (open && !schools.length) void searchSchools();
                                }}
                            />
                        </Form.Item>
                        <Form.Item name="mode" label="授权方式" rules={[{ required: true, message: "请选择授权方式" }]}>
                            <Select options={authorizationOptions} />
                        </Form.Item>
                    </div>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item name="startsAt" label="开始时间" rules={[{ required: true, message: "请选择开始时间" }]}>
                            <Input type="datetime-local" />
                        </Form.Item>
                        <Form.Item name="endsAt" label="结束时间">
                            <Input type="datetime-local" />
                        </Form.Item>
                    </div>
                    <Form.Item name="note" label="线下授权说明">
                        <Input.TextArea rows={3} maxLength={500} />
                    </Form.Item>
                </Form>
            </Modal>
        </Drawer>
    );
}

function UsagePanel() {
    const { message } = App.useApp();
    const [items, setItems] = useState<AdminIpUsageItem[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [downloadType, setDownloadType] = useState<IpDownloadType>();
    const [result, setResult] = useState<IpDownloadResult>();
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const pageResult = await adminIpLibraryApi.listUsage({ page, pageSize: PAGE_SIZE, downloadType, result });
            setItems(pageResult.items);
            setTotal(pageResult.total);
        } catch (error) {
            message.error(errorMessage(error, "下载记录加载失败"));
        } finally {
            setLoading(false);
        }
    }, [downloadType, message, page, result]);
    useEffect(() => void load(), [load]);
    const columns: TableColumnsType<AdminIpUsageItem> = [
        { title: "用户", render: (_, item) => (item.user ? <AdminUserIdentity accountId={item.user.accountId} username={item.user.username} displayName={item.user.displayName} /> : <span className="text-sm text-zinc-500">用户信息不可用</span>) },
        { title: "学校", width: 180, render: (_, item) => item.school?.name || "公共访问" },
        { title: "下载类型", width: 130, dataIndex: "downloadType", render: (value: IpDownloadType) => downloadTypeLabel[value] },
        { title: "结果", width: 100, dataIndex: "result", render: (value: IpDownloadResult) => <Tag color={value === "succeeded" ? "green" : "red"}>{downloadResultLabel[value]}</Tag> },
        { title: "时间", width: 170, dataIndex: "createdAt", render: (value: string) => <span className="text-xs text-zinc-500">{formatTime(value)}</span> },
    ];
    return (
        <section className="space-y-3">
            <div className="flex justify-end gap-2">
                <Select
                    allowClear
                    value={downloadType}
                    className="w-40"
                    placeholder="下载类型"
                    options={(Object.keys(downloadTypeLabel) as IpDownloadType[]).map((value) => ({ value, label: downloadTypeLabel[value] }))}
                    onChange={(value) => {
                        setDownloadType(value);
                        setPage(1);
                    }}
                />
                <Select
                    allowClear
                    value={result}
                    className="w-32"
                    placeholder="下载结果"
                    options={(Object.keys(downloadResultLabel) as IpDownloadResult[]).map((value) => ({ value, label: downloadResultLabel[value] }))}
                    onChange={(value) => {
                        setResult(value);
                        setPage(1);
                    }}
                />
                <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load()} />
            </div>
            <div className="hidden md:block">
                <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={false} scroll={{ x: 760 }} />
            </div>
            <div className="space-y-2 md:hidden">
                {items.map((item) => (
                    <article key={item.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                        {item.user ? <AdminUserIdentity accountId={item.user.accountId} username={item.user.username} displayName={item.user.displayName} /> : <span className="text-sm text-zinc-500">用户信息不可用</span>}
                        <div className="mt-2 flex justify-between text-xs text-zinc-500">
                            <span>
                                {item.school?.name || "公共访问"} · {downloadTypeLabel[item.downloadType]} · {downloadResultLabel[item.result]}
                            </span>
                            <span>{formatTime(item.createdAt)}</span>
                        </div>
                    </article>
                ))}
            </div>
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />
        </section>
    );
}

function IpStatusTag({ status }: { status: IpStatus }) {
    return <Tag color={status === "published" ? "green" : status === "draft" ? "gold" : "default"}>{statusLabel[status]}</Tag>;
}
function GrantStatusTag({ status }: { status: IpSchoolGrantRecord["status"] }) {
    const label = { active: "生效中", suspended: "已暂停", revoked: "已撤销", expired: "已到期" }[status];
    return <Tag color={status === "active" ? "green" : status === "suspended" ? "gold" : "default"}>{label}</Tag>;
}
function formatTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
function EmptyText({ text }: { text: string }) {
    return <div className="col-span-full py-8 text-center text-sm text-zinc-500">{text}</div>;
}
function slugSuggestion(value: string) {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || "new-ip";
}
function localToIso(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("授权时间无效");
    return date.toISOString();
}
function toLocalInput(value: string) {
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

const visibilityOptions = IP_VISIBILITIES.map((value) => ({ value, label: value === "public" ? "公共 IP" : "本校 IP" }));
const authorizationOptions = IP_AUTHORIZATION_MODES.map((value) => ({ value, label: ipAuthorizationLabel(value) }));
const statusOptions = IP_STATUSES.map((value) => ({ value, label: { draft: "草稿", published: "已发布", disabled: "已停用" }[value] }));
const kindOptions = IP_ASSET_KINDS.map((value) => ({ value, label: { text: "文本", image: "图片", audio: "音乐与声音", video: "视频参考" }[value] }));
const kindLabel: Record<IpAssetKind, string> = { text: "文本", image: "图片", audio: "音乐与声音", video: "视频参考" };
const statusLabel: Record<IpStatus, string> = { draft: "草稿", published: "已发布", disabled: "已停用" };
const versionStatusLabel = { draft: "草稿", published: "已发布", disabled: "已停用" } as const;
const downloadTypeLabel: Record<IpDownloadType, string> = { item: "单项下载", package: "完整包下载" };
const downloadResultLabel: Record<IpDownloadResult, string> = { succeeded: "成功", failed: "失败" };
const categoryLabels: Partial<Record<IpItemCategory, string>> = {
    story_summary: "故事梗概",
    worldbuilding: "世界观",
    character_biography: "角色小传",
    script: "剧本",
    derivative_script: "衍生剧本",
    creation_notes: "创作说明",
    character: "角色",
    scene: "场景",
    prop: "道具",
    effect: "特效",
    style: "风格参考",
    background_music: "背景音乐",
    theme_music: "主题音乐",
    character_voice: "角色声音",
    narration: "旁白",
    sound_effect: "音效",
    trailer: "预告片",
    action: "动作",
    performance: "表演",
    shot: "镜头",
    clip: "片段",
};
