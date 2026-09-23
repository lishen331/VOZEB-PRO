"use client";

import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Tree, message } from "antd";
import { Edit3, Plus, Power, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Panel, PanelHeader } from "@/components/admin/admin-panel";
import { permissionTreeCheckState, updatePermissionTreeSelection } from "@/components/admin/admin-rbac-permission-tree";
import { adminSectionGroups } from "@/components/admin/admin-section-nav";
import { adminMenuPermission } from "@/components/admin/admin-sections";
import { featureModuleDefinition, USER_NAVIGATION_MENU_PERMISSION_GROUPS, USER_NAVIGATION_ROLE_KEYS, type UserNavigationRoleKey } from "@/lib/feature-modules";

const MENU_PERMISSION_TREE = adminSectionGroups.map((group) => ({
    title: group.title,
    key: "admin-menu-group-" + group.title,
    children: group.items.map((section) => ({ title: section.label, key: adminMenuPermission(section.key) })),
}));

const SCHOOL_PERMISSION_TREE = [{ title: "学校管理", key: "school.manage" }] as const;

type Role = { key: string; name: string; scope: "platform" | "school" | "user"; permissions: string[]; status: "active" | "disabled"; builtin: boolean; administratorCount: number; createdAt: string };
type Administrator = { id: string; username: string; displayName: string; email?: string; roleKey: string; roleName: string; status: "active" | "disabled"; protected: boolean; createdAt: string };

const DEFAULT_ROLE_KEYS = new Set(["platform-superadmin", "school-superadmin", "teacher", "student", "normal-user"]);
function userMenuPermissionTree(roleKey?: UserNavigationRoleKey) {
    return USER_NAVIGATION_MENU_PERMISSION_GROUPS.map((group) => ({
        title: group.label,
        key: "menu-" + group.key,
        children: group.moduleIds
            .filter((id) => group.key !== "school" || (roleKey === "teacher" ? id === "teaching" : roleKey === "student" ? id === "learning" : false))
            .map((id) => ({ title: id === "practice" ? "无限练习" : featureModuleDefinition(id).name, key: id })),
    })).filter((group) => group.children.length);
}

function isUserNavigationRoleKey(key: string | undefined): key is UserNavigationRoleKey {
    return typeof key === "string" && USER_NAVIGATION_ROLE_KEYS.includes(key as UserNavigationRoleKey);
}

async function requestJson(path: string, init?: RequestInit) {
    const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "请求失败");
    return body;
}

