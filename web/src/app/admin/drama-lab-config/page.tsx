"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Download, ExternalLink, Pencil, RotateCcw, Trash2 } from "lucide-react";

type ApiResult<T> = { code: number; msg?: string; data: T };

interface AIConfig {
    id: string;
    name: string;
    provider: string;
    service_type: "text" | "image" | "video" | "audio";
    base_url: string;
    default_model?: string;
    is_default: boolean;
    is_active: boolean;
    has_api_key?: boolean;
}

interface PromptTemplate {
    id: string;
    template_key?: string;
    name: string;
    category: "script" | "character" | "scene" | "prop" | "storyboard" | "image" | "video";
    template: string;
    variables: string[];
    description?: string;
    is_builtin?: boolean;
    is_customized?: boolean;
}

interface BusinessScenario {
    id: string;
    name: string;
    aspect_ratio: string;
    resolution: string;
    settings: Record<string, unknown>;
}

interface GenerationSettings {
    imageConcurrency: number;
    videoConcurrency: number;
    maxBatchSize: number;
    imageTimeout: number;
    videoTimeout: number;
}

interface SD2Asset {
    id: string;
    name: string;
    type: "lora" | "checkpoint" | "vae";
    fileSize: number;
    mimeType?: string | null;
    enabled: boolean;
    hasLocalFile: boolean;
    downloadUrl?: string | null;
}

const SERVICE_TYPE_LABELS: Record<AIConfig["service_type"], string> = {
    text: "文本生成",
    image: "图片生成",
    video: "视频生成",
    audio: "语音合成",
};
const SERVICE_TYPE_COLORS: Record<AIConfig["service_type"], string> = { text: "blue", image: "green", video: "orange", audio: "purple" };
const PROMPT_CATEGORY_LABELS: Record<PromptTemplate["category"], string> = { script: "剧本", character: "角色", scene: "场景", prop: "道具", storyboard: "分镜", image: "图像", video: "视频" };
const DEFAULT_GENERATION_SETTINGS: GenerationSettings = { imageConcurrency: 3, videoConcurrency: 1, maxBatchSize: 10, imageTimeout: 180, videoTimeout: 1800 };

function formatBytes(bytes: number) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

async function fetchJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => ({}))) as Partial<ApiResult<T>> & { error?: string };
    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) throw new Error(payload.msg || payload.error || "请求失败");
    return payload as ApiResult<T>;
}

type MessageApi = ReturnType<typeof message.useMessage>[0];

type DramaLabConfigTab = "ai" | "prompts" | "scenarios" | "generation" | "sd2";

export default function AdminDramaLabConfigPage({ initialTab = "ai" }: { initialTab?: DramaLabConfigTab }) {
    const [activeTab, setActiveTab] = useState<DramaLabConfigTab>(initialTab);
    const [messageApi, contextHolder] = message.useMessage();
    return (
        <div className="p-6">
            {contextHolder}
            <div className="mb-5">
                <h1 className="text-2xl font-semibold">创作工坊配置</h1>
                <p className="mt-1 text-sm text-gray-500">管理创作工坊的九套系统提示词；其他配置页仅用于迁移查看，运行时统一使用平台全局配置。</p>
            </div>
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as DramaLabConfigTab)}
                items={[
                    { key: "ai", label: "AI 配置", children: <AIConfigTab messageApi={messageApi} /> },
                    { key: "prompts", label: "高级设置 · 提示词", children: <PromptTemplatesTab messageApi={messageApi} /> },
                    { key: "scenarios", label: "高级设置 · 业务场景", children: <BusinessScenariosTab messageApi={messageApi} /> },
                    { key: "generation", label: "生成设置", children: <GenerationSettingsTab messageApi={messageApi} /> },
                    { key: "sd2", label: "SD2 资产管理", children: <SD2AssetsTab messageApi={messageApi} /> },
                ]}
            />
        </div>
    );
}

export function AdminDramaLabPromptsSection() {
    return <AdminDramaLabConfigPage initialTab="prompts" />;
}

export function AdminDramaLabScenariosSection() {
    return <AdminDramaLabConfigPage initialTab="scenarios" />;
}

export function AdminDramaLabGenerationSection() {
    return <AdminDramaLabConfigPage initialTab="generation" />;
}

