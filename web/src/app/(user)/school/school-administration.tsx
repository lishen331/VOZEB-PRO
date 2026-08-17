"use client";

import type { FormInstance, TableColumnsType } from "antd";
import { App, Button, Drawer, Form, Input, Modal, Pagination, Select, Table, Tabs, Tag, Upload } from "antd";
import { BookOpen, Eye, KeyRound, Pencil, Plus, RefreshCw, School, Trash2, Upload as UploadIcon, UserRoundCog } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
    CourseOfferingInput,
    SchoolClass,
    SchoolClassDetail,
    SchoolClassInput,
    SchoolCourseAssignment,
    SchoolCourseOffering,
    SchoolDetail,
    SchoolMember,
    SchoolMemberCreateInput,
    SchoolMemberPatch,
    SchoolMemberRole,
    SchoolMembershipStatus,
} from "@/lib/school-domain";
import { coursesApi } from "@/services/api/courses";
import { schoolApi } from "@/services/api/school";
import { useSchoolContextStore } from "@/stores/use-school-context-store";
import { parseSchoolMemberCsv } from "./school-csv";

const PAGE_SIZE = 12;
const roleOptions = [
    { value: "teacher", label: "老师" },
    { value: "student", label: "学生" },
] as const;
const statusOptions = [
    { value: "active", label: "可用" },
    { value: "disabled", label: "禁用" },
] as const;

export function SchoolAdministration() {
    const context = useSchoolContextStore((state) => state.context);
    return (
        <main className="h-full min-h-0 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
                <header className="mb-4 flex items-center gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                    <div className="grid size-10 shrink-0 place-items-center rounded-md bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950">
                        <School className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-100">{context?.school.name || "学校管理"}</h1>
                        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">维护学校资料、成员账号与班级关系</p>
                    </div>
                </header>
                <Tabs
                    destroyOnHidden
                    items={[
                        { key: "profile", label: "学校资料", children: <ProfilePanel /> },
                        { key: "members", label: "成员管理", children: <MembersPanel /> },
                        { key: "classes", label: "班级管理", children: <ClassesPanel /> },
                        { key: "courses", label: "课程安排", children: <CoursesPanel /> },
                    ]}
                />
            </div>
        </main>
    );
}