export function AdminRoleManagementSection({ active }: { active: boolean }) {
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<Role | null>(null);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const saveInFlightRef = useRef(false);
    const [roleTab, setRoleTab] = useState<"platform" | "default">("platform");
    const [form] = Form.useForm<{ name: string; permissions: string[] }>();
    const selectedPermissions = Form.useWatch("permissions", form) || [];
    const permissionTree = isUserNavigationRoleKey(editing?.key) ? userMenuPermissionTree(editing.key) : editing?.scope === "school" ? SCHOOL_PERMISSION_TREE : MENU_PERMISSION_TREE;
    const treeCheckState = permissionTreeCheckState(permissionTree, selectedPermissions);
    const load = useCallback(async (options?: { silent?: boolean }) => {
        setLoading(true);
        try {
            setRoles((await requestJson("/api/admin/rbac/roles")).items || []);
        } catch (error) {
            if (!options?.silent) message.error(error instanceof Error ? error.message : "读取角色失败");
            if (options?.silent) throw error;
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        if (active) void load();
    }, [active, load]);
    const edit = (role?: Role) => {
        setCreating(!role);
        setEditing(role || null);
        form.setFieldsValue({ name: role?.name || "", permissions: role?.permissions || [] });
    };
    const save = async () => {
        if (saveInFlightRef.current) return;
        const values = await form.validateFields();
        saveInFlightRef.current = true;
        setSaving(true);
        try {
            if (creating) await requestJson("/api/admin/rbac/roles", { method: "POST", body: JSON.stringify(values) });
            else if (editing) await requestJson("/api/admin/rbac/roles/" + encodeURIComponent(editing.key), { method: "PATCH", body: JSON.stringify(values) });
            message.success("角色已保存");
            setEditing(null);
            setCreating(false);
            try {
                await load({ silent: true });
            } catch {
                message.warning("角色已保存，但列表刷新失败，请稍后刷新");
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存角色失败");
        } finally {
            saveInFlightRef.current = false;
            setSaving(false);
        }
    };

    const changeStatus = async (role: Role) => {
        try {
            await requestJson(`/api/admin/rbac/roles/${encodeURIComponent(role.key)}`, { method: "PATCH", body: JSON.stringify({ status: role.status === "active" ? "disabled" : "active" }) });
            message.success("角色状态已更新");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新失败");
        }
    };
    const remove = async (role: Role) => {
        try {
            await requestJson(`/api/admin/rbac/roles/${encodeURIComponent(role.key)}`, { method: "DELETE" });
            message.success("角色已删除");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        }
    };
    const isDefaultRole = (role: Role) => DEFAULT_ROLE_KEYS.has(role.key);
    const visibleRoles = roles.filter((role) => (roleTab === "default" ? isDefaultRole(role) : role.scope === "platform" && !isDefaultRole(role)));
    if (!active) return null;
    return (
        <Panel>
            <PanelHeader
                title="角色管理"
                description="平台管理员维护平台功能权限；默认管理员角色可调整菜单权限，但名称、启停和删除均固定。"
                actions={
                    roleTab === "platform" ? (
                        <Button icon={<Plus className="size-4" />} onClick={() => edit()}>
                            新增角色
                        </Button>
                    ) : null
                }
            />
            <Tabs
                activeKey={roleTab}
                onChange={(key) => setRoleTab(key as "platform" | "default")}
                items={[
                    { key: "platform", label: "平台管理员" },
                    { key: "default", label: "默认管理员" },
                ]}
            />
            <Table<Role>
                rowKey="key"
                loading={loading}
                dataSource={visibleRoles}
                pagination={false}
                scroll={{ x: 920 }}
                columns={[
                    {
                        title: "角色名称",
                        dataIndex: "name",
                        width: 220,
                        render: (name, role) => (
                            <Space>
                                <span>{name}</span>
                                {isDefaultRole(role) ? <Tag>默认角色</Tag> : null}
                            </Space>
                        ),
                    },
                    { title: "作用域", dataIndex: "scope", width: 120, render: (scope) => (scope === "platform" ? "平台" : scope === "school" ? "学校" : "前台用户") },
                    { title: "已绑定账号", dataIndex: "administratorCount", width: 130 },
                    { title: "状态", dataIndex: "status", width: 110, render: (status) => <Tag color={status === "active" ? "green" : "default"}>{status === "active" ? "启用" : "停用"}</Tag> },
                    {
                        title: "操作",
                        width: 230,
                        render: (_, role) => (
                            <Space>
                                <Button type="link" icon={<Edit3 className="size-4" />} onClick={() => edit(role)}>
                                    编辑
                                </Button>
                                <Popconfirm title={role.status === "active" ? "停用此角色？" : "启用此角色？"} disabled={isDefaultRole(role) || role.administratorCount > 0} onConfirm={() => void changeStatus(role)}>
                                    <Button type="link" disabled={isDefaultRole(role) || role.administratorCount > 0} icon={<Power className="size-4" />}>
                                        {role.status === "active" ? "停用" : "启用"}
                                    </Button>
                                </Popconfirm>
                                <Popconfirm title="删除此角色？" disabled={isDefaultRole(role) || role.administratorCount > 0} onConfirm={() => void remove(role)}>
                                    <Button type="link" danger disabled={isDefaultRole(role) || role.administratorCount > 0} icon={<Trash2 className="size-4" />}>
                                        删除
                                    </Button>
                                </Popconfirm>
                            </Space>
                        ),
                    },
                ]}
            />
            <Modal
                open={creating || Boolean(editing)}
                title={creating ? "新增角色" : "编辑角色"}
                onCancel={() => {
                    setCreating(false);
                    setEditing(null);
                }}
                onOk={() => void save()}
                confirmLoading={saving}
                width="min(760px, calc(100vw - 24px))"
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    <Form.Item label="角色名称" name="name" rules={[{ required: true, message: "请输入角色名称" }]}>
                        <Input maxLength={50} disabled={Boolean(editing && isDefaultRole(editing))} />
                    </Form.Item>
                    <Form.Item label={isUserNavigationRoleKey(editing?.key) ? "前台菜单权限" : editing?.scope === "school" ? "学校权限" : "菜单权限"} name="permissions" rules={creating || editing?.scope === "platform" || isUserNavigationRoleKey(editing?.key) ? [{ required: true, message: "请选择至少一项权限" }] : []}>
                            <Tree
                                checkable
                                checkStrictly
                                defaultExpandAll
                                checkedKeys={treeCheckState}
                                treeData={permissionTree as never}
                                onCheck={(_, info) => form.setFieldValue("permissions", updatePermissionTreeSelection(permissionTree, selectedPermissions, String(info.node.key), info.checked))}
                            />
                        </Form.Item>
                </Form>
            </Modal>
        </Panel>
    );
}

export function AdminAdministratorManagementSection({ active }: { active: boolean }) {
    const [administrators, setAdministrators] = useState<Administrator[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<Administrator | null>(null);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm<{ username: string; displayName: string; email?: string; password?: string; roleKey: string; status: "active" | "disabled" }>();
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [users, roleData] = await Promise.all([requestJson("/api/admin/rbac/administrators"), requestJson("/api/admin/rbac/roles")]);
            setAdministrators(users.items || []);
            setRoles((roleData.items || []).filter((role: Role) => role.scope === "platform" && role.status === "active"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取管理员失败");
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        if (active) void load();
    }, [active, load]);
    const edit = (administrator?: Administrator) => {
        setCreating(!administrator);
        setEditing(administrator || null);
        form.setFieldsValue({ username: administrator?.username || "", displayName: administrator?.displayName || "", email: administrator?.email || "", password: "", roleKey: administrator?.roleKey || "", status: administrator?.status || "active" });
    };
    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            if (creating) await requestJson("/api/admin/rbac/administrators", { method: "POST", body: JSON.stringify(values) });
            else if (editing) await requestJson(`/api/admin/rbac/administrators/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: JSON.stringify(values) });
            message.success("管理员已保存");
            setCreating(false);
            setEditing(null);
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存管理员失败");
        } finally {
            setSaving(false);
        }
    };
    const updateStatus = async (administrator: Administrator) => {
        try {
            await requestJson(`/api/admin/rbac/administrators/${administrator.id}`, { method: "PATCH", body: JSON.stringify({ status: administrator.status === "active" ? "disabled" : "active" }) });
            message.success("管理员状态已更新");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新失败");
        }
    };
    const remove = async (administrator: Administrator) => {
        try {
            await requestJson(`/api/admin/rbac/administrators/${administrator.id}`, { method: "DELETE" });
            message.success("管理员已删除");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        }
    };
    if (!active) return null;
    return (
        <Panel>
            <PanelHeader
                title="管理员管理"
                description="平台管理员只能分配平台角色；初始密码留空时不会改变已有密码。"
                actions={
                    <Button icon={<Plus className="size-4" />} onClick={() => edit()}>
                        新增管理员
                    </Button>
                }
            />
            <Table<Administrator>
                rowKey="id"
                loading={loading}
                dataSource={administrators}
                pagination={false}
                scroll={{ x: 880 }}
                columns={[
                    {
                        title: "管理员名称",
                        width: 220,
                        render: (_, item) => (
                            <div>
                                <div>{item.displayName}</div>
                                <div className="text-xs text-zinc-500">{item.username}</div>
                            </div>
                        ),
                    },
                    { title: "角色", dataIndex: "roleName", width: 170 },
                    { title: "状态", dataIndex: "status", width: 110, render: (status) => <Tag color={status === "active" ? "green" : "default"}>{status === "active" ? "启用" : "停用"}</Tag> },
                    { title: "创建时间", dataIndex: "createdAt", width: 190, render: (value) => new Date(value).toLocaleString("zh-CN", { hour12: false }) },
                    {
                        title: "操作",
                        width: 220,
                        render: (_, item) => (
                            <Space>
                                <Button type="link" icon={<Edit3 className="size-4" />} onClick={() => edit(item)}>
                                    编辑
                                </Button>
                                <Popconfirm title={item.status === "active" ? "停用该管理员？" : "启用该管理员？"} disabled={item.protected} onConfirm={() => void updateStatus(item)}>
                                    <Button type="link" disabled={item.protected} icon={<Power className="size-4" />}>
                                        {item.status === "active" ? "停用" : "启用"}
                                    </Button>
                                </Popconfirm>
                                <Popconfirm title="删除该管理员？" disabled={item.protected} onConfirm={() => void remove(item)}>
                                    <Button type="link" danger disabled={item.protected} icon={<Trash2 className="size-4" />}>
                                        删除
                                    </Button>
                                </Popconfirm>
                            </Space>
                        ),
                    },
                ]}
            />
            <Modal
                open={creating || Boolean(editing)}
                title={creating ? "新增管理员" : "编辑管理员"}
                onCancel={() => {
                    setCreating(false);
                    setEditing(null);
                }}
                onOk={() => void save()}
                confirmLoading={saving}
                width="min(680px, calc(100vw - 24px))"
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    <div className="grid gap-x-4 md:grid-cols-2">
                        <Form.Item label="管理员账号" name="username" rules={[{ required: creating, message: "请输入管理员账号" }]}>
                            <Input disabled={!creating} />
                        </Form.Item>
                        <Form.Item label="管理员名称" name="displayName" rules={[{ required: true, message: "请输入管理员名称" }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item label="初始密码" name="password" rules={[{ required: creating, message: "请输入初始密码" }]} extra={creating ? "至少 8 位" : "留空则不修改密码"}>
                            <Input.Password />
                        </Form.Item>
                        <Form.Item label="角色" name="roleKey" rules={[{ required: true, message: "请选择角色" }]}>
                            <Select options={roles.filter((role) => role.scope === "platform" && role.status === "active").map((role) => ({ value: role.key, label: role.name }))} disabled={editing?.protected} />
                        </Form.Item>
                        <Form.Item label="状态" name="status">
                            <Select
                                disabled={editing?.protected}
                                options={[
                                    { value: "active", label: "启用" },
                                    { value: "disabled", label: "停用" },
                                ]}
                            />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>
        </Panel>
    );
}