export function AdminDramaLabSd2Section() {
    return <AdminDramaLabConfigPage initialTab="sd2" />;
}

function AIConfigTab({ messageApi }: { messageApi: MessageApi }) {
    const [configs, setConfigs] = useState<AIConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            setConfigs((await fetchJson<AIConfig[]>("/api/admin/drama-lab/ai-configs")).data || []);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "加载 AI 配置失败");
        } finally {
            setLoading(false);
        }
    }, [messageApi]);
    useEffect(() => {
        void load();
    }, [load]);
    const columns: ColumnsType<AIConfig> = [
        { title: "名称", dataIndex: "name", key: "name", width: 160 },
        { title: "提供商", dataIndex: "provider", key: "provider", width: 130 },
        { title: "类型", dataIndex: "service_type", key: "service_type", width: 120, render: (type: AIConfig["service_type"]) => <Tag color={SERVICE_TYPE_COLORS[type]}>{SERVICE_TYPE_LABELS[type] || type}</Tag> },
        { title: "Base URL", dataIndex: "base_url", key: "base_url", ellipsis: true },
        { title: "默认模型", dataIndex: "default_model", key: "default_model", width: 180, render: (value: string) => value || "未设置" },
        { title: "API Key", dataIndex: "has_api_key", key: "has_api_key", width: 100, render: (value: boolean) => (value ? <Tag color="green">已配置</Tag> : <Tag>未配置</Tag>) },
        { title: "默认", dataIndex: "is_default", key: "is_default", width: 80, render: (value: boolean) => (value ? <Tag color="success">是</Tag> : "否") },
        { title: "状态", dataIndex: "is_active", key: "is_active", width: 80, render: (value: boolean) => (value ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>) },
    ];
    return (
        <Card
            title="历史 AI 配置"
            extra={
                <Button type="link" href="/admin?section=channels" icon={<ExternalLink size={14} />}>
                    打开模型渠道
                </Button>
            }
        >
            <Alert className="mb-4" message="这些记录仅用于迁移兼容和审计查看，短剧运行时不会读取。模型、渠道和 API Key 统一在平台模型渠道中维护。" type="warning" showIcon />
            <Table columns={columns} dataSource={configs} rowKey="id" loading={loading} scroll={{ x: 1100 }} />
        </Card>
    );
}

