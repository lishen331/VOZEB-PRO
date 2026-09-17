"use client";

import { Button, Empty, Input, Modal, Segmented, Tag, message } from "antd";
import { ImageIcon, Sparkles, Star, Trash2, Upload, UserRound } from "lucide-react";
import { useState } from "react";
import type { DramaAssetReference, DramaNamedAsset, DramaProject } from "@/lib/drama-project-contract";
import { dramaAssetPrimaryReference, dramaAssetReferences } from "@/lib/drama-asset-references";

type AssetKind = "characters" | "scenes" | "props";

type Props = {
    projectId: string;
    project: DramaProject;
    onProjectChange: (project: DramaProject) => void;
};

async function callJson(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as { code?: number; data?: Record<string, unknown>; msg?: string };
    if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "请求失败");
    return payload.data;
}

const KIND_LABEL: Record<AssetKind, string> = { characters: "角色", scenes: "场景", props: "道具" };

/**
 * 资产面板（角色 / 场景 / 道具）。
 *
 * AI 能力对应 L 的四个端点，统一走一键成片自有的 assets/:assetId/ai：
 * describe = extract-from-image、prompt = generate-prompt、
 * anchor = extract-anchors、stages = generate-stages。
 *
 * L 的角色默认四视图，场景/道具默认单图 —— 这里沿用同一约定。
 */
