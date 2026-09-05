"use client";

import { useState, useEffect } from "react";
import { Table, Button, message, Modal, Tag, Space, Input, DatePicker, Select } from "antd";
import { Eye, RefreshCw, Search, Trash2 } from "lucide-react";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

interface DramaProject {
    id: string;
    title: string;
    userId: string;
    userName?: string;
    summary: string;
    style: string;
    ratio: string;
    status: "active" | "archived";
    episodeCount: number;
    characterCount: number;
    sceneCount: number;
    createdAt: string;
    updatedAt: string;
}

export default function AdminDramaProjectsPage() {
    const [projects, setProjects] = useState<DramaProject[]>([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchKeyword, setSearchKeyword] = useState("");
    const [statusFilter, setStatusFilter] = useState<string | undefined>();

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: pageSize.toString(),
            });
            if (searchKeyword) params.set("search", searchKeyword);
            if (statusFilter) params.set("status", statusFilter);

            const res = await fetch(`/api/admin/drama-projects?${params}`);
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();

            setProjects(data.data.items || []);
            setTotal(data.data.total || 0);
        } catch (error) {
            message.error("加载失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, [page, pageSize, statusFilter]);

    const handleDelete = async (id: string, title: string) => {
        Modal.confirm({
            title: "确认删除",
            content: `确定要删除项目「${title}」吗？此操作不可恢复。`,
            onOk: async () => {
                try {
                    const res = await fetch(`/api/admin/drama-projects/${id}`, {
                        method: "DELETE",
                    });
                    if (!res.ok) throw new Error("Delete failed");
                    message.success("删除成功");
                    fetchProjects();
                } catch (error) {
                    message.error("删除失败");
                }
            },
        });
    };

    const columns: ColumnsType<DramaProject> = [
        {
            title: "项目标题",
            dataIndex: "title",
            key: "title",
            width: 200,
            ellipsis: true,
        },
        {
            title: "创建者",
            dataIndex: "userName",
            key: "userName",
            width: 120,
            render: (text, record) => text || record.userId.slice(0, 8),
        },
        {
            title: "状态",
            dataIndex: "status",
            key: "status",
            width: 80,
            render: (status) => <Tag color={status === "active" ? "green" : "default"}>{status === "active" ? "活跃" : "归档"}</Tag>,
        },
        {
            title: "画面比例",
            dataIndex: "ratio",
            key: "ratio",
            width: 80,
        },
        {
            title: "分集",
            dataIndex: "episodeCount",
            key: "episodeCount",
            width: 60,
            align: "center",
        },
        {
            title: "角色",
            dataIndex: "characterCount",
            key: "characterCount",
            width: 60,
            align: "center",
        },
        {
            title: "场景",
            dataIndex: "sceneCount",
            key: "sceneCount",
            width: 60,
            align: "center",
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            key: "createdAt",
            width: 160,
            render: (text) => dayjs(text).format("YYYY-MM-DD HH:mm"),
        },
        {
            title: "操作",
            key: "actions",
            width: 120,
            fixed: "right",
            render: (_, record) => (
                <Space size="small">
                    <Button type="link" size="small" icon={<Eye size={15} />} onClick={() => window.open(`/drama-lab/${record.id}`, "_blank")}>
                        查看
                    </Button>
                    <Button type="link" size="small" danger icon={<Trash2 size={15} />} onClick={() => handleDelete(record.id, record.title)}>
                        删除
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">短剧项目管理</h1>
                <Button icon={<RefreshCw size={16} />} onClick={fetchProjects}>
                    刷新
                </Button>
            </div>

            <div className="mb-4 flex gap-2">
                <Input placeholder="搜索项目标题" prefix={<Search size={16} />} value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} onPressEnter={fetchProjects} style={{ width: 300 }} />
                <Select
                    placeholder="状态筛选"
                    allowClear
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ width: 120 }}
                    options={[
                        { label: "活跃", value: "active" },
                        { label: "归档", value: "archived" },
                    ]}
                />
                <Button type="primary" icon={<Search size={16} />} onClick={fetchProjects}>
                    搜索
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={projects}
                rowKey="id"
                loading={loading}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total) => `共 ${total} 个项目`,
                    onChange: (page, pageSize) => {
                        setPage(page);
                        setPageSize(pageSize);
                    },
                }}
                scroll={{ x: 1200 }}
            />
        </div>
    );
}