function PromptTemplatesTab({ messageApi }: { messageApi: MessageApi }) {
    const [items, setItems] = useState<PromptTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<PromptTemplate | null>(null);
    const [form] = Form.useForm();
    const load = useCallback(async () => {
        setLoading(true);
        try {
            setItems((await fetchJson<PromptTemplate[]>("/api/admin/drama-lab/prompt-templates")).data || []);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "加载提示词模板失败");
        } finally {
            setLoading(false);
        }
    }, [messageApi]);
    useEffect(() => {
        void load();
    }, [load]);
    const openEdit = (item: PromptTemplate) => {
        setEditing(item);
        form.setFieldsValue(item);
        setModalOpen(true);
    };
    const save = async () => {
        try {
            const values = await form.validateFields();
            await fetchJson(editing ? `/api/admin/drama-lab/prompt-templates/${editing.id}` : "/api/admin/drama-lab/prompt-templates", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
            messageApi.success("模板已更新");
            setModalOpen(false);
            await load();
        } catch (error) {
            if (error && typeof error === "object" && "errorFields" in error) return;
            messageApi.error(error instanceof Error ? error.message : "保存模板失败");
        }
    };
    const remove = async (id: string) => {
        try {
            await fetchJson(`/api/admin/drama-lab/prompt-templates/${id}`, { method: "DELETE" });
            messageApi.success(items.find((item) => item.id === id)?.is_builtin ? "已恢复默认模板" : "模板已删除");
            await load();
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "删除模板失败");
        }
    };
    const columns: ColumnsType<PromptTemplate> = [
        {
            title: "模板名称",
            dataIndex: "name",
            key: "name",
            width: 220,
            render: (value: string, record) => (
                <div>
                    <div className="flex items-center gap-2">
                        <span>{value}</span>
                        {record.is_builtin ? <Tag color={record.is_customized ? "blue" : "default"}>{record.is_customized ? "已自定义" : "系统默认"}</Tag> : null}
                    </div>
                    {record.description ? <div className="mt-1 text-xs text-gray-500">{record.description}</div> : null}
                </div>
            ),
        },
        { title: "分类", dataIndex: "category", key: "category", width: 110, render: (value: PromptTemplate["category"]) => <Tag>{PROMPT_CATEGORY_LABELS[value]}</Tag> },
        { title: "模板内容", dataIndex: "template", key: "template", ellipsis: true },
        {
            title: "变量",
            dataIndex: "variables",
            key: "variables",
            width: 240,
            render: (values: string[]) => (
                <Space wrap>
                    {values?.map((value) => (
                        <Tag key={value}>{`{${value}}`}</Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: "操作",
            key: "actions",
            width: 150,
            render: (_, record) => (
                <Space>
                    <Button type="link" icon={<Pencil size={15} />} onClick={() => openEdit(record)}>
                        编辑
                    </Button>
                    <Popconfirm title={record.is_builtin ? "恢复该系统模板的默认正文？" : "确认删除此模板？"} onConfirm={() => void remove(record.id)}>
                        <Button type="link" danger icon={record.is_builtin ? <RotateCcw size={15} /> : <Trash2 size={15} />}>
                            {record.is_builtin ? "恢复默认" : "删除"}
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];
    return (
        <Card title="提示词模板管理" extra={<Tag color="blue">9 个系统模板</Tag>}>
            <Alert className="mb-4" type="info" showIcon message="仅维护创作工坊内部的 9 个系统模板。AI 调用由服务端注入项目上下文和不可编辑的结构化输出契约；模板覆盖是实验室全局配置，不按管理员账号分叉。" />
            <Table columns={columns} dataSource={items} rowKey="id" loading={loading} scroll={{ x: 900 }} />
            <Modal title="编辑系统模板" open={modalOpen} onOk={() => void save()} onCancel={() => setModalOpen(false)} width={760} okText="保存" cancelText="取消">
                <Form form={form} layout="vertical" className="mt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item name="name" label="模板名称">
                            <Input disabled />
                        </Form.Item>
                        <Form.Item name="category" label="分类">
                            <Select disabled options={Object.entries(PROMPT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
                        </Form.Item>
                    </div>
                    <Form.Item name="template" label="模板内容" rules={[{ required: true, message: "请输入模板内容" }]}>
                        <Input.TextArea rows={9} placeholder="例如：生成{角色名}的角色设定图，风格为{风格}" />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
}

function BusinessScenariosTab({ messageApi }: { messageApi: MessageApi }) {
    const [items, setItems] = useState<BusinessScenario[]>([]);
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            setItems((await fetchJson<BusinessScenario[]>("/api/admin/drama-lab/business-scenarios")).data || []);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "加载业务场景失败");
        } finally {
            setLoading(false);
        }
    }, [messageApi]);
    useEffect(() => {
        void load();
    }, [load]);
    const columns: ColumnsType<BusinessScenario> = [
        { title: "场景名称", dataIndex: "name", key: "name", width: 200 },
        { title: "画面比例", dataIndex: "aspect_ratio", key: "aspect_ratio", width: 130 },
        { title: "分辨率", dataIndex: "resolution", key: "resolution", width: 150 },
        { title: "默认风格", key: "defaultStyle", render: (_, record) => String(record.settings?.defaultStyle || "未设置") },
        { title: "最大时长", key: "maxDuration", width: 130, render: (_, record) => (record.settings?.maxDuration ? `${record.settings.maxDuration} 秒` : "未设置") },
    ];
    return (
        <Card title="历史业务场景配置">
            <Alert className="mb-4" type="warning" showIcon message="这些记录仅用于迁移兼容和审计查看，短剧运行时使用项目自身的画幅、风格和平台全局模型配置。" />
            <Table columns={columns} dataSource={items} rowKey="id" loading={loading} scroll={{ x: 900 }} />
        </Card>
    );
}

function GenerationSettingsTab({ messageApi }: { messageApi: MessageApi }) {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm<GenerationSettings>();
    const load = useCallback(async () => {
        setLoading(true);
        try {
            form.setFieldsValue((await fetchJson<GenerationSettings>("/api/admin/drama-lab/generation-settings")).data);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "加载生成设置失败");
        } finally {
            setLoading(false);
        }
    }, [form, messageApi]);
    useEffect(() => {
        void load();
    }, [load]);
    return (
        <Card
            title="历史生成设置"
            loading={loading}
            extra={
                <Button type="link" href="/admin?section=settings#admin-settings-generation" icon={<ExternalLink size={14} />}>
                    打开平台生成控制
                </Button>
            }
        >
            <Alert className="mb-5" type="warning" showIcon message="图片/视频并发字段是平台全局并发上限的兼容别名，会影响所有工作区；批量大小和超时字段仅保留迁移数据，当前运行链路不读取。此页只读。" />
            <Form form={form} layout="vertical" initialValues={DEFAULT_GENERATION_SETTINGS}>
                <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                    <Form.Item name="imageConcurrency" label="图片并发数">
                        <InputNumber className="w-full" min={1} max={32} disabled />
                    </Form.Item>
                    <Form.Item name="videoConcurrency" label="视频并发数">
                        <InputNumber className="w-full" min={1} max={16} disabled />
                    </Form.Item>
                    <Form.Item name="maxBatchSize" label="单次最大生成数">
                        <InputNumber className="w-full" min={1} max={100} disabled />
                    </Form.Item>
                    <Form.Item name="imageTimeout" label="图片生成超时（秒）">
                        <InputNumber className="w-full" min={10} max={3600} disabled />
                    </Form.Item>
                    <Form.Item name="videoTimeout" label="视频生成超时（秒）">
                        <InputNumber className="w-full" min={30} max={7200} disabled />
                    </Form.Item>
                </div>
            </Form>
        </Card>
    );
}

function SD2AssetsTab({ messageApi }: { messageApi: MessageApi }) {
    const [items, setItems] = useState<SD2Asset[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterType, setFilterType] = useState<SD2Asset["type"] | "">("");
    const [enabled, setEnabled] = useState("");
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterType) params.set("type", filterType);
            if (enabled) params.set("enabled", enabled);
            setItems((await fetchJson<SD2Asset[]>(`/api/admin/drama-lab/sd2-assets?${params}`)).data || []);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "加载 SD2 资产失败");
        } finally {
            setLoading(false);
        }
    }, [enabled, filterType, messageApi]);
    useEffect(() => {
        void load();
    }, [load]);
    const columns: ColumnsType<SD2Asset> = [
        { title: "名称", dataIndex: "name", key: "name", ellipsis: true },
        { title: "类型", dataIndex: "type", key: "type", width: 130, render: (value: SD2Asset["type"]) => <Tag>{value.toUpperCase()}</Tag> },
        { title: "大小", dataIndex: "fileSize", key: "fileSize", width: 120, render: (value: number) => formatBytes(value) },
        { title: "状态", dataIndex: "enabled", key: "enabled", width: 100, render: (value: boolean) => (value ? <Tag color="success">已启用</Tag> : <Tag>已停用</Tag>) },
        {
            title: "操作",
            key: "actions",
            width: 100,
            render: (_, record) =>
                record.hasLocalFile || record.downloadUrl ? (
                    <Button type="link" icon={<Download size={15} />} href={record.downloadUrl || undefined} target="_blank" rel="noreferrer">
                        下载
                    </Button>
                ) : null,
        },
    ];
    return (
        <Card
            title="历史 SD2 资产"
            extra={
                <Space>
                    <Select
                        value={filterType}
                        onChange={setFilterType}
                        allowClear
                        placeholder="类型"
                        style={{ width: 120 }}
                        options={[
                            { value: "lora", label: "LoRA" },
                            { value: "checkpoint", label: "Checkpoint" },
                            { value: "vae", label: "VAE" },
                        ]}
                    />
                    <Select
                        value={enabled}
                        onChange={setEnabled}
                        allowClear
                        placeholder="状态"
                        style={{ width: 110 }}
                        options={[
                            { value: "true", label: "已启用" },
                            { value: "false", label: "已停用" },
                        ]}
                    />
                </Space>
            }
        >
            <Alert className="mb-4" type="warning" showIcon message="历史 SD2 文件元数据仅保留用于兼容管理，当前短剧运行链路不会读取或加载这些文件。" />
            <Table columns={columns} dataSource={items} rowKey="id" loading={loading} scroll={{ x: 850 }} locale={{ emptyText: <Empty description="暂无 SD2 资产" /> }} />
        </Card>
    );
}
