"use client";

import { use, useState, useEffect, useCallback } from "react";
import { Button, Input, Select, Form, Card, Empty, Modal, message, Tabs, List, Spin } from "antd";
import { ArrowLeft, Plus, Trash2, Edit2, Play, Users, MapPin, Package, Search, Upload, LibraryBig } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import type { Asset } from "@/lib/library-asset-contract";

const { TextArea } = Input;
const { Option } = Select;

interface Episode {
    id: string;
    title: string;
    number: number;
    script: string;
    status?: string;
    storyboardCount?: number;
}

interface Character {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
}

interface Scene {
    id: string;
    location: string;
    time?: string;
    description?: string;
    imageUrl?: string;
}

interface Prop {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
}

interface Project {
    id: string;
    title: string;
    description?: string;
    style?: string;
    aspectRatio?: string;
    episodes: Episode[];
    characters: Character[];
    scenes: Scene[];
    props: Prop[];
}

export default function ProjectOutlinePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = use(paramsPromise);
    const projectId = encodeURIComponent(params.id);
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();
    const [activeTab, setActiveTab] = useState("characters");
    const [batchImportOpen, setBatchImportOpen] = useState(false);
    const [batchImportText, setBatchImportText] = useState("");
    const [resourceImportOpen, setResourceImportOpen] = useState(false);
    const [resourceImportTarget, setResourceImportTarget] = useState("characters");
    const [libraryAssets, setLibraryAssets] = useState<Asset[]>([]);
    const [libraryKeyword, setLibraryKeyword] = useState("");
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [resourceImporting, setResourceImporting] = useState(false);

    // 加载项目
    const loadProject = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/drama-lab/projects/${projectId}`);
            const data = await res.json();

            if (data.code !== 0 || !data.data?.project) {
                throw new Error(data.msg || "加载失败");
            }

            const proj = data.data.project;
            const projectData: Project = {
                id: proj.id,
                title: proj.title,
                description: proj.summary || "",
                style: proj.style || "",
                aspectRatio: proj.ratio || "16:9",
                episodes: proj.episodes || [],
                characters: proj.characters || [],
                scenes: proj.scenes || [],
                props: proj.props || [],
            };

            setProject(projectData);
            form.setFieldsValue({
                title: projectData.title,
                description: projectData.description,
                style: projectData.style,
                aspectRatio: projectData.aspectRatio,
            });
        } catch (err) {
            message.error(err instanceof Error ? err.message : "加载失败");
            router.push("/drama-lab");
        } finally {
            setLoading(false);
        }
    }, [projectId, form, router]);

    useEffect(() => {
        void loadProject();
    }, [loadProject]);

    const persistProject = async (changes: Partial<Project>) => {
        if (!project) return false;
        const next = { ...project, ...changes };
        const res = await fetch(`/api/drama-lab/projects/${projectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: next.title,
                summary: next.description,
                style: next.style,
                ratio: next.aspectRatio,
                episodes: next.episodes,
                characters: next.characters,
                scenes: next.scenes,
                props: next.props,
            }),
        });
        if (!res.ok) throw new Error("保存失败");
        setProject(next);
        return true;
    };

    const handleBatchImport = async () => {
        if (!project) return;
        const lines = batchImportText
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        if (!lines.length) {
            message.warning("请先输入要导入的分集内容");
            return;
        }
        const episodes = lines.map((line, index) => {
            const [titlePart, scriptPart] = line.split(/\s*\|\s*/, 2);
            return {
                id: `ep_${Date.now()}_${index}`,
                title: titlePart.trim() || `第 ${project.episodes.length + index + 1} 集`,
                number: project.episodes.length + index + 1,
                script: scriptPart?.trim() || "",
                status: "draft",
                storyboardCount: 0,
            };
        });
        try {
            await persistProject({ episodes: [...project.episodes, ...episodes] });
            setBatchImportText("");
            setBatchImportOpen(false);
            message.success(`已导入 ${episodes.length} 集`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "批量导入失败");
        }
    };

    const openResourceImport = async (target: string) => {
        setResourceImportTarget(target);
        setResourceImportOpen(true);
        setLibraryLoading(true);
        try {
            const result = await listLibraryAssetPage({ page: 1, pageSize: 100 });
            setLibraryAssets(result.assets);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材加载失败");
        } finally {
            setLibraryLoading(false);
        }
    };

    const handleResourceImport = async (asset: Asset) => {
        if (!project) return;
        const imageUrl = asset.kind === "image" ? asset.data.serverUrl || asset.data.remoteUrl || asset.data.dataUrl || asset.coverUrl : asset.coverUrl;
        setResourceImporting(true);
        try {
            if (resourceImportTarget === "characters") {
                await persistProject({ characters: [...project.characters, { id: `character_${Date.now()}`, name: asset.title, description: asset.note || (asset.kind === "text" ? asset.data.content : ""), imageUrl }] });
            } else if (resourceImportTarget === "scenes") {
                await persistProject({ scenes: [...project.scenes, { id: `scene_${Date.now()}`, location: asset.title, time: "", description: asset.note || (asset.kind === "text" ? asset.data.content : ""), imageUrl }] });
            } else {
                await persistProject({ props: [...project.props, { id: `prop_${Date.now()}`, name: asset.title, description: asset.note || (asset.kind === "text" ? asset.data.content : ""), imageUrl }] });
            }
            message.success(`已导入素材：${asset.title}`);
            setResourceImportOpen(false);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材导入失败");
        } finally {
            setResourceImporting(false);
        }
    };

    const filteredLibraryAssets = libraryAssets.filter((asset) => {
        const keyword = libraryKeyword.trim().toLowerCase();
        return !keyword || asset.title.toLowerCase().includes(keyword) || asset.tags.some((tag) => tag.toLowerCase().includes(keyword));
    });

    // 保存项目信息
    const saveProjectInfo = async () => {
        if (!project) return;

        setSaving(true);
        try {
            const values = form.getFieldsValue();
            const res = await fetch(`/api/drama-lab/projects/${projectId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: values.title,
                    summary: values.description,
                    style: values.style,
                    ratio: values.aspectRatio,
                    episodes: project.episodes,
                    characters: project.characters,
                    scenes: project.scenes,
                    props: project.props,
                }),
            });

            const data = await res.json();
            if (data.code !== 0) throw new Error(data.msg || "保存失败");

            setProject({
                ...project,
                title: values.title,
                description: values.description,
                style: values.style,
                aspectRatio: values.aspectRatio,
            });

            message.success("保存成功");
        } catch (err) {
            message.error(err instanceof Error ? err.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    // 添加分集
    const handleAddEpisode = async () => {
        if (!project) return;

        const newEpisode: Episode = {
            id: `ep_${Date.now()}`,
            title: `第 ${project.episodes.length + 1} 集`,
            number: project.episodes.length + 1,
            script: "",
            status: "draft",
            storyboardCount: 0,
        };

        const updatedEpisodes = [...project.episodes, newEpisode];

        try {
            const res = await fetch(`/api/drama-lab/projects/${projectId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    episodes: updatedEpisodes,
                    characters: project.characters,
                    scenes: project.scenes,
                    props: project.props,
                }),
            });

            if (res.ok) {
                setProject({ ...project, episodes: updatedEpisodes });
                message.success("添加成功");
            }
        } catch (err) {
            message.error("添加失败");
        }
    };

    // 删除分集
    const handleDeleteEpisode = (episodeId: string) => {
        if (!project) return;

        Modal.confirm({
            title: "确认删除",
            content: "确定要删除这一集吗？",
            onOk: async () => {
                const updatedEpisodes = project.episodes.filter((ep) => ep.id !== episodeId);

                try {
                    const res = await fetch(`/api/drama-lab/projects/${projectId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            episodes: updatedEpisodes,
                            characters: project.characters,
                            scenes: project.scenes,
                            props: project.props,
                        }),
                    });

                    if (res.ok) {
                        setProject({ ...project, episodes: updatedEpisodes });
                        message.success("删除成功");
                    }
                } catch (err) {
                    message.error("删除失败");
                }
            },
        });
    };

    // 进入制作
    const goToCreate = (episodeId: string) => {
        router.push(`/drama-lab/${projectId}/create?episode=${encodeURIComponent(episodeId)}`);
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="text-center">
                    <div className="mb-2 text-lg">加载中...</div>
                </div>
            </div>
        );
    }

    if (!project) {
        return null;
    }

    return (
        <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto bg-background">
            {/* 顶部导航 */}
            <header className="sticky top-0 z-10 border-b border-border bg-card">
                <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
                    <div className="flex items-center gap-4">
                        <Link href="/drama-lab" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="size-4" />
                            返回列表
                        </Link>
                        <span className="text-muted-foreground">›</span>
                        <h1 className="text-lg font-semibold">{project.title}</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={saveProjectInfo} loading={saving}>
                            保存设置
                        </Button>
                    </div>
                </div>
            </header>

            {/* 主内容 */}
            <main className="mx-auto max-w-7xl space-y-6 p-6">
                {/* 剧集信息 */}
                <Card title="剧集信息">
                    <Form form={form} layout="vertical" onValuesChange={saveProjectInfo}>
                        <div className="grid grid-cols-2 gap-4">
                            <Form.Item label="标题" name="title" rules={[{ required: true }]}>
                                <Input placeholder="剧集标题" />
                            </Form.Item>
                            <Form.Item label="画面比例" name="aspectRatio">
                                <Select>
                                    <Option value="16:9">16:9 横屏（默认）</Option>
                                    <Option value="9:16">9:16 竖屏（短视频）</Option>
                                    <Option value="3:4">3:4 竖版</Option>
                                    <Option value="1:1">1:1 方形</Option>
                                    <Option value="4:3">4:3 传统横屏</Option>
                                    <Option value="21:9">21:9 宽银幕</Option>
                                </Select>
                            </Form.Item>
                        </div>
                        <Form.Item label="图片/视频风格" name="style">
                            <Input placeholder="例如：写实、动漫、科幻、水墨" />
                        </Form.Item>
                        <Form.Item label="故事梗概" name="description">
                            <TextArea rows={3} placeholder="一句话描述故事梗概" />
                        </Form.Item>
                    </Form>
                </Card>

                {/* 分集列表 */}
                <Card
                    title={
                        <div className="flex items-center justify-between">
                            <span>
                                分集列表 <span className="text-sm text-muted-foreground">共 {project.episodes.length} 集</span>
                            </span>
                            <div className="flex items-center gap-2">
                                <Button icon={<Upload className="size-4" />} onClick={() => setBatchImportOpen(true)}>
                                    批量导入剧集
                                </Button>
                                <Button type="primary" icon={<Plus className="size-4" />} onClick={handleAddEpisode}>
                                    新增一集
                                </Button>
                            </div>
                        </div>
                    }
                >
                    {project.episodes.length === 0 ? (
                        <Empty description="暂无分集，点击「新增一集」开始创作" />
                    ) : (
                        <div className="grid grid-cols-3 gap-4">
                            {project.episodes.map((ep) => (
                                <div key={ep.id} className="group cursor-pointer rounded-lg border border-border p-4 transition-all hover:border-primary hover:shadow-md" onClick={() => goToCreate(ep.id)}>
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">第 {ep.number} 集</span>
                                        <Button
                                            type="text"
                                            size="small"
                                            danger
                                            icon={<Trash2 className="size-3" />}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteEpisode(ep.id);
                                            }}
                                        />
                                    </div>
                                    <h3 className="mb-2 text-base font-semibold">{ep.title}</h3>
                                    <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{ep.script ? ep.script.slice(0, 50) + "..." : "暂无剧本"}</p>
                                    <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
                                        <span>{ep.storyboardCount || 0} 分镜</span>
                                        <span className="rounded bg-muted px-2 py-0.5">{ep.status === "draft" ? "草稿" : "进行中"}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-primary opacity-0 transition-opacity group-hover:opacity-100">
                                        <Play className="size-4" />
                                        进入制作
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* 资源库预览 */}
                <Card
                    title="本剧资源库"
                    extra={
                        <div className="flex items-center gap-2">
                            <Input allowClear prefix={<Search className="size-4 text-muted-foreground" />} placeholder="搜索本剧资源" className="w-52" value={libraryKeyword} onChange={(event) => setLibraryKeyword(event.target.value)} />
                            <Button icon={<LibraryBig className="size-4" />} onClick={() => void openResourceImport(activeTab)}>
                                从素材库导入
                            </Button>
                        </div>
                    }
                >
                    <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={[
                            {
                                key: "characters",
                                label: (
                                    <span className="flex items-center gap-2">
                                        <Users className="size-4" />
                                        角色 ({project.characters.length})
                                    </span>
                                ),
                                children: (
                                    <div className="grid grid-cols-4 gap-4">
                                        {project.characters.filter((char) => !libraryKeyword.trim() || char.name.toLowerCase().includes(libraryKeyword.trim().toLowerCase())).length === 0 ? (
                                            <div className="col-span-4">
                                                <Empty description="暂无角色，进入制作页面添加" />
                                            </div>
                                        ) : (
                                            project.characters
                                                .filter((char) => !libraryKeyword.trim() || char.name.toLowerCase().includes(libraryKeyword.trim().toLowerCase()))
                                                .map((char) => (
                                                    <div key={char.id} className="rounded-lg border border-border p-3">
                                                        <div className="mb-2 text-sm font-semibold">{char.name}</div>
                                                        <div className="text-xs text-muted-foreground">{char.description || "暂无描述"}</div>
                                                    </div>
                                                ))
                                        )}
                                    </div>
                                ),
                            },
                            {
                                key: "scenes",
                                label: (
                                    <span className="flex items-center gap-2">
                                        <MapPin className="size-4" />
                                        场景 ({project.scenes.length})
                                    </span>
                                ),
                                children: (
                                    <div className="grid grid-cols-4 gap-4">
                                        {project.scenes.filter((scene) => !libraryKeyword.trim() || scene.location.toLowerCase().includes(libraryKeyword.trim().toLowerCase())).length === 0 ? (
                                            <div className="col-span-4">
                                                <Empty description="暂无场景，进入制作页面添加" />
                                            </div>
                                        ) : (
                                            project.scenes
                                                .filter((scene) => !libraryKeyword.trim() || scene.location.toLowerCase().includes(libraryKeyword.trim().toLowerCase()))
                                                .map((scene) => (
                                                    <div key={scene.id} className="rounded-lg border border-border p-3">
                                                        <div className="mb-2 text-sm font-semibold">{scene.location}</div>
                                                        <div className="text-xs text-muted-foreground">{scene.time || "未设置时间"}</div>
                                                    </div>
                                                ))
                                        )}
                                    </div>
                                ),
                            },
                            {
                                key: "props",
                                label: (
                                    <span className="flex items-center gap-2">
                                        <Package className="size-4" />
                                        道具 ({project.props.length})
                                    </span>
                                ),
                                children: (
                                    <div className="grid grid-cols-4 gap-4">
                                        {project.props.filter((prop) => !libraryKeyword.trim() || prop.name.toLowerCase().includes(libraryKeyword.trim().toLowerCase())).length === 0 ? (
                                            <div className="col-span-4">
                                                <Empty description="暂无道具，进入制作页面添加" />
                                            </div>
                                        ) : (
                                            project.props
                                                .filter((prop) => !libraryKeyword.trim() || prop.name.toLowerCase().includes(libraryKeyword.trim().toLowerCase()))
                                                .map((prop) => (
                                                    <div key={prop.id} className="rounded-lg border border-border p-3">
                                                        <div className="mb-2 text-sm font-semibold">{prop.name}</div>
                                                        <div className="text-xs text-muted-foreground">{prop.description || "暂无描述"}</div>
                                                    </div>
                                                ))
                                        )}
                                    </div>
                                ),
                            },
                        ]}
                    />
                </Card>
            </main>

            <Modal open={batchImportOpen} title="批量导入剧集" okText="导入剧集" cancelText="取消" onCancel={() => setBatchImportOpen(false)} onOk={() => void handleBatchImport()}>
                <p className="mb-3 text-sm text-muted-foreground">每行一集，可用“标题 | 剧本内容”格式填写。</p>
                <Input.TextArea rows={8} value={batchImportText} onChange={(event) => setBatchImportText(event.target.value)} placeholder={"第 1 集 | 雨夜里，主角收到一封神秘来信。\n第 2 集 | 他沿着线索来到旧车站。"} />
            </Modal>

            <Modal open={resourceImportOpen} title={`从素材库导入${resourceImportTarget === "characters" ? "角色" : resourceImportTarget === "scenes" ? "场景" : "道具"}`} footer={null} onCancel={() => setResourceImportOpen(false)}>
                {libraryLoading ? (
                    <div className="flex justify-center py-8">
                        <Spin />
                    </div>
                ) : filteredLibraryAssets.length ? (
                    <List
                        dataSource={filteredLibraryAssets}
                        renderItem={(asset) => (
                            <List.Item
                                actions={[
                                    <Button key="import" type="link" loading={resourceImporting} onClick={() => void handleResourceImport(asset)}>
                                        导入
                                    </Button>,
                                ]}
                            >
                                <List.Item.Meta
                                    avatar={
                                        <div className="grid size-9 place-items-center rounded bg-muted">
                                            <LibraryBig className="size-4" />
                                        </div>
                                    }
                                    title={asset.title}
                                    description={`${asset.kind} · ${asset.note || asset.tags.join("、") || "暂无描述"}`}
                                />
                            </List.Item>
                        )}
                    />
                ) : (
                    <Empty description={libraryKeyword ? "没有匹配的素材" : "素材库暂无内容"} />
                )}
            </Modal>
        </div>
    );
}