function ProfilePanel() {
    const { message } = App.useApp();
    const [form] = Form.useForm<{ name: string; city?: string; contact?: string }>();
    const [profile, setProfile] = useState<SchoolDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const value = await schoolApi.getProfile();
            setProfile(value);
            form.setFieldsValue({ name: value.name, city: textValue(value.profile.city), contact: textValue(value.profile.contact) });
        } catch (error) {
            message.error(errorMessage(error, "学校资料加载失败"));
        } finally {
            setLoading(false);
        }
    }, [form, message]);

    useEffect(() => void load(), [load]);

    const save = async (values: { name: string; city?: string; contact?: string }) => {
        setSaving(true);
        try {
            const updated = await schoolApi.updateProfile({
                name: values.name,
                profile: { ...(profile?.profile || {}), city: values.city?.trim() || "", contact: values.contact?.trim() || "" },
            });
            setProfile(updated);
            const current = useSchoolContextStore.getState().context;
            useSchoolContextStore.getState().setContext(current ? { ...current, school: { ...current.school, name: updated.name } } : null);
            message.success("学校资料已保存");
        } catch (error) {
            message.error(errorMessage(error, "学校资料保存失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="max-w-3xl py-2">
            <Form form={form} layout="vertical" requiredMark={false} disabled={loading} onFinish={(values) => void save(values)}>
                <div className="grid gap-x-4 sm:grid-cols-2">
                    <Form.Item label="学校名称" name="name" className="sm:col-span-2" rules={[{ required: true, message: "请填写学校名称" }]}>
                        <Input maxLength={120} />
                    </Form.Item>
                    <Form.Item label="所在城市" name="city">
                        <Input maxLength={80} />
                    </Form.Item>
                    <Form.Item label="联系方式" name="contact">
                        <Input maxLength={120} />
                    </Form.Item>
                </div>
                <Button type="primary" htmlType="submit" loading={saving}>
                    保存资料
                </Button>
            </Form>
        </section>
    );
}

function MembersPanel() {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<SchoolMemberCreateInput>();
    const [items, setItems] = useState<SchoolMember[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [queryKeyword, setQueryKeyword] = useState("");
    const [role, setRole] = useState<SchoolMemberRole>();
    const [status, setStatus] = useState<SchoolMembershipStatus>();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [csvRows, setCsvRows] = useState<SchoolMemberCreateInput[]>([]);
    const [csvOpen, setCsvOpen] = useState(false);
    const [inviteCodes, setInviteCodes] = useState<Partial<Record<SchoolMemberRole, string>>>({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await schoolApi.listMembers({ page, pageSize: PAGE_SIZE, keyword: queryKeyword || undefined, role, status });
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            setItems([]);
            setTotal(0);
            message.error(errorMessage(error, "成员列表加载失败"));
        } finally {
            setLoading(false);
        }
    }, [message, page, queryKeyword, role, status]);

    useEffect(() => void load(), [load]);

    const createMember = async (values: SchoolMemberCreateInput) => {
        setSaving(true);
        try {
            await schoolApi.createMembers([values]);
            message.success("成员已创建");
            setCreateOpen(false);
            form.resetFields();
            await load();
        } catch (error) {
            message.error(errorMessage(error, "成员创建失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const update = async (member: SchoolMember, patch: SchoolMemberPatch, success: string) => {
        try {
            await schoolApi.updateMember(member.id, patch);
            message.success(success);
            await load();
        } catch (error) {
            message.error(errorMessage(error, "成员更新失败"));
        }
    };

    const remove = (member: SchoolMember) => {
        modal.confirm({
            title: `移出成员“${member.displayName}”`,
            content: "移出后该账号不再属于本校。仍被班级、课程或教学记录引用时将无法移出。",
            okText: "确认移出",
            okButtonProps: { danger: true },
            cancelText: "取消",
            async onOk() {
                await schoolApi.removeMember(member.id);
                message.success("成员已移出");
                await load();
            },
        });
    };

    const rotateInvite = async (targetRole: SchoolMemberRole) => {
        try {
            const result = await schoolApi.rotateInviteCode(targetRole);
            setInviteCodes((current) => ({ ...current, [targetRole]: result.code }));
            message.success(`${roleLabel(targetRole)}邀请码已轮换`);
        } catch (error) {
            message.error(errorMessage(error, "邀请码轮换失败"));
        }
    };

    const importCsv = async () => {
        setSaving(true);
        try {
            await schoolApi.importMembers(csvRows);
            message.success(`已导入 ${csvRows.length} 位成员`);
            setCsvOpen(false);
            setCsvRows([]);
            await load();
        } catch (error) {
            message.error(errorMessage(error, "成员导入失败"));
        } finally {
            setSaving(false);
        }
    };

    const memberActions = (member: SchoolMember) => (
        <div className="flex flex-wrap justify-end gap-1">
            {member.role === "teacher" ? (
                <Button
                    type="text"
                    size="small"
                    icon={<UserRoundCog className="size-3.5" />}
                    onClick={() => void update(member, { permissions: member.permissions.includes("school.manage") ? [] : ["school.manage"] }, member.permissions.includes("school.manage") ? "已取消学校管理权限" : "已授予学校管理权限")}
                >
                    {member.permissions.includes("school.manage") ? "取消管理" : "设为管理"}
                </Button>
            ) : null}
            <Button type="text" size="small" onClick={() => void update(member, { status: member.status === "active" ? "disabled" : "active" }, member.status === "active" ? "成员已禁用" : "成员已启用")}>
                {member.status === "active" ? "禁用" : "启用"}
            </Button>
            <Button danger type="text" size="small" icon={<Trash2 className="size-3.5" />} onClick={() => remove(member)}>
                移出
            </Button>
        </div>
    );

    const columns: TableColumnsType<SchoolMember> = [
        { title: "成员", render: (_, member) => <MemberIdentity member={member} /> },
        { title: "身份", dataIndex: "role", width: 100, render: (value: SchoolMemberRole) => roleLabel(value) },
        { title: "权限", width: 130, render: (_, member) => (member.permissions.includes("school.manage") ? <Tag color="blue">学校管理员</Tag> : <span className="text-zinc-400">普通成员</span>) },
        { title: "状态", dataIndex: "status", width: 90, render: (value: SchoolMembershipStatus) => <StatusTag status={value} /> },
        { title: "操作", width: 280, align: "right", render: (_, member) => memberActions(member) },
    ];

    return (
        <section className="space-y-3 py-2">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex">
                    <Input.Search
                        value={keyword}
                        allowClear
                        placeholder="账号 ID、用户名、姓名或邮箱"
                        className="col-span-2 sm:max-w-sm"
                        onChange={(event) => setKeyword(event.target.value)}
                        onSearch={(value) => {
                            setQueryKeyword(value.trim());
                            setPage(1);
                        }}
                    />
                    <Select
                        allowClear
                        value={role}
                        placeholder="身份"
                        className="w-full sm:w-28"
                        options={[...roleOptions]}
                        onChange={(value) => {
                            setRole(value);
                            setPage(1);
                        }}
                    />
                    <Select
                        allowClear
                        value={status}
                        placeholder="状态"
                        className="w-full sm:w-28"
                        options={[...statusOptions]}
                        onChange={(value) => {
                            setStatus(value);
                            setPage(1);
                        }}
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} aria-label="刷新成员列表" onClick={() => void load()} />
                    <Upload
                        accept=".csv,text/csv"
                        maxCount={1}
                        showUploadList={false}
                        beforeUpload={(file) => {
                            void previewCsv(file, setCsvRows, setCsvOpen, message.error);
                            return false;
                        }}
                    >
                        <Button icon={<UploadIcon className="size-4" />}>批量导入</Button>
                    </Upload>
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                        创建成员
                    </Button>
                </div>
            </div>

            <div className="flex flex-col gap-2 border-y border-zinc-200 py-3 sm:flex-row sm:items-center dark:border-zinc-800">
                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <KeyRound className="size-4 shrink-0" />
                    <span className="shrink-0">老师邀请码</span>
                    <code className="min-w-0 truncate text-xs text-zinc-500">{inviteCodes.teacher || "轮换后仅显示一次"}</code>
                </div>
                <Button size="small" onClick={() => void rotateInvite("teacher")}>
                    轮换
                </Button>
                <div className="hidden h-5 w-px bg-zinc-200 sm:block dark:bg-zinc-700" />
                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <KeyRound className="size-4 shrink-0" />
                    <span className="shrink-0">学生邀请码</span>
                    <code className="min-w-0 truncate text-xs text-zinc-500">{inviteCodes.student || "轮换后仅显示一次"}</code>
                </div>
                <Button size="small" onClick={() => void rotateInvite("student")}>
                    轮换
                </Button>
            </div>

            <div className="hidden md:block">
                <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={false} scroll={{ x: 880 }} />
            </div>
            <div className="space-y-2 md:hidden">
                {items.map((member) => (
                    <div key={member.id} className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-start justify-between gap-3">
                            <MemberIdentity member={member} />
                            <StatusTag status={member.status} />
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                            <span>{roleLabel(member.role)}</span>
                            {member.permissions.includes("school.manage") ? <Tag color="blue">学校管理员</Tag> : null}
                        </div>
                        <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">{memberActions(member)}</div>
                    </div>
                ))}
                {!loading && !items.length ? <EmptyText text="暂无成员" /> : null}
            </div>
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />

            <Modal
                title="创建成员"
                open={createOpen}
                okText="创建"
                cancelText="取消"
                confirmLoading={saving}
                width={560}
                afterOpenChange={(open) => {
                    if (!open) return;
                    form.resetFields();
                    form.setFieldsValue({ role: "student" });
                }}
                onOk={() => form.submit()}
                onCancel={() => setCreateOpen(false)}
            >
                <MemberForm form={form} onFinish={createMember} />
            </Modal>
            <Modal
                title="CSV 导入预览"
                open={csvOpen}
                okText={`导入 ${csvRows.length} 位成员`}
                cancelText="取消"
                okButtonProps={{ disabled: !csvRows.length }}
                confirmLoading={saving}
                width="min(720px, 100vw)"
                onOk={() => void importCsv()}
                onCancel={() => setCsvOpen(false)}
            >
                <p className="mb-3 text-sm text-zinc-500">固定列：username、displayName、password、role。此处只预览格式，完整校验在提交时由服务端执行。</p>
                <Table
                    rowKey={(row) => row.username}
                    size="small"
                    pagination={false}
                    scroll={{ x: 620, y: 360 }}
                    dataSource={csvRows}
                    columns={[
                        { title: "用户名", dataIndex: "username" },
                        { title: "姓名", dataIndex: "displayName" },
                        { title: "初始密码", render: () => "••••••" },
                        { title: "身份", dataIndex: "role", render: (value: string) => (value === "teacher" ? "老师" : value === "student" ? "学生" : value) },
                    ]}
                />
            </Modal>
        </section>
    );
}

function ClassesPanel() {
    const { message, modal } = App.useApp();
    const [createForm] = Form.useForm<SchoolClassInput>();
    const [editForm] = Form.useForm<ClassEditForm>();
    const [items, setItems] = useState<SchoolClass[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<SchoolClassDetail | null>(null);
    const [teachers, setTeachers] = useState<SchoolMember[]>([]);
    const [students, setStudents] = useState<SchoolMember[]>([]);
    const memberRequestSequence = useRef({ teacher: 0, student: 0 });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await schoolApi.listClasses({ page, pageSize: PAGE_SIZE });
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            setItems([]);
            setTotal(0);
            message.error(errorMessage(error, "班级列表加载失败"));
        } finally {
            setLoading(false);
        }
    }, [message, page]);

    useEffect(() => void load(), [load]);

    const createClass = async (values: SchoolClassInput) => {
        setSaving(true);
        try {
            await schoolApi.createClass(values);
            message.success("班级已创建");
            setCreateOpen(false);
            createForm.resetFields();
            await load();
        } catch (error) {
            message.error(errorMessage(error, "班级创建失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const searchMemberCandidates = async (role: SchoolMemberRole, keyword: string, selected: SchoolMember[] = []) => {
        const requestId = ++memberRequestSequence.current[role];
        const result = await schoolApi.listMembers({ page: 1, pageSize: 20, role, status: "active", keyword: keyword.trim() || undefined });
        if (requestId !== memberRequestSequence.current[role]) return;
        const items = [...new Map([...selected, ...result.items].map((member) => [member.id, member])).values()];
        if (role === "teacher") setTeachers(items);
        else setStudents(items);
    };

    const openEdit = async (schoolClass: SchoolClass) => {
        setLoading(true);
        try {
            const detail = await schoolApi.getClass(schoolClass.id);
            setEditing(detail);
            await Promise.all([searchMemberCandidates("teacher", "", detail.teachers), searchMemberCandidates("student", "", detail.students)]);
        } catch (error) {
            message.error(errorMessage(error, "班级资料加载失败"));
        } finally {
            setLoading(false);
        }
    };

    const saveClass = async (values: ClassEditForm) => {
        if (!editing) return;
        setSaving(true);
        try {
            await schoolApi.updateClass(editing.id, values);
            message.success("班级与成员已保存");
            setEditing(null);
            editForm.resetFields();
            await load();
        } catch (error) {
            message.error(errorMessage(error, "班级保存失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const removeClass = (schoolClass: SchoolClass) => {
        modal.confirm({
            title: `删除班级“${schoolClass.name}”`,
            content: "班级被课程或商单引用时不能删除。",
            okText: "确认删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            async onOk() {
                await schoolApi.removeClass(schoolClass.id);
                message.success("班级已删除");
                await load();
            },
        });
    };

    const actions = (schoolClass: SchoolClass) => (
        <div className="flex justify-end gap-1">
            <Button type="text" size="small" icon={<Pencil className="size-3.5" />} onClick={() => void openEdit(schoolClass)}>
                编辑
            </Button>
            <Button danger type="text" size="small" icon={<Trash2 className="size-3.5" />} onClick={() => removeClass(schoolClass)}>
                删除
            </Button>
        </div>
    );

    const columns: TableColumnsType<SchoolClass> = [
        {
            title: "班级",
            render: (_, item) => (
                <div>
                    <div className="font-medium text-zinc-950 dark:text-zinc-100">{item.name}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{item.description || "暂无说明"}</div>
                </div>
            ),
        },
        { title: "状态", dataIndex: "status", width: 100, render: (value: SchoolMembershipStatus) => <StatusTag status={value} /> },
        { title: "更新时间", dataIndex: "updatedAt", width: 168, render: (value: string) => <span className="text-xs text-zinc-500">{formatTime(value)}</span> },
        { title: "操作", width: 180, align: "right", render: (_, item) => actions(item) },
    ];

    return (
        <section className="space-y-3 py-2">
            <div className="flex justify-end gap-2">
                <Button icon={<RefreshCw className="size-4" />} loading={loading} aria-label="刷新班级列表" onClick={() => void load()} />
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                    创建班级
                </Button>
            </div>
            <div className="hidden md:block">
                <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={false} />
            </div>
            <div className="space-y-2 md:hidden">
                {items.map((item) => (
                    <div key={item.id} className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{item.name}</div>
                                <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{item.description || "暂无说明"}</div>
                            </div>
                            <StatusTag status={item.status} />
                        </div>
                        <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">{actions(item)}</div>
                    </div>
                ))}
                {!loading && !items.length ? <EmptyText text="暂无班级" /> : null}
            </div>
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />

            <Modal
                title="创建班级"
                open={createOpen}
                okText="创建"
                cancelText="取消"
                confirmLoading={saving}
                width={560}
                afterOpenChange={(open) => {
                    if (open) createForm.resetFields();
                }}
                onOk={() => createForm.submit()}
                onCancel={() => setCreateOpen(false)}
            >
                <Form form={createForm} layout="vertical" requiredMark={false} onFinish={(values) => void createClass(values)}>
                    <Form.Item label="班级名称" name="name" rules={[{ required: true, message: "请填写班级名称" }]}>
                        <Input maxLength={120} />
                    </Form.Item>
                    <Form.Item label="班级说明" name="description">
                        <Input.TextArea rows={3} maxLength={500} showCount />
                    </Form.Item>
                </Form>
            </Modal>
            <Drawer
                title="编辑班级"
                open={Boolean(editing)}
                size="min(640px, 100vw)"
                afterOpenChange={(open) => {
                    if (!open || !editing) return;
                    editForm.resetFields();
                    editForm.setFieldsValue({
                        name: editing.name,
                        description: editing.description,
                        status: editing.status,
                        teacherMembershipIds: editing.teachers.map((member) => member.id),
                        studentMembershipIds: editing.students.map((member) => member.id),
                    });
                }}
                onClose={() => setEditing(null)}
                extra={
                    <Button type="primary" loading={saving} onClick={() => editForm.submit()}>
                        保存
                    </Button>
                }
            >
                <Form form={editForm} layout="vertical" requiredMark={false} onFinish={(values) => void saveClass(values)}>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item label="班级名称" name="name" className="sm:col-span-2" rules={[{ required: true, message: "请填写班级名称" }]}>
                            <Input maxLength={120} />
                        </Form.Item>
                        <Form.Item label="班级状态" name="status">
                            <Select options={[...statusOptions]} />
                        </Form.Item>
                        <div />
                        <Form.Item label="负责老师" name="teacherMembershipIds" className="sm:col-span-2">
                            <Select
                                mode="multiple"
                                maxTagCount="responsive"
                                optionFilterProp="label"
                                showSearch
                                filterOption={false}
                                options={teachers.map(memberOption)}
                                onSearch={(value) => void searchMemberCandidates("teacher", value, editing?.teachers)}
                            />
                        </Form.Item>
                        <Form.Item label="班级学生" name="studentMembershipIds" className="sm:col-span-2">
                            <Select
                                mode="multiple"
                                maxTagCount="responsive"
                                optionFilterProp="label"
                                showSearch
                                filterOption={false}
                                options={students.map(memberOption)}
                                onSearch={(value) => void searchMemberCandidates("student", value, editing?.students)}
                            />
                        </Form.Item>
                        <Form.Item label="班级说明" name="description" className="sm:col-span-2">
                            <Input.TextArea rows={4} maxLength={500} showCount />
                        </Form.Item>
                    </div>
                </Form>
            </Drawer>
        </section>
    );
}

function CoursesPanel() {
    const { message } = App.useApp();
    const [form] = Form.useForm<CourseOfferingForm>();
    const [items, setItems] = useState<SchoolCourseAssignment[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [viewing, setViewing] = useState<SchoolCourseAssignment | null>(null);
    const [arranging, setArranging] = useState<SchoolCourseAssignment | null>(null);
    const [offerings, setOfferings] = useState<SchoolCourseOffering[]>([]);
    const [classes, setClasses] = useState<SchoolClass[]>([]);
    const [teachers, setTeachers] = useState<SchoolMember[]>([]);
    const [offeringPage, setOfferingPage] = useState(1);
    const [offeringTotal, setOfferingTotal] = useState(0);
    const classRequestSequence = useRef(0);
    const teacherRequestSequence = useRef(0);
    const offeringRequestSequence = useRef(0);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await coursesApi.listSchoolCourses({ page, pageSize: PAGE_SIZE });
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            setItems([]);
            setTotal(0);
            message.error(errorMessage(error, "学校课程加载失败"));
        } finally {
            setLoading(false);
        }
    }, [message, page]);

    useEffect(() => void load(), [load]);

    const loadOfferings = async (assignmentId: string, nextPage: number) => {
        const requestId = ++offeringRequestSequence.current;
        const result = await coursesApi.listCourseOfferings(assignmentId, { page: nextPage, pageSize: PAGE_SIZE });
        if (requestId !== offeringRequestSequence.current) return;
        setOfferings(result.items);
        setOfferingTotal(result.total);
    };

    const searchClasses = async (keyword: string) => {
        const requestId = ++classRequestSequence.current;
        const result = await schoolApi.listClasses({ page: 1, pageSize: 20, keyword: keyword.trim() || undefined, status: "active" });
        if (requestId !== classRequestSequence.current) return;
        const selectedId = form.getFieldValue("classId");
        setClasses((current) => [...new Map([...current.filter((item) => item.id === selectedId), ...result.items].map((item) => [item.id, item])).values()]);
    };

    const searchTeachers = async (keyword: string) => {
        const requestId = ++teacherRequestSequence.current;
        const result = await schoolApi.listMembers({ page: 1, pageSize: 20, role: "teacher", status: "active", keyword: keyword.trim() || undefined });
        if (requestId !== teacherRequestSequence.current) return;
        const selectedId = form.getFieldValue("teacherMembershipId");
        setTeachers((current) => [...new Map([...current.filter((item) => item.id === selectedId), ...result.items].map((item) => [item.id, item])).values()]);
    };

    const openDetails = async (assignment: SchoolCourseAssignment) => {
        setLoading(true);
        setViewing(assignment);
        setOfferings([]);
        setOfferingTotal(0);
        try {
            setOfferingPage(1);
            await loadOfferings(assignment.id, 1);
        } catch (error) {
            message.error(errorMessage(error, "教学安排加载失败"));
        } finally {
            setLoading(false);
        }
    };

    const openArrange = async (assignment: SchoolCourseAssignment) => {
        setLoading(true);
        setArranging(assignment);
        try {
            setClasses([]);
            setTeachers([]);
            await Promise.all([searchClasses(""), searchTeachers("")]);
        } catch (error) {
            setArranging(null);
            message.error(errorMessage(error, "班级与老师加载失败"));
        } finally {
            setLoading(false);
        }
    };

    const createOffering = async (values: CourseOfferingForm) => {
        if (!arranging) return;
        setSaving(true);
        try {
            const input: CourseOfferingInput = {
                classId: values.classId,
                teacherMembershipId: values.teacherMembershipId,
                supplementalResources: (values.supplementalResources || []).map((item) => ({ title: item.title.trim(), url: item.url.trim() })),
            };
            await coursesApi.createCourseOffering(arranging.id, input);
            message.success("教学安排已创建");
            setArranging(null);
            form.resetFields();
            if (viewing?.id === arranging.id) {
                setOfferingPage(1);
                await loadOfferings(arranging.id, 1);
            }
        } catch (error) {
            message.error(errorMessage(error, "教学安排创建失败"));
            throw error;
        } finally {
            setSaving(false);
        }
    };

    const actions = (assignment: SchoolCourseAssignment) => {
        const available = assignment.status === "active" && assignment.course.status === "published";
        return (
            <div className="flex flex-wrap justify-end gap-1">
                <Button type="text" size="small" icon={<Eye className="size-3.5" />} onClick={() => void openDetails(assignment)}>
                    内容与安排
                </Button>
                {available ? (
                    <Button type="text" size="small" icon={<Plus className="size-3.5" />} onClick={() => void openArrange(assignment)}>
                        创建教学安排
                    </Button>
                ) : null}
            </div>
        );
    };

    const columns: TableColumnsType<SchoolCourseAssignment> = [
        {
            title: "课程",
            render: (_, assignment) => (
                <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-950 dark:text-zinc-100">{assignment.course.title}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{assignment.course.summary || "暂无摘要"}</div>
                    {assignment.status !== "active" || assignment.course.status !== "published" ? <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">课程已停用，不能创建新的教学安排</div> : null}
                </div>
            ),
        },
        { title: "章节/课时", width: 110, render: (_, assignment) => assignment.course.chapters.length },
        { title: "状态", width: 110, render: (_, assignment) => <CourseAssignmentStatus assignment={assignment} /> },
        { title: "操作", width: 260, align: "right", render: (_, assignment) => actions(assignment) },
    ];

    return (
        <section className="space-y-3 py-2">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
                <div className="min-w-0">
                    <h2 className="text-sm font-medium text-zinc-950 dark:text-zinc-100">平台分配课程</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">平台课程内容只读，本校仅配置班级、负责老师和补充资料。</p>
                </div>
                <Button icon={<RefreshCw className="size-4" />} aria-label="刷新学校课程" loading={loading} onClick={() => void load()} />
            </div>

            <div className="hidden md:block">
                <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={false} scroll={{ x: 760 }} />
            </div>
            <div className="space-y-2 md:hidden" aria-busy={loading}>
                {items.map((assignment) => {
                    const available = assignment.status === "active" && assignment.course.status === "published";
                    return (
                        <article key={assignment.id} className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="truncate text-sm font-medium">{assignment.course.title}</h3>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{assignment.course.summary || "暂无摘要"}</p>
                                </div>
                                <CourseAssignmentStatus assignment={assignment} />
                            </div>
                            {!available ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">课程已停用，不能创建新的教学安排</p> : null}
                            <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">{actions(assignment)}</div>
                        </article>
                    );
                })}
                {!loading && !items.length ? <EmptyText text="暂无已分配课程" /> : null}
            </div>
            <Pagination current={page} pageSize={PAGE_SIZE} total={total} hideOnSinglePage showSizeChanger={false} responsive onChange={setPage} />

            <Drawer
                title={viewing?.course.title || "课程内容与安排"}
                open={Boolean(viewing)}
                destroyOnHidden
                size="min(640px, 100vw)"
                onClose={() => setViewing(null)}
                extra={
                    viewing && viewing.status === "active" && viewing.course.status === "published" ? (
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => void openArrange(viewing)}>
                            新建安排
                        </Button>
                    ) : null
                }
            >
                {viewing ? (
                    <div className="space-y-5">
                        <section>
                            <h3 className="text-sm font-medium">课程正文</h3>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">{courseBody(viewing) || viewing.course.summary || "暂无正文"}</p>
                        </section>
                        <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                            <h3 className="text-sm font-medium">章节与课时</h3>
                            <div className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
                                {viewing.course.chapters.map((chapter, index) => (
                                    <div key={`${index}-${outlineTitle(chapter)}`} className="py-2 text-sm">
                                        {outlineTitle(chapter) || `课时 ${index + 1}`}
                                    </div>
                                ))}
                                {!viewing.course.chapters.length ? <p className="py-3 text-sm text-zinc-500">暂无章节或课时</p> : null}
                            </div>
                        </section>
                        <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                            <h3 className="text-sm font-medium">课程附件</h3>
                            <ResourceList values={viewing.course.attachments} emptyText="暂无课程附件" />
                        </section>
                        <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                            <h3 className="text-sm font-medium">本校教学安排</h3>
                            <div className="mt-2 space-y-2">
                                {offerings.map((offering) => (
                                    <div key={offering.id} className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate">{offering.className}</span>
                                            <StatusTag status={offering.status} />
                                        </div>
                                        <div className="mt-1 text-xs text-zinc-500">课程：{offering.courseTitle}</div>
                                        <div className="mt-1 text-xs text-zinc-500">
                                            负责老师：{offering.teacher.displayName}
                                            {offering.teacher.accountId ? `（ID：${offering.teacher.accountId}）` : ""}
                                        </div>
                                        <div className="mt-1 text-xs text-zinc-500">补充资料 {offering.supplementalResources.length} 项</div>
                                    </div>
                                ))}
                                {!offerings.length ? <p className="py-3 text-sm text-zinc-500">暂无教学安排</p> : null}
                            </div>
                            <Pagination
                                className="mt-3"
                                current={offeringPage}
                                pageSize={PAGE_SIZE}
                                total={offeringTotal}
                                hideOnSinglePage
                                showSizeChanger={false}
                                responsive
                                onChange={(nextPage) => {
                                    setOfferingPage(nextPage);
                                    if (viewing) void loadOfferings(viewing.id, nextPage);
                                }}
                            />
                        </section>
                    </div>
                ) : null}
            </Drawer>

            <Modal
                title={`创建教学安排${arranging ? ` · ${arranging.course.title}` : ""}`}
                open={Boolean(arranging)}
                destroyOnHidden
                width="min(620px, calc(100vw - 24px))"
                okText="创建"
                cancelText="取消"
                confirmLoading={saving}
                afterOpenChange={(open) => {
                    if (!open) return;
                    form.resetFields();
                    form.setFieldsValue({ supplementalResources: [] });
                }}
                onOk={() => form.submit()}
                onCancel={() => setArranging(null)}
            >
                <Form form={form} layout="vertical" requiredMark={false} preserve={false} onFinish={(values) => void createOffering(values)}>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item label="班级" name="classId" rules={[{ required: true, message: "请选择班级" }]}>
                            <Select optionFilterProp="label" showSearch filterOption={false} options={classes.map((item) => ({ value: item.id, label: item.name }))} onSearch={(value) => void searchClasses(value)} />
                        </Form.Item>
                        <Form.Item label="负责老师" name="teacherMembershipId" rules={[{ required: true, message: "请选择负责老师" }]}>
                            <Select optionFilterProp="label" showSearch filterOption={false} options={teachers.map(memberOption)} onSearch={(value) => void searchTeachers(value)} />
                        </Form.Item>
                    </div>
                    <Form.List name="supplementalResources">
                        {(fields, { add, remove }) => (
                            <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <h3 className="text-sm font-medium">补充资料</h3>
                                    <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => add({ title: "", url: "" })}>
                                        添加
                                    </Button>
                                </div>
                                <div className="space-y-3">
                                    {fields.map((field) => (
                                        <div key={field.key} className="grid grid-cols-[minmax(96px,0.7fr)_minmax(0,1.3fr)_32px] gap-2">
                                            <Form.Item name={[field.name, "title"]} className="mb-0" rules={[{ required: true, message: "请填写名称" }]}>
                                                <Input placeholder="资料名称" />
                                            </Form.Item>
                                            <Form.Item name={[field.name, "url"]} className="mb-0" rules={[{ required: true, type: "url", message: "请填写有效 URL" }]}>
                                                <Input placeholder="https://" />
                                            </Form.Item>
                                            <Button danger type="text" icon={<Trash2 className="size-4" />} aria-label="删除补充资料" onClick={() => remove(field.name)} />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </Form.List>
                </Form>
            </Modal>
        </section>
    );
}

type CourseOfferingForm = Omit<CourseOfferingInput, "supplementalResources"> & { supplementalResources: Array<{ title: string; url: string }> };

function CourseAssignmentStatus({ assignment }: { assignment: SchoolCourseAssignment }) {
    return assignment.status === "active" && assignment.course.status === "published" ? <Tag color="green">可安排</Tag> : <Tag>已停用</Tag>;
}

function courseBody(assignment: SchoolCourseAssignment) {
    return typeof assignment.course.content.body === "string" ? assignment.course.content.body : "";
}

function outlineTitle(value: unknown) {
    return value && typeof value === "object" && typeof (value as Record<string, unknown>).title === "string" ? String((value as Record<string, unknown>).title) : "";
}

function ResourceList({ values, emptyText }: { values: unknown[]; emptyText: string }) {
    return (
        <div className="mt-2 space-y-2">
            {values.map((value, index) => {
                const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
                const title = typeof source.title === "string" ? source.title : `附件 ${index + 1}`;
                const url = typeof source.url === "string" ? source.url : "";
                return url ? (
                    <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="block truncate text-sm text-cyan-700 hover:underline dark:text-cyan-300">
                        {title}
                    </a>
                ) : (
                    <div key={index} className="text-sm text-zinc-500">
                        {title}
                    </div>
                );
            })}
            {!values.length ? <p className="text-sm text-zinc-500">{emptyText}</p> : null}
        </div>
    );
}

function MemberForm({ form, onFinish }: { form: FormInstance<SchoolMemberCreateInput>; onFinish: (values: SchoolMemberCreateInput) => Promise<void> }) {
    return (
        <Form form={form} layout="vertical" requiredMark={false} onFinish={(values) => void onFinish(values)}>
            <div className="grid gap-x-3 sm:grid-cols-2">
                <Form.Item label="用户名" name="username" rules={[{ required: true, message: "请填写用户名" }]}>
                    <Input autoComplete="off" />
                </Form.Item>
                <Form.Item label="显示姓名" name="displayName" rules={[{ required: true, message: "请填写显示姓名" }]}>
                    <Input />
                </Form.Item>
                <Form.Item label="邮箱" name="email">
                    <Input type="email" />
                </Form.Item>
                <Form.Item label="身份" name="role" rules={[{ required: true, message: "请选择身份" }]}>
                    <Select options={[...roleOptions]} />
                </Form.Item>
                <Form.Item label="初始密码" name="password" className="sm:col-span-2" rules={[{ required: true, message: "请填写初始密码" }]}>
                    <Input.Password autoComplete="new-password" />
                </Form.Item>
            </div>
        </Form>
    );
}

function MemberIdentity({ member }: { member: SchoolMember }) {
    return (
        <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">{member.displayName}</div>
            <div className="mt-0.5 truncate text-xs text-zinc-500">
                ID：{member.accountId} · @{member.username}
                {member.email ? ` · ${member.email}` : ""}
            </div>
        </div>
    );
}

function StatusTag({ status }: { status: SchoolMembershipStatus }) {
    return status === "active" ? <Tag color="green">可用</Tag> : <Tag>禁用</Tag>;
}

function EmptyText({ text }: { text: string }) {
    return <div className="py-10 text-center text-sm text-zinc-500">{text}</div>;
}

type ClassEditForm = SchoolClassInput & { status: SchoolMembershipStatus; teacherMembershipIds: string[]; studentMembershipIds: string[] };

async function previewCsv(file: File, setRows: (rows: SchoolMemberCreateInput[]) => void, setOpen: (open: boolean) => void, showError: (content: string) => void) {
    try {
        const result = parseSchoolMemberCsv(await file.text());
        if (!result.ok) return showError(result.message);
        setRows(result.rows);
        setOpen(true);
    } catch {
        showError("CSV 文件读取失败");
    }
}

function memberOption(member: SchoolMember) {
    return { value: member.id, label: `${member.displayName}（ID：${member.accountId}）` };
}

function roleLabel(role: SchoolMemberRole) {
    return role === "teacher" ? "老师" : "学生";
}

function textValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function formatTime(value: string) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? "-" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(time);
}
