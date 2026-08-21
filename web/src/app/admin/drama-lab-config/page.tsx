"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Download, FlaskConical, Pencil, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";

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
                <h1 className="text-2xl font-semibold">短剧实验室配置</h1>
                <p className="mt-1 text-sm text-gray-500">集中管理短剧制作链路使用的模型、模板、场景和生成资源。</p>
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
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<AIConfig | null>(null);
    const [form] = Form.useForm();
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
    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ service_type: "image", is_active: true, is_default: false });
        setModalOpen(true);
    };
    const openEdit = (config: AIConfig) => {
        setEditing(config);
        form.setFieldsValue({ ...config, api_key: undefined });
        setModalOpen(true);
    };
    const save = async () => {
        try {
            const values = await form.validateFields();
            const url = editing ? `/api/admin/drama-lab/ai-configs/${editing.id}` : "/api/admin/drama-lab/ai-configs";
            await fetchJson(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
            messageApi.success(editing ? "AI 配置已更新" : "AI 配置已创建");
            setModalOpen(false);
            await load();
        } catch (error) {
            if (error && typeof error === "object" && "errorFields" in error) return;
            messageApi.error(error instanceof Error ? error.message : "保存 AI 配置失败");
        }
    };
    const remove = async (id: string) => {
        try {
            await fetchJson(`/api/admin/drama-lab/ai-configs/${id}`, { method: "DELETE" });
            messageApi.success("AI 配置已删除");
            await load();
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "删除 AI 配置失败");
        }
    };
    const test = async (id: string) => {
        const key = `ai-test-${id}`;
        messageApi.loading({ content: "正在测试连接...", key });
        try {
            const result = await fetchJson<{ latency?: number }>(`/api/admin/drama-lab/ai-configs/${id}/test`, { method: "POST" });
            messageApi.success({ content: `连接成功${result.data?.latency ? `（${result.data.latency} ms）` : ""}`, key });
        } catch (error) {
            messageApi.error({ content: error instanceof Error ? error.message : "连接测试失败", key });
        }
    };
    const columns: ColumnsType<AIConfig> = [
        { title: "名称", dataIndex: "name", key: "name", width: 160 },
        { title: "提供商", dataIndex: "provider", key: "provider", width: 130 },
        { title: "类型", dataIndex: "service_type", key: "service_type", width: 120, render: (type: AIConfig["service_type"]) => <Tag color={SERVICE_TYPE_COLORS[type]}>{SERVICE_TYPE_LABELS[type] || type}</Tag> },
        { title: "Base URL", dataIndex: "base_url", key: "base_url", ellipsis: true },
        { title: "默认模型", dataIndex: "default_model", key: "default_model", width: 180, render: (value: string) => value || "未设置" },
        { title: "API Key", dataIndex: "has_api_key", key: "has_api_key", width: 100, render: (value: boolean) => (value ? <Tag color="green">已配置</Tag> : <Tag>未配置</Tag>) },
        { title: "默认", dataIndex: "is_default", key: "is_default", width: 80, render: (value: boolean) => (value ? <Tag color="success">是</Tag> : "否") },
        { title: "状态", dataIndex: "is_active", key: "is_active", width: 80, render: (value: boolean) => (value ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>) },
        {
            title: "操作",
            key: "actions",
            width: 220,
            fixed: "right",
            render: (_, record) => (
                <Space size="small">
                    <Button type="link" size="small" icon={<FlaskConical size={15} />} onClick={() => void test(record.id)}>
                        测试
                    </Button>
                    <Button type="link" size="small" icon={<Pencil size={15} />} onClick={() => openEdit(record)}>
                        编辑
                    </Button>
                    <Popconfirm title="确认删除此 AI 配置？" onConfirm={() => void remove(record.id)}>
                        <Button type="link" size="small" danger icon={<Trash2 size={15} />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];
    return (
        <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <Alert className="flex-1" message="AI 配置按当前管理员账号隔离。API Key 只在提交时发送，列表不会回显密钥。" type="info" showIcon />
                <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>
                    添加配置
                </Button>
            </div>
            <Table columns={columns} dataSource={configs} rowKey="id" loading={loading} scroll={{ x: 1300 }} />
            <Modal title={editing ? "编辑 AI 配置" : "添加 AI 配置"} open={modalOpen} onOk={() => void save()} onCancel={() => setModalOpen(false)} width={720} okText="保存" cancelText="取消">
                <Form form={form} layout="vertical" className="mt-4">
                    <Form.Item name="name" label="配置名称" rules={[{ required: true, message: "请输入配置名称" }]}>
                        <Input />
                    </Form.Item>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item name="provider" label="提供商" rules={[{ required: true, message: "请选择提供商" }]}>
                            <Select options={["EasyArt", "OpenAI", "Anthropic", "Volcengine", "Custom"].map((value) => ({ label: value, value }))} />
                        </Form.Item>
                        <Form.Item name="service_type" label="服务类型" rules={[{ required: true, message: "请选择服务类型" }]}>
                            <Select options={Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => ({ label, value }))} />
                        </Form.Item>
                    </div>
                    <Form.Item name="base_url" label="Base URL" rules={[{ required: true, message: "请输入 Base URL" }]}>
                        <Input placeholder="https://api.example.com/v1" />
                    </Form.Item>
                    <Form.Item name="api_key" label="API Key" extra={editing?.has_api_key ? "已配置密钥；留空可保留原密钥。" : undefined}>
                        <Input.Password placeholder={editing?.has_api_key ? "留空保持不变" : "输入 API Key"} />
                    </Form.Item>
                    <Form.Item name="default_model" label="默认模型">
                        <Input />
                    </Form.Item>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item name="is_default" label="设为默认" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                        <Form.Item name="is_active" label="启用" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>
        </>
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
            <Alert className="mb-4" type="info" showIcon message="仅维护短剧实验室内部的 9 个系统模板。AI 调用由服务端注入项目上下文和不可编辑的结构化输出契约；模板覆盖是实验室全局配置，不按管理员账号分叉。" />
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
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<BusinessScenario | null>(null);
    const [form] = Form.useForm();
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
    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ aspectRatio: "9:16", resolution: "1080x1920", settings: "{}" });
        setModalOpen(true);
    };
    const openEdit = (item: BusinessScenario) => {
        setEditing(item);
        form.setFieldsValue({ ...item, aspectRatio: item.aspect_ratio, resolution: item.resolution, settings: JSON.stringify(item.settings || {}, null, 2) });
        setModalOpen(true);
    };
    const save = async () => {
        try {
            const values = await form.validateFields();
            let settings: Record<string, unknown>;
            try {
                settings = JSON.parse(values.settings || "{}");
            } catch {
                messageApi.error("业务场景扩展设置必须是有效 JSON");
                return;
            }
            await fetchJson(editing ? `/api/admin/drama-lab/business-scenarios/${editing.id}` : "/api/admin/drama-lab/business-scenarios", {
                method: editing ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...values, settings }),
            });
            messageApi.success(editing ? "业务场景已更新" : "业务场景已创建");
            setModalOpen(false);
            await load();
        } catch (error) {
            if (error && typeof error === "object" && "errorFields" in error) return;
            messageApi.error(error instanceof Error ? error.message : "保存业务场景失败");
        }
    };
    const remove = async (id: string) => {
        try {
            await fetchJson(`/api/admin/drama-lab/business-scenarios/${id}`, { method: "DELETE" });
            messageApi.success("业务场景已删除");
            await load();
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "删除业务场景失败");
        }
    };
    const columns: ColumnsType<BusinessScenario> = [
        { title: "场景名称", dataIndex: "name", key: "name", width: 200 },
        { title: "画面比例", dataIndex: "aspect_ratio", key: "aspect_ratio", width: 130 },
        { title: "分辨率", dataIndex: "resolution", key: "resolution", width: 150 },
        { title: "默认风格", key: "defaultStyle", render: (_, record) => String(record.settings?.defaultStyle || "未设置") },
        { title: "最大时长", key: "maxDuration", width: 130, render: (_, record) => (record.settings?.maxDuration ? `${record.settings.maxDuration} 秒` : "未设置") },
        {
            title: "操作",
            key: "actions",
            width: 150,
            render: (_, record) => (
                <Space>
                    <Button type="link" icon={<Pencil size={15} />} onClick={() => openEdit(record)}>
                        编辑
                    </Button>
                    <Popconfirm title="确认删除此场景？" onConfirm={() => void remove(record.id)}>
                        <Button type="link" danger icon={<Trash2 size={15} />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];
    return (
        <Card
            title="业务场景配置"
            extra={
                <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>
                    新增场景
                </Button>
            }
        >
            <Table columns={columns} dataSource={items} rowKey="id" loading={loading} scroll={{ x: 900 }} />
            <Modal title={editing ? "编辑业务场景" : "新增业务场景"} open={modalOpen} onOk={() => void save()} onCancel={() => setModalOpen(false)} width={700} okText="保存" cancelText="取消">
                <Form form={form} layout="vertical" className="mt-4">
                    <Form.Item name="name" label="场景名称" rules={[{ required: true, message: "请输入场景名称" }]}>
                        <Input />
                    </Form.Item>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item name="aspectRatio" label="画面比例" rules={[{ required: true, pattern: /^\d{1,3}:\d{1,3}$/, message: "格式如 9:16" }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item name="resolution" label="分辨率" rules={[{ required: true, pattern: /^\d{3,5}x\d{3,5}$/i, message: "格式如 1080x1920" }]}>
                            <Input />
                        </Form.Item>
                    </div>
                    <Form.Item name="settings" label="扩展设置 JSON">
                        <Input.TextArea rows={7} />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
}

function GenerationSettingsTab({ messageApi }: { messageApi: MessageApi }) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
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
    const save = async (values: GenerationSettings) => {
        setSaving(true);
        try {
            form.setFieldsValue((await fetchJson<GenerationSettings>("/api/admin/drama-lab/generation-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) })).data);
            messageApi.success("生成设置已保存");
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "保存生成设置失败");
        } finally {
            setSaving(false);
        }
    };
    const reset = async () => {
        try {
            form.setFieldsValue((await fetchJson<GenerationSettings>("/api/admin/drama-lab/generation-settings", { method: "DELETE" })).data);
            messageApi.success("已恢复默认设置");
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "恢复默认设置失败");
        }
    };
    return (
        <Card title="生成设置" loading={loading}>
            <Alert className="mb-5" type="info" showIcon message="这些设置只作用于短剧实验室，不会覆盖系统其他创作入口的并发策略。" />
            <Form form={form} layout="vertical" initialValues={DEFAULT_GENERATION_SETTINGS} onFinish={(values) => void save(values)}>
                <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                    <Form.Item name="imageConcurrency" label="图片并发数" rules={[{ required: true, type: "number", min: 1, max: 32 }]}>
                        <InputNumber className="w-full" min={1} max={32} />
                    </Form.Item>
                    <Form.Item name="videoConcurrency" label="视频并发数" rules={[{ required: true, type: "number", min: 1, max: 16 }]}>
                        <InputNumber className="w-full" min={1} max={16} />
                    </Form.Item>
                    <Form.Item name="maxBatchSize" label="单次最大生成数" rules={[{ required: true, type: "number", min: 1, max: 100 }]}>
                        <InputNumber className="w-full" min={1} max={100} />
                    </Form.Item>
                    <Form.Item name="imageTimeout" label="图片生成超时（秒）" rules={[{ required: true, type: "number", min: 10, max: 3600 }]}>
                        <InputNumber className="w-full" min={10} max={3600} />
                    </Form.Item>
                    <Form.Item name="videoTimeout" label="视频生成超时（秒）" rules={[{ required: true, type: "number", min: 30, max: 7200 }]}>
                        <InputNumber className="w-full" min={30} max={7200} />
                    </Form.Item>
                </div>
                <Space>
                    <Button type="primary" htmlType="submit" loading={saving} icon={<Save size={16} />}>
                        保存设置
                    </Button>
                    <Button icon={<RotateCcw size={16} />} onClick={() => void reset()}>
                        恢复默认
                    </Button>
                </Space>
            </Form>
        </Card>
    );
}

function SD2AssetsTab({ messageApi }: { messageApi: MessageApi }) {
    const [items, setItems] = useState<SD2Asset[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [filterType, setFilterType] = useState<SD2Asset["type"] | "">("");
    const [enabled, setEnabled] = useState("");
    const [uploadType, setUploadType] = useState<SD2Asset["type"]>("checkpoint");
    const inputRef = useRef<HTMLInputElement>(null);
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
    const upload = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", uploadType);
        setUploading(true);
        try {
            await fetchJson("/api/admin/drama-lab/sd2-assets/upload", { method: "POST", body: formData });
            messageApi.success("资产上传成功");
            await load();
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "资产上传失败");
        } finally {
            setUploading(false);
        }
    };
    const toggle = async (item: SD2Asset) => {
        try {
            await fetchJson(`/api/admin/drama-lab/sd2-assets/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !item.enabled }) });
            await load();
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "更新资产状态失败");
        }
    };
    const remove = async (id: string) => {
        try {
            await fetchJson(`/api/admin/drama-lab/sd2-assets/${id}`, { method: "DELETE" });
            messageApi.success("资产已删除");
            await load();
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "删除资产失败");
        }
    };
    const columns: ColumnsType<SD2Asset> = [
        { title: "名称", dataIndex: "name", key: "name", ellipsis: true },
        { title: "类型", dataIndex: "type", key: "type", width: 130, render: (value: SD2Asset["type"]) => <Tag>{value.toUpperCase()}</Tag> },
        { title: "大小", dataIndex: "fileSize", key: "fileSize", width: 120, render: (value: number) => formatBytes(value) },
        { title: "状态", dataIndex: "enabled", key: "enabled", width: 100, render: (value: boolean) => (value ? <Tag color="success">已启用</Tag> : <Tag>已停用</Tag>) },
        {
            title: "操作",
            key: "actions",
            width: 260,
            render: (_, record) => (
                <Space>
                    <Button type="link" onClick={() => void toggle(record)}>
                        {record.enabled ? "停用" : "启用"}
                    </Button>
                    {record.hasLocalFile || record.downloadUrl ? (
                        <Button type="link" icon={<Download size={15} />} href={record.downloadUrl || undefined} target="_blank" rel="noreferrer">
                            下载
                        </Button>
                    ) : null}
                    <Popconfirm title="确认删除此资产？" onConfirm={() => void remove(record.id)}>
                        <Button type="link" danger icon={<Trash2 size={15} />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];
    return (
        <Card
            title="SD2 资产管理"
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
                    <Select
                        value={uploadType}
                        onChange={setUploadType}
                        style={{ width: 130 }}
                        options={[
                            { value: "lora", label: "上传 LoRA" },
                            { value: "checkpoint", label: "上传 Checkpoint" },
                            { value: "vae", label: "上传 VAE" },
                        ]}
                    />
                    <Button type="primary" loading={uploading} icon={<Upload size={16} />} onClick={() => inputRef.current?.click()}>
                        上传资产
                    </Button>
                    <input
                        ref={inputRef}
                        type="file"
                        hidden
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void upload(file);
                        }}
                    />
                </Space>
            }
        >
            <Alert className="mb-4" type="warning" showIcon message="模型文件会写入服务端 VOZEB_PRO_DATA_DIR/drama-lab/sd2-assets，并且只能由当前管理员下载。单文件上限 2 GB。" />
            <Table columns={columns} dataSource={items} rowKey="id" loading={loading} scroll={{ x: 850 }} locale={{ emptyText: <Empty description="暂无 SD2 资产" /> }} />
        </Card>
    );
}
