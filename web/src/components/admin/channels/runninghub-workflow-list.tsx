"use client";

import { App, Button, Empty, Input, Popconfirm, Select, Space, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { Plus, RefreshCw, Settings2, TestTube, ToggleLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { SystemModelChannel } from "@/lib/auth/store";
import type { RunningHubWorkflowBusinessCode } from "@/lib/auth/store-types";
import type { PublicRunningHubWorkflow } from "@/lib/server/runninghub-workflow-service";

import { RunningHubWorkflowEditor } from "./runninghub-workflow-editor";
import { RunningHubWorkflowTestPanel } from "./runninghub-workflow-test-panel";

const labels: Record<RunningHubWorkflowBusinessCode, string> = {
    script: "脚本",
    "storyboard-image": "分镜图片",
    "storyboard-video": "分镜视频",
    dubbing: "配音",
    music: "音乐",
    canvas: "Canvas",
    drama: "短剧练习",
};

type WorkflowActionColumnRenderer = NonNullable<TableColumnsType<PublicRunningHubWorkflow>[number]["render"]>;

export function getRunningHubWorkflowActionColumn(render: WorkflowActionColumnRenderer): TableColumnsType<PublicRunningHubWorkflow>[number] {
    return {
        title: "操作",
        key: "actions",
        fixed: "right",
        width: 320,
        className: "runninghub-workflow-actions",
        onHeaderCell: () => ({ className: "runninghub-workflow-actions" }),
        onCell: () => ({ className: "runninghub-workflow-actions" }),
        render,
    };
}

export function RunningHubWorkflowList({ channel }: { channel: SystemModelChannel }) {
    const { message } = App.useApp();
    const [items, setItems] = useState<PublicRunningHubWorkflow[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<"all" | "enabled" | "disabled">("all");
    const [editor, setEditor] = useState<PublicRunningHubWorkflow | null | undefined>();
    const [testWorkflow, setTestWorkflow] = useState<PublicRunningHubWorkflow | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams({ channelId: channel.id, pageSize: "100" });
            if (search.trim()) query.set("search", search.trim());
            if (status !== "all") query.set("status", status);
            const response = await fetch(`/api/admin/runninghub/workflows?${query.toString()}`, { cache: "no-store" });
            const result = (await response.json()) as { data?: { items?: PublicRunningHubWorkflow[] }; msg?: string };
            if (!response.ok) throw new Error(result.msg || "读取工作流失败");
            setItems(result.data?.items || []);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取工作流失败");
        } finally {
            setLoading(false);
        }
    }, [channel.id, message, search, status]);

    useEffect(() => {
        void load();
    }, [load]);

    const mutate = async (workflow: PublicRunningHubWorkflow, action: "enable" | "disable") => {
        try {
            const endpoint = `/api/admin/runninghub/workflows/${encodeURIComponent(workflow.workflowKey)}`;
            const response = await fetch(endpoint, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: action === "enable" }),
            });
            const result = (await response.json()) as { msg?: string };
            if (!response.ok) throw new Error(result.msg || "操作失败");
            message.success(action === "enable" ? "工作流已启用" : "工作流已停用");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
        }
    };

    const columns: TableColumnsType<PublicRunningHubWorkflow> = useMemo(
        () => [
            {
                title: "工作流",
                key: "name",
                render: (_, item) => (
                    <div className="min-w-0">
                        <div className="truncate font-medium">{item.workflowName}</div>
                        <div className="truncate text-xs text-stone-500">{item.workflowKey}</div>
                    </div>
                ),
            },
            {
                title: "业务 / 能力",
                key: "business",
                width: 150,
                render: (_, item) => (
                    <span>
                        {labels[item.businessCode]} · {item.capability}
                    </span>
                ),
            },
            { title: "Workflow ID", dataIndex: "workflowId", width: 160, ellipsis: true },
            { title: "版本", dataIndex: "version", width: 65, align: "center" },
            { title: "状态", key: "status", width: 90, render: (_, item) => <Tag color={item.enabled ? "success" : "default"}>{item.enabled ? "已启用" : "已停用"}</Tag> },
            {
                title: "最近测试",
                key: "test",
                width: 150,
                render: (_, item) =>
                    item.lastTestAt ? (
                        <span className={item.requiresRetest ? "text-amber-600" : item.lastTestResult === "success" ? "text-emerald-600" : "text-red-600"}>
                            {item.requiresRetest ? "配置已修改，请重新测试" : item.lastTestResult === "success" ? "成功" : "失败"} · {new Date(item.lastTestAt).toLocaleString()}
                        </span>
                    ) : (
                        <span className="text-stone-500">未测试</span>
                    ),
            },
            getRunningHubWorkflowActionColumn((_, item) => (
                <Space size={4} wrap>
                    <Button size="small" icon={<Settings2 className="size-3.5" />} onClick={() => setEditor(item)}>
                        编辑
                    </Button>
                    <Button size="small" icon={<RefreshCw className="size-3.5" />} onClick={() => setEditor(item)}>
                        读取工作流
                    </Button>
                    <Button size="small" icon={<TestTube className="size-3.5" />} onClick={() => setTestWorkflow(item)}>
                        测试
                    </Button>
                    <Popconfirm title={item.enabled ? "停用这个版本？" : "启用这个版本？"} onConfirm={() => void mutate(item, item.enabled ? "disable" : "enable")}>
                        <Button size="small" icon={<ToggleLeft className="size-3.5" />}>
                            {item.enabled ? "停用" : "启用"}
                        </Button>
                    </Popconfirm>
                </Space>
            )),
        ],
        [load, message],
    );

    return (
        <section className="mt-4 space-y-3 border-t border-stone-200 pt-4 dark:border-stone-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <span>RunningHub 工作流</span>
                        <Tag>{items.length}</Tag>
                    </div>
                    <div className="mt-1 text-xs text-stone-500">按业务 code 维护版本和参数契约；API Key 继续由渠道配置管理。</div>
                </div>
                <Space>
                    <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>
                        刷新
                    </Button>
                    <Button size="small" type="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditor(null)}>
                        新建
                    </Button>
                </Space>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                <Input allowClear value={search} prefix={<Settings2 className="size-3.5 text-stone-400" />} placeholder="搜索名称、业务 code 或 Workflow ID" onChange={(event) => setSearch(event.target.value)} />
                <Select
                    value={status}
                    options={[
                        { value: "all", label: "全部状态" },
                        { value: "enabled", label: "已启用" },
                        { value: "disabled", label: "已停用" },
                    ]}
                    onChange={setStatus}
                />
            </div>
            <div className="hidden md:block">
                <Table
                    rowKey="workflowKey"
                    size="small"
                    loading={loading}
                    columns={columns}
                    dataSource={items}
                    pagination={{ pageSize: 8, hideOnSinglePage: true }}
                    scroll={{ x: 1000 }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有工作流" /> }}
                />
            </div>
            <div className="space-y-2 md:hidden">
                {items.map((item) => (
                    <div key={item.workflowKey} className="rounded-md border border-stone-200 p-3 dark:border-stone-800">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{item.workflowName}</div>
                                <div className="mt-1 text-xs text-stone-500">
                                    {labels[item.businessCode]} · v{item.version} · {item.workflowId}
                                </div>
                            </div>
                            <Tag color={item.enabled ? "success" : "default"}>{item.enabled ? "启用" : "停用"}</Tag>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="small" onClick={() => setEditor(item)}>
                                编辑
                            </Button>
                            <Button size="small" onClick={() => setEditor(item)}>
                                读取工作流
                            </Button>
                            <Button size="small" onClick={() => setTestWorkflow(item)}>
                                测试
                            </Button>
                            <Popconfirm title={item.enabled ? "停用这个版本？" : "启用这个版本？"} onConfirm={() => void mutate(item, item.enabled ? "disable" : "enable")}>
                                <Button size="small">{item.enabled ? "停用" : "启用"}</Button>
                            </Popconfirm>
                        </div>
                    </div>
                ))}
                {!items.length && !loading ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有工作流" /> : null}
            </div>
            {editor !== undefined ? <RunningHubWorkflowEditor open channelId={channel.id} workflow={editor || undefined} onClose={() => setEditor(undefined)} onSaved={load} /> : null}
            {testWorkflow ? <RunningHubWorkflowTestPanel open workflow={testWorkflow} onClose={() => setTestWorkflow(null)} /> : null}
        </section>
    );
}
