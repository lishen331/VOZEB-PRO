"use client";

import { Form, Input, InputNumber, Modal, Select } from "antd";

import type { AdminDashboardController } from "./use-admin-dashboard-controller";
import { hasAdminPermission } from "@/lib/admin-permissions";

export function AdminUserEditorModal({ controller }: { controller: AdminDashboardController }) {
    const { currentUser, userForm, editingUser, creatingUser, updatingUserId, closeUserEditor, saveUserEditor } = controller;
    const canManageUsers = hasAdminPermission(currentUser, "users.manage");
    const canManageBilling = hasAdminPermission(currentUser, "billing.manage");
    const isSchoolMember = Boolean(editingUser?.schoolName);

    return (
        <Modal
            title={creatingUser ? "新增用户" : editingUser ? `用户管理：${editingUser.displayName}` : "用户管理"}
            open={creatingUser || Boolean(editingUser)}
            okText={creatingUser ? "新增" : "保存"}
            cancelText="取消"
            centered
            width="min(760px, calc(100vw - 24px))"
            confirmLoading={creatingUser ? updatingUserId === "__new__" : Boolean(editingUser && updatingUserId === editingUser.id)}
            onOk={() => userForm.submit()}
            onCancel={closeUserEditor}
            styles={{ container: { display: "flex", maxHeight: "calc(100dvh - 24px)", flexDirection: "column" }, body: { minHeight: 0, overflowY: "auto", paddingTop: 12 }, footer: { flexShrink: 0 } }}
        >
            <Form form={userForm} layout="vertical" requiredMark={false} onFinish={saveUserEditor}>
                <div className="grid gap-x-4 md:grid-cols-2">
                    <Form.Item label="用户名" name="username" rules={[{ required: creatingUser, message: "请输入用户名" }]}>
                        <Input disabled={!creatingUser || !canManageUsers} placeholder="用于登录的账号" />
                    </Form.Item>
                    <Form.Item label="显示昵称" name="displayName" rules={[{ required: true, message: "请输入显示昵称" }]}>
                        <Input disabled={!canManageUsers} placeholder="显示在顶部账号菜单" />
                    </Form.Item>
                    <Form.Item label="绑定邮箱" name="email">
                        <Input disabled={!canManageUsers} placeholder="可留空" />
                    </Form.Item>
                    <Form.Item label="所属学校">
                        <Input disabled value={editingUser?.schoolName || "---"} />
                    </Form.Item>
                    <Form.Item
                        label={creatingUser ? "登录密码" : "重置密码"}
                        name="password"
                        rules={[{ required: creatingUser, message: "请输入登录密码" }]}
                        extra={creatingUser ? "至少 8 位，创建后用户可自行修改。" : "留空则不修改密码；填写后该用户需要重新登录。"}
                    >
                        <Input.Password disabled={!canManageUsers} placeholder="至少 8 位" />
                    </Form.Item>
                    <Form.Item label="账号状态" name="status" rules={[{ required: true, message: "请选择状态" }]}>
                        <Select
                            disabled={!canManageUsers || editingUser?.id === currentUser.id || isSchoolMember}
                            options={[
                                { value: "active", label: "可用" },
                                { value: "disabled", label: "禁用" },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item label="永久积分" name="pointsBalance" extra={editingUser ? "每日积分由系统自动结算" : undefined} rules={[{ required: true, message: "请输入永久积分" }]}>
                        <InputNumber className="!w-full" disabled={!canManageBilling || isSchoolMember} min={0} precision={2} />
                    </Form.Item>
                </div>
            </Form>
        </Modal>
    );
}
