"use client";

import { roleNavigationOverview, type RoleNavigationItem, type RoleNavigationKey } from "@/constant/navigation-tools";
import { Button, Drawer, Segmented, Tag } from "antd";
import { Eye, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

const roleOptions = [
    { label: "教师端", value: "teacher" },
    { label: "学生端", value: "student" },
    { label: "学校管理员端", value: "schoolAdmin" },
] as const satisfies ReadonlyArray<{ label: string; value: Exclude<RoleNavigationKey, "public"> }>;

const computeRoleCapabilities: Record<Exclude<RoleNavigationKey, "public">, string[]> = {
    teacher: ["组长追加申请"],
    student: ["个人永久积分垫付"],
    schoolAdmin: ["制作小组", "学校算力分配", "返还确认"],
};

export function roleOverviewPreviewItems(role: RoleNavigationKey): RoleNavigationItem[] {
    return roleNavigationOverview[role].items;
}

export function AdminRoleOverviewSection() {
    const [role, setRole] = useState<Exclude<RoleNavigationKey, "public">>("teacher");
    const [previewOpen, setPreviewOpen] = useState(false);
    const definition = roleNavigationOverview[role];
    const groupedItems = useMemo(() => {
        const groups = new Map<string, RoleNavigationItem[]>();
        roleOverviewPreviewItems(role).forEach((item) => groups.set(item.group, [...(groups.get(item.group) || []), item]));
        return [...groups.entries()];
    }, [role]);

    return (
        <section data-role-overview className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950">
                        <ShieldCheck className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">角色功能总览</h2>
                        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">只读展示真实导航入口，不创建学校成员、项目或练习数据。</p>
                    </div>
                </div>
                <Segmented options={[...roleOptions]} value={role} onChange={(value) => setRole(value as typeof role)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {groupedItems.map(([group, items]) => (
                    <div key={group} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="mb-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{group === "projects" ? "项目" : group === "school" ? "学校" : group === "create" ? "创作" : group === "assets" ? "资产" : "社区"}</div>
                        <div className="space-y-2">
                            {items.map((item) => (
                                <div key={item.slug} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.label}</div>
                                        <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{item.route}</div>
                                    </div>
                                    {item.slug === "practice" ? <Tag color="blue">学校身份</Tag> : null}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">学校算力与制作小组</div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {computeRoleCapabilities[role].map((capability) => (
                        <Tag key={capability} color="blue">
                            {capability}
                        </Tag>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
                <div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{definition.label}</div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{definition.description}</div>
                </div>
                <Button icon={<Eye className="size-4" />} onClick={() => setPreviewOpen(true)}>
                    打开只读预览
                </Button>
            </div>

            <Drawer title={`${definition.label} · 角色预览`} open={previewOpen} onClose={() => setPreviewOpen(false)} width="min(560px, 100vw)" destroyOnHidden>
                <div className="space-y-4">
                    <Tag color="blue">角色预览 · 不会执行写操作</Tag>
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">这里仅展示该角色在用户端可能看到的入口。真实访问仍由登录用户、学校状态和成员权限在服务端校验。</p>
                    <div className="space-y-2">
                        {roleOverviewPreviewItems(role).map((item) => (
                            <div key={item.slug} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
                                <span className="text-sm text-zinc-900 dark:text-zinc-100">{item.label}</span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.access}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </Drawer>
        </section>
    );
}