export function OneClickFilmAssetPanel({ projectId, project, onProjectChange }: Props) {
    const [kind, setKind] = useState<AssetKind>("characters");
    const [editing, setEditing] = useState<DramaNamedAsset>();
    const [busy, setBusy] = useState<string>();
    const base = `/api/one-click-film/projects/${encodeURIComponent(projectId)}`;
    const assets = (project[kind] || []) as DramaNamedAsset[];

    const runAi = async (asset: DramaNamedAsset, action: "describe" | "prompt" | "anchor" | "stages") => {
        setBusy(`${asset.id}:${action}`);
        try {
            const data = await callJson(`${base}/assets/${encodeURIComponent(asset.id)}/ai`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    kind,
                    action,
                    // L：角色固定四视图，场景/道具跟随资产自身设置（默认单图）
                    generationLayout: kind === "characters" ? "four_view" : asset.generationLayout || "single",
                    requestId: `one-click-film-asset-${action}:${projectId}:${asset.id}`,
                }),
            });

            // 把 AI 产出写回项目，字段与 L 对齐：描述 / 提示词 / 视觉锚点 / 阶段造型
            const patch: Partial<DramaNamedAsset> = {};
            if (typeof data?.description === "string" && data.description.trim()) patch.description = data.description;
            if (typeof data?.appearance === "string" && data.appearance.trim()) patch.appearance = data.appearance;
            if (typeof data?.polishedPrompt === "string" && data.polishedPrompt.trim()) patch.polishedPrompt = data.polishedPrompt;
            if (typeof data?.imagePrompt === "string" && data.imagePrompt.trim()) patch.imagePrompt = data.imagePrompt;
            if (data?.profile && typeof data.profile === "object") patch.profile = data.profile as DramaNamedAsset["profile"];
            if (Array.isArray(data?.stages)) patch.stages = data.stages as DramaNamedAsset["stages"];

            if (Object.keys(patch).length) {
                const nextAssets = assets.map((item) => (item.id === asset.id ? { ...item, ...patch } : item));
                const saved = await callJson(base, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [kind]: nextAssets }) });
                if (saved?.project) {
                    onProjectChange(saved.project as DramaProject);
                    const refreshed = ((saved.project as DramaProject)[kind] as DramaNamedAsset[]).find((item) => item.id === asset.id);
                    if (refreshed && editing?.id === asset.id) setEditing(refreshed);
                }
            }
            message.success("资产 AI 操作完成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "资产 AI 操作失败");
        } finally {
            setBusy(undefined);
        }
    };

    /**
     * 资产设定图生成。对应 L 的 `generate-image` / `generate-four-view-image`。
     * 走一键成片自有路由（服务端显式写 featureModule），计费归属 one-click-film。
     */
    const generateImage = async (asset: DramaNamedAsset) => {
        setBusy(`${asset.id}:image`);
        try {
            await callJson(`${base}/assets/${encodeURIComponent(asset.id)}/generate-image`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, generationLayout: kind === "characters" ? "four_view" : asset.generationLayout || "single" }),
            });
            message.success(kind === "characters" ? "角色四视图任务已创建" : "资产设定图任务已创建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "资产设定图任务创建失败");
        } finally {
            setBusy(undefined);
        }
    };

    /** 读取本地文件为 dataUrl，交服务端持久化（不在前端直接落库）。 */
    const readAsDataUrl = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("读取图片失败"));
            reader.readAsDataURL(file);
        });

    /**
     * 参考图操作，对应 L 的 upload-image / PUT image（设为主图）/ 移除。
     * 服务端负责持久化与主图排序，这里只负责交互。
     */
    const runReferenceAction = async (asset: DramaNamedAsset, body: Record<string, unknown>, key: string) => {
        setBusy(`${asset.id}:${key}`);
        try {
            const data = await callJson(`${base}/assets/${encodeURIComponent(asset.id)}/references`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, ...body }),
            });
            if (data?.project) {
                onProjectChange(data.project as DramaProject);
                const refreshed = ((data.project as DramaProject)[kind] as DramaNamedAsset[]).find((item) => item.id === asset.id);
                if (refreshed && editing?.id === asset.id) setEditing(refreshed);
            }
            message.success("参考图已更新");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "参考图操作失败");
        } finally {
            setBusy(undefined);
        }
    };

    const uploadReferences = async (asset: DramaNamedAsset, files: FileList | null) => {
        const selected = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        if (!selected.length) return;
        const uploads = await Promise.all(selected.map(async (file) => ({ dataUrl: await readAsDataUrl(file), name: file.name })));
        await runReferenceAction(asset, { action: "upload", uploads }, "upload");
    };

    return (
        <section className="mt-6 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">资产准备</h2>
                <Segmented value={kind} onChange={(value) => setKind(value as AssetKind)} options={(Object.keys(KIND_LABEL) as AssetKind[]).map((item) => ({ value: item, label: KIND_LABEL[item] }))} aria-label="资产类型" />
            </div>

            {assets.length ? (
                <ul className="mt-4 grid gap-3">
                    {assets.map((asset) => (
                        <li key={asset.id} className="rounded-lg border p-3" data-testid={`one-click-asset-${asset.id}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{asset.name || "未命名"}</span>
                                        <Tag>{kind === "characters" ? "四视图" : asset.generationLayout === "four_view" ? "四格" : "单图"}</Tag>
                                        {asset.primaryReferenceId ? <Tag color="success">已有主参考图</Tag> : null}
                                        {asset.stages?.length ? <Tag color="processing">{asset.stages.length} 段造型</Tag> : null}
                                    </div>
                                    <p className="mt-1 truncate text-sm text-muted-foreground">{asset.description || asset.appearance || "暂无描述"}</p>
                                </div>
                                <Button size="small" icon={<UserRound className="size-4" />} aria-label={`编辑${KIND_LABEL[kind]} ${asset.name || asset.id}`} onClick={() => setEditing(asset)}>
                                    编辑
                                </Button>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                                <Button size="small" icon={<Sparkles className="size-4" />} loading={busy === `${asset.id}:prompt`} aria-label={`生成${KIND_LABEL[kind]}生图提示词`} onClick={() => void runAi(asset, "prompt")}>
                                    生成生图提示词
                                </Button>
                                <Button
                                    size="small"
                                    icon={<ImageIcon className="size-4" />}
                                    loading={busy === `${asset.id}:image`}
                                    aria-label={kind === "characters" ? `生成角色四视图 ${asset.name || asset.id}` : `生成${KIND_LABEL[kind]}设定图 ${asset.name || asset.id}`}
                                    onClick={() => void generateImage(asset)}
                                >
                                    {kind === "characters" ? "生成四视图" : "生成设定图"}
                                </Button>
                                <Button size="small" loading={busy === `${asset.id}:describe`} aria-label={`从参考图提取${KIND_LABEL[kind]}特征`} onClick={() => void runAi(asset, "describe")}>
                                    从参考图提取特征
                                </Button>
                                {kind === "characters" ? (
                                    <>
                                        <Button size="small" loading={busy === `${asset.id}:anchor`} aria-label="提炼视觉锚点" onClick={() => void runAi(asset, "anchor")}>
                                            提炼视觉锚点
                                        </Button>
                                        <Button size="small" loading={busy === `${asset.id}:stages`} aria-label="AI 生成阶段造型" onClick={() => void runAi(asset, "stages")}>
                                            AI 生成造型
                                        </Button>
                                    </>
                                ) : null}
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="mt-4">
                    <Empty description={`本项目还没有${KIND_LABEL[kind]}，可先运行资产提取`} />
                </div>
            )}

            {editing ? (
                <Modal open width={680} title={`${KIND_LABEL[kind]} · ${editing.name || "未命名"}`} onCancel={() => setEditing(undefined)} footer={null} destroyOnHidden>
                    <div className="grid gap-3">
                        <label className="grid gap-1 text-sm">
                            名称
                            <Input value={editing.name} readOnly aria-label="资产名称" />
                        </label>
                        <label className="grid gap-1 text-sm">
                            描述
                            <Input.TextArea rows={3} value={editing.description || ""} readOnly aria-label="资产描述" />
                        </label>
                        <label className="grid gap-1 text-sm">
                            外貌 / 外观
                            <Input.TextArea rows={3} value={editing.appearance || ""} readOnly aria-label="资产外貌" />
                        </label>
                        <label className="grid gap-1 text-sm">
                            生图提示词（AI 生成后写回）
                            <Input.TextArea rows={4} value={editing.polishedPrompt || editing.imagePrompt || ""} readOnly aria-label="资产生图提示词" />
                        </label>
                        {editing.stages?.length ? (
                            <div className="grid gap-1 text-sm">
                                阶段造型
                                <ul className="grid gap-1">
                                    {editing.stages.map((stage, index) => (
                                        <li key={index} className="rounded border p-2 text-xs">
                                            第 {stage.episodeRange?.[0]}–{stage.episodeRange?.[1]} 集：{stage.appearance}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        <div className="grid gap-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span>参考图（{dramaAssetReferences(editing).length}）</span>
                                <label className="cursor-pointer rounded border px-3 py-1 text-xs" aria-label="上传参考图">
                                    <Upload className="mr-1 inline size-3" />
                                    上传参考图
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(event) => {
                                            void uploadReferences(editing, event.target.files);
                                            event.target.value = "";
                                        }}
                                    />
                                </label>
                            </div>
                            {dramaAssetReferences(editing).length ? (
                                <ul className="grid gap-2">
                                    {dramaAssetReferences(editing).map((reference: DramaAssetReference) => {
                                        const isPrimary = dramaAssetPrimaryReference(editing)?.id === reference.id;
                                        return (
                                            <li key={reference.id} className="flex items-center justify-between gap-2 rounded border p-2">
                                                <span className="min-w-0 truncate text-xs">
                                                    {reference.label || reference.id}
                                                    {isPrimary ? (
                                                        <Tag className="ml-2" color="success">
                                                            主参考图
                                                        </Tag>
                                                    ) : null}
                                                </span>
                                                <span className="flex shrink-0 gap-1">
                                                    {isPrimary ? null : (
                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            icon={<Star className="size-3" />}
                                                            loading={busy === `${editing.id}:primary`}
                                                            aria-label={`将 ${reference.label || reference.id} 设为主参考图`}
                                                            onClick={() => void runReferenceAction(editing, { action: "primary", referenceId: reference.id }, "primary")}
                                                        />
                                                    )}
                                                    <Button
                                                        size="small"
                                                        type="text"
                                                        danger
                                                        icon={<Trash2 className="size-3" />}
                                                        loading={busy === `${editing.id}:remove`}
                                                        aria-label={`移除 ${reference.label || reference.id}`}
                                                        onClick={() => void runReferenceAction(editing, { action: "remove", referenceId: reference.id }, "remove")}
                                                    />
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <p className="text-xs text-muted-foreground">还没有参考图，可上传后设为主参考图。</p>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">字段由上方 AI 按钮生成并写回项目。</p>
                    </div>
                </Modal>
            ) : null}
        </section>
    );
}
