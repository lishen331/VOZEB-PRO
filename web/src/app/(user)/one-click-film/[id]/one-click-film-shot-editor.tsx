"use client";

import { Button, Checkbox, Empty, Input, Modal, Popconfirm, Segmented, Select, Tag, message } from "antd";
import { useEffect, useState } from "react";
import { shotPromptPatch } from "@/lib/one-click/shot-prompt-patch";
import { buildShotBindingPatch } from "@/lib/one-click/shot-binding-patch";
import type { DramaProject, DramaShot, DramaShotFrameType, DramaShotGenerationHistory } from "@/lib/drama-project-contract";
import { SHOT_ANGLE_H_OPTIONS, SHOT_ANGLE_S_OPTIONS, SHOT_ANGLE_V_OPTIONS, SHOT_DEPTH_OF_FIELD_OPTIONS, SHOT_LIGHTING_OPTIONS, SHOT_MOVEMENT_OPTIONS } from "@/lib/one-click/shot-config-options";

type Props = {
    projectId: string;
    /** 资产绑定需要项目级的角色/场景/道具清单。 */
    project: DramaProject;
    episodeId: string;
    shot: DramaShot;
    onClose: () => void;
    onProjectChange: (project: DramaProject) => void;
    /** 由分镜卡的「查看提示词 / 首尾帧」直达入口指定默认页签，对应 L 的卡内提示词预览。 */
    initialTab?: OneClickFilmShotEditorTab;
};

/** 与 Tabs 的 key 一一对应，避免卡片侧传入拼错的字符串。 */
export type OneClickFilmShotEditorTab = "basic" | "prompts" | "frames" | "config" | "bindings" | "records";

type FramePrompt = { frameType: DramaShotFrameType; prompt: string; description?: string; layout?: string };

/**
 * 从记录提示词里取序列图机位标签（拆图时写成 `[俯拍] ...` 前缀）。
 *
 * 标签只存在于文字里 —— 图片本身不烧角标，因为选中的那张会直接作为视频参考图，
 * 烧进去的角标会出现在成片画面里。
 */
function sequencePanelLabel(record: DramaShotGenerationHistory) {
    if (!record.id.startsWith("sequence-panel:")) return "";
    return /^\[([^\]]{1,12})\]/.exec(record.prompt || "")?.[1] || "";
}

async function callJson(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as { code?: number; data?: Record<string, unknown>; msg?: string };
    if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "请求失败");
    return payload.data;
}

/**
 * 分镜编辑弹窗。
 *
 * 字段与保存语义对齐 L `storyboardService.updateStoryboard` 的白名单，
 * 首尾帧提示词走 L `frame_prompts` 的整条覆盖语义（prompt/description/layout 一起写）。
 * 全部调用一键成片自有路由。
 */
export function OneClickFilmShotEditor({ projectId, project, episodeId, shot, onClose, onProjectChange, initialTab = "basic" }: Props) {
    const base = `/api/one-click-film/projects/${encodeURIComponent(projectId)}`;
    const query = `?episodeId=${encodeURIComponent(episodeId)}`;

    const [recordBusyId, setRecordBusyId] = useState<string>();
    const [characterIds, setCharacterIds] = useState<string[]>(shot.characterIds || []);
    const [propIds, setPropIds] = useState<string[]>(shot.propIds || []);
    const [sceneId, setSceneId] = useState<string | undefined>(shot.sceneId);
    const [bindingSaving, setBindingSaving] = useState(false);
    const [title, setTitle] = useState(shot.title || "");
    const [description, setDescription] = useState(shot.description || "");
    const [dialogue, setDialogue] = useState(shot.dialogue || "");
    const [narration, setNarration] = useState(shot.narration || "");
    const [imagePrompt, setImagePrompt] = useState(shot.imagePrompt || "");
    const [videoPrompt, setVideoPrompt] = useState(shot.videoPrompt || "");
    const [universalPrompt, setUniversalPrompt] = useState(shot.universalSegmentText || "");
    const [saving, setSaving] = useState(false);

    const [frameType, setFrameType] = useState<DramaShotFrameType>("first");
    const [framePrompts, setFramePrompts] = useState<FramePrompt[]>([]);
    const [framePrompt, setFramePrompt] = useState("");
    const [frameDescription, setFrameDescription] = useState("");
    const [frameLayout, setFrameLayout] = useState("");
    const [frameSaving, setFrameSaving] = useState(false);
    const [frameGenerating, setFrameGenerating] = useState(false);
    /** 对应 L 的「首帧站位」（lastFrameUseFirstLayoutLock）：默认锁定首帧构图与站位。 */
    const [useFirstFrameLayout, setUseFirstFrameLayout] = useState(true);
    const [polishing, setPolishing] = useState(false);
    const [rebuilding, setRebuilding] = useState(false);
    const [layoutBusy, setLayoutBusy] = useState(false);
    const [layoutDescription, setLayoutDescription] = useState(shot.layoutDescription || "");

    /**
     * L「分镜配置」弹窗字段（景别 / 俯仰 / 方向 / 运镜 / 灯光 / 景深 / 时长）。
     * 这些键全在 shot-crud 白名单里，此前只是没有 UI 入口 —— 属于「后端有、前端没接」。
     */
    const [location, setLocation] = useState(shot.location || "");
    const [time, setTime] = useState(shot.time || "");
    const [action, setAction] = useState(shot.action || "");
    const [result, setResult] = useState(shot.result || "");
    const [atmosphere, setAtmosphere] = useState(shot.atmosphere || "");
    const [angleS, setAngleS] = useState(shot.angleS || "");
    const [angleV, setAngleV] = useState(shot.angleV || "");
    const [angleH, setAngleH] = useState(shot.angleH || "");
    const [cameraMotion, setCameraMotion] = useState(shot.cameraMotion || "");
    const [lightingStyle, setLightingStyle] = useState(shot.lightingStyle || "");
    const [depthOfField, setDepthOfField] = useState(shot.depthOfField || "");
    const [duration, setDuration] = useState(String(shot.duration ?? ""));
    const [configSaving, setConfigSaving] = useState(false);
    const [polishedPrompt, setPolishedPrompt] = useState(shot.polishedPrompt || "");

    useEffect(() => {
        let cancelled = false;
        void callJson(`${base}/shots/${encodeURIComponent(shot.id)}/frame-prompts${query}`, { cache: "no-store" })
            .then((data) => {
                if (cancelled) return;
                setFramePrompts((data?.framePrompts as FramePrompt[]) || []);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [base, query, shot.id]);

    useEffect(() => {
        const current = framePrompts.find((item) => item.frameType === frameType);
        setFramePrompt(current?.prompt || "");
        setFrameDescription(current?.description || "");
        setFrameLayout(current?.layout || "");
    }, [frameType, framePrompts]);

    const saveShot = async () => {
        setSaving(true);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}${query}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, description, dialogue, narration, ...shotPromptPatch({ imagePrompt, polishedPrompt, videoPrompt }), universalSegmentText: universalPrompt }),
            });
            if (data?.project) onProjectChange(data.project as DramaProject);
            message.success("分镜已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "分镜保存失败");
        } finally {
            setSaving(false);
        }
    };

    /**
     * 保存 L「分镜配置」弹窗字段，对应 L `onSaveVideoParamsDialog`。
     *
     * 走同一条 `PUT shots/:id`：这些键本来就在 shot-crud 白名单里。
     * 留空表示不设置，发空字符串即清空该项，与 L 的可清空语义一致。
     */
    const saveConfig = async () => {
        const parsedDuration = duration.trim() ? Number(duration) : undefined;
        if (parsedDuration !== undefined && (!Number.isFinite(parsedDuration) || parsedDuration <= 0)) {
            message.warning("时长需为正数，或留空");
            return;
        }
        setConfigSaving(true);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}${query}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...{ title, location, time, action, result, atmosphere, dialogue, narration },
                    angleS,
                    angleV,
                    angleH,
                    cameraMotion,
                    lightingStyle,
                    depthOfField,
                    ...(parsedDuration === undefined ? {} : { duration: parsedDuration }),
                }),
            });
            if (data?.project) onProjectChange(data.project as DramaProject);
            message.success("分镜配置已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "分镜配置保存失败");
        } finally {
            setConfigSaving(false);
        }
    };

    const saveFramePrompt = async () => {
        if (!framePrompt.trim()) return message.warning("提示词不能为空");
        setFrameSaving(true);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/frame-prompts/${frameType}${query}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: framePrompt, description: frameDescription, layout: frameLayout }),
            });
            setFramePrompts((data?.framePrompts as FramePrompt[]) || []);
            message.success("帧提示词已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "帧提示词保存失败");
        } finally {
            setFrameSaving(false);
        }
    };

    /**
     * 对应 L `POST /storyboards/:id/frame-prompt`：由 AI 规划该帧提示词并直接提交帧图任务。
     * 走一键成片自有路由，计费归属 one-click-film。
     */
    const generateFrame = async () => {
        setFrameGenerating(true);
        try {
            const layoutLockQuery = frameType === "first" || useFirstFrameLayout ? "" : "&useFirstFrameLayout=0";
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/generate-frame${query}&frameType=${frameType}${layoutLockQuery}`, { method: "POST" });
            if (typeof data?.prompt === "string") setFramePrompt(data.prompt);
            if (typeof data?.description === "string") setFrameDescription(data.description);
            message.success("已由 AI 规划该帧提示词并提交帧图任务");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "帧提示词生成失败");
        } finally {
            setFrameGenerating(false);
        }
    };

    /**
     * 对应 L `POST /storyboards/:id/polish-prompt`：把本镜字段交给文本模型润色，
     * 结果写回 polishedPrompt（经典单图生成会优先取它）。
     */
    const polishImagePrompt = async () => {
        setPolishing(true);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/polish-prompt${query}`, { method: "POST" });
            if (typeof data?.polishedPrompt === "string") setPolishedPrompt(data.polishedPrompt);
            if (data?.project) onProjectChange(data.project as DramaProject);
            message.success("已润色图片提示词");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片提示词润色失败");
        } finally {
            setPolishing(false);
        }
    };

    /**
     * 对应 L `POST /storyboards/:id/rebuild-video-prompt`：
     * 按最新模板规则用本镜字段重算视频提示词（纯本地重组，不调模型）。
     */
    const rebuildVideoPrompt = async () => {
        setRebuilding(true);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/rebuild-video-prompt${query}`, { method: "POST" });
            if (typeof data?.videoPrompt === "string") setVideoPrompt(data.videoPrompt);
            if (data?.project) onProjectChange(data.project as DramaProject);
            message.success("已按最新规则重建视频提示词");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "视频提示词重建失败");
        } finally {
            setRebuilding(false);
        }
    };

    /**
     * 对应 L `POST /storyboards/:id/regenerate-layout-description`：
     * 结合前后分镜布局与本镜角色，让 AI 重算空间布局锚点。
     */
    const regenerateLayout = async () => {
        setLayoutBusy(true);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/regenerate-layout-description${query}`, { method: "POST" });
            if (typeof data?.layoutDescription === "string") setLayoutDescription(data.layoutDescription);
            if (data?.project) onProjectChange(data.project as DramaProject);
            message.success("布局描述已由 AI 重新生成并保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "布局描述重生成失败");
        } finally {
            setLayoutBusy(false);
        }
    };

    /**
     * 保存分镜的资产绑定，对应 L `POST /storyboards/:id/props`（propService.associateWithStoryboard）。
     *
     * L 有独立的道具关联端点；V 的 `PUT shots/:id` 白名单已收 characterIds / propIds / sceneId，
     * 所以走同一个更新入口，语义等价（整组覆盖，不是增量追加）。
     */
    const saveBindings = async () => {
        setBindingSaving(true);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}${query}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildShotBindingPatch(characterIds, propIds, sceneId)),
            });
            if (data?.project) onProjectChange(data.project as DramaProject);
            message.success("资产绑定已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "资产绑定保存失败");
        } finally {
            setBindingSaving(false);
        }
    };

    /**
     * 删除一条生成记录，对应 L `DELETE /images/:id` 与 `DELETE /videos/:id`。
     *
     * 服务端会同时解除主图/首尾帧对该记录的引用，避免留下悬空地址。
     */
    const removeRecord = async (kind: "images" | "videos", record: DramaShotGenerationHistory) => {
        setRecordBusyId(record.id);
        try {
            // 路径必须写成字面量：把 kind 插进模板会让死代码守卫找不到调用方，
            // 也让"哪些路由真的被调用"无法静态看出来。
            const path = kind === "images" ? `${base}/shots/${encodeURIComponent(shot.id)}/images/${encodeURIComponent(record.id)}${query}` : `${base}/shots/${encodeURIComponent(shot.id)}/videos/${encodeURIComponent(record.id)}${query}`;
            const data = await callJson(path, { method: "DELETE" });
            const project = data?.project as DramaProject | undefined;
            if (project) onProjectChange(project);
            message.success("删除成功");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        } finally {
            setRecordBusyId(undefined);
        }
    };

    /**
     * 把一条分镜图记录设为本镜主图。
     *
     * 序列图模式（四宫格/九宫格）拆出的每一格都是一条记录，用户靠这个按钮挑机位；
     * 普通记录同样可用，等价于回退到上一版分镜图。
     * 地址由服务端从记录里取，前端不传 URL。
     */
    const setAsStoryboard = async (record: DramaShotGenerationHistory) => {
        setRecordBusyId(record.id);
        try {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/images/${encodeURIComponent(record.id)}${query}`, { method: "POST" });
            const project = data?.project as DramaProject | undefined;
            if (project) onProjectChange(project);
            message.success("已设为本镜分镜图");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "设置分镜图失败");
        } finally {
            setRecordBusyId(undefined);
        }
    };

    const sections = [
        {
            key: "basic",
            label: "基础字段",
            children: (
                <div className="grid gap-3">
                    <label className="grid gap-1 text-sm">
                        标题
                        <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="分镜标题" />
                    </label>
                    <label className="grid gap-1 text-sm">
                        描述
                        <Input.TextArea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} aria-label="分镜描述" />
                    </label>
                    <label className="grid gap-1 text-sm">
                        对白
                        <Input.TextArea rows={2} value={dialogue} onChange={(event) => setDialogue(event.target.value)} aria-label="分镜对白" />
                    </label>
                    <label className="grid gap-1 text-sm">
                        旁白
                        <Input.TextArea rows={2} value={narration} onChange={(event) => setNarration(event.target.value)} aria-label="分镜旁白" />
                    </label>
                    <div className="flex justify-end">
                        <Button type="primary" loading={saving} onClick={() => void saveShot()} aria-label="保存分镜">
                            保存
                        </Button>
                    </div>
                </div>
            ),
        },
        {
            key: "prompts",
            label: "提示词",
            children: (
                <div className="grid gap-3">
                    <label className="grid gap-1 text-sm">
                        图片提示词
                        <Input.TextArea rows={4} value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} aria-label="图片提示词" />
                    </label>
                    {shot.creationMode !== "universal" && shot.storyboardFrameMode !== "first_last" ? (
                        <label className="grid gap-1 text-sm">
                            通用优化提示词
                            <Input.TextArea rows={5} value={polishedPrompt} onChange={(event) => setPolishedPrompt(event.target.value)} aria-label="润色后的图片提示词" />
                        </label>
                    ) : null}
                    <h3 className="text-sm font-medium">视频提示词</h3>
                    <label className="grid gap-1 text-sm">
                        提示词
                        <Input.TextArea rows={8} value={videoPrompt} onChange={(event) => setVideoPrompt(event.target.value)} aria-label="视频提示词" />
                    </label>
                    {shot.creationMode === "universal" ? (
                        <label className="grid gap-1 text-sm">
                            全能参考提示词
                            <Input.TextArea rows={8} value={universalPrompt} onChange={(event) => setUniversalPrompt(event.target.value)} aria-label="全能参考提示词" />
                        </label>
                    ) : null}
                    <div className="flex justify-end gap-2">
                        <Button loading={rebuilding} onClick={() => void rebuildVideoPrompt()} aria-label="重建视频提示词">
                            重建视频提示词
                        </Button>
                        {shot.creationMode !== "universal" && shot.storyboardFrameMode !== "first_last" ? (
                            <Button loading={polishing} onClick={() => void polishImagePrompt()} aria-label="AI 润色图片提示词">
                                AI 润色图片提示词
                            </Button>
                        ) : null}
                        <Button type="primary" loading={saving} onClick={() => void saveShot()} aria-label="保存提示词">
                            保存
                        </Button>
                    </div>
                </div>
            ),
        },
        {
            key: "frames",
            label: "首尾帧提示词",
            children: (
                <div className="grid gap-3">
                    <Segmented
                        value={frameType}
                        onChange={(value) => setFrameType(value as DramaShotFrameType)}
                        options={[
                            { value: "first", label: "首帧" },
                            { value: "key", label: "关键帧" },
                            { value: "last", label: "尾帧" },
                        ]}
                    />
                    {frameType === "first" ? null : (
                        <Checkbox checked={useFirstFrameLayout} onChange={(event) => setUseFirstFrameLayout(event.target.checked)} aria-label="首帧站位">
                            首帧站位（锁定首帧构图与左右站位；取消后可换出场人物）
                        </Checkbox>
                    )}
                    <label className="grid gap-1 text-sm">
                        提示词
                        <Input.TextArea rows={4} value={framePrompt} onChange={(event) => setFramePrompt(event.target.value)} aria-label="帧提示词" />
                    </label>
                    <label className="grid gap-1 text-sm">
                        描述
                        <Input.TextArea rows={2} value={frameDescription} onChange={(event) => setFrameDescription(event.target.value)} aria-label="帧描述" />
                    </label>
                    <label className="grid gap-1 text-sm">
                        空间布局
                        <Input.TextArea rows={2} value={frameLayout} onChange={(event) => setFrameLayout(event.target.value)} aria-label="帧空间布局" />
                    </label>
                    <label className="grid gap-1 text-sm">
                        本镜空间布局锚点（layout_description）
                        <Input.TextArea rows={2} value={layoutDescription} readOnly placeholder="点击「AI 重算空间布局」后生成" aria-label="本镜空间布局锚点" />
                    </label>
                    <div>
                        <Button size="small" loading={layoutBusy} onClick={() => void regenerateLayout()} aria-label="AI 重算空间布局">
                            AI 重算空间布局
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">保存会整条覆盖该帧的提示词、描述与布局（与 L 一致）；已生成的帧图不受影响。</p>
                    <div className="flex justify-end gap-2">
                        <Button loading={frameGenerating} onClick={() => void generateFrame()} aria-label="AI 生成帧提示词">
                            AI 生成该帧
                        </Button>
                        <Button type="primary" loading={frameSaving} onClick={() => void saveFramePrompt()} aria-label="保存帧提示词">
                            保存帧提示词
                        </Button>
                    </div>
                </div>
            ),
        },
        {
            key: "config",
            label: "分镜配置",
            children: (
                <div className="grid gap-3">
                    {/* L「分镜配置」弹窗：景别 / 俯仰 / 方向 / 运镜 / 灯光 / 景深 / 时长 */}
                    <div className="grid gap-3 sm:grid-cols-3">
                        <label>
                            标题
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                        </label>
                        <label>
                            地点
                            <Input aria-label="分镜地点" value={location} onChange={(e) => setLocation(e.target.value)} />
                        </label>
                        <label>
                            时间
                            <Input aria-label="分镜时间" value={time} onChange={(e) => setTime(e.target.value)} />
                        </label>
                    </div>
                    <label>
                        氛围
                        <Input aria-label="分镜氛围" value={atmosphere} onChange={(e) => setAtmosphere(e.target.value)} />
                    </label>
                    <label>
                        动作
                        <Input.TextArea rows={2} aria-label="分镜动作" value={action} onChange={(e) => setAction(e.target.value)} />
                    </label>
                    <label>
                        对白
                        <Input.TextArea rows={2} value={dialogue} onChange={(e) => setDialogue(e.target.value)} />
                    </label>
                    <label>
                        解说旁白
                        <Input.TextArea rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} />
                    </label>
                    <label>
                        画面结果
                        <Input.TextArea rows={2} aria-label="分镜画面结果" value={result} onChange={(e) => setResult(e.target.value)} />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                            <div className="mb-1 text-sm text-muted-foreground">景别（angle_s）</div>
                            <Select allowClear style={{ width: "100%" }} placeholder="未设置" aria-label="分镜景别" value={angleS || undefined} onChange={(value) => setAngleS(value || "")} options={SHOT_ANGLE_S_OPTIONS} />
                        </div>
                        <div>
                            <div className="mb-1 text-sm text-muted-foreground">俯仰（angle_v）</div>
                            <Select allowClear style={{ width: "100%" }} placeholder="未设置" aria-label="分镜俯仰" value={angleV || undefined} onChange={(value) => setAngleV(value || "")} options={SHOT_ANGLE_V_OPTIONS} />
                        </div>
                        <div>
                            <div className="mb-1 text-sm text-muted-foreground">方向（angle_h）</div>
                            <Select allowClear style={{ width: "100%" }} placeholder="未设置" aria-label="分镜方向" value={angleH || undefined} onChange={(value) => setAngleH(value || "")} options={SHOT_ANGLE_H_OPTIONS} />
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                            <div className="mb-1 text-sm text-muted-foreground">运镜</div>
                            <Select allowClear style={{ width: "100%" }} placeholder="未设置" aria-label="分镜运镜" value={cameraMotion || undefined} onChange={(value) => setCameraMotion(value || "")} options={SHOT_MOVEMENT_OPTIONS} />
                        </div>
                        <div>
                            <div className="mb-1 text-sm text-muted-foreground">灯光风格</div>
                            <Select allowClear style={{ width: "100%" }} placeholder="未设置" aria-label="分镜灯光风格" value={lightingStyle || undefined} onChange={(value) => setLightingStyle(value || "")} options={SHOT_LIGHTING_OPTIONS} />
                        </div>
                        <div>
                            <div className="mb-1 text-sm text-muted-foreground">景深</div>
                            <Select allowClear style={{ width: "100%" }} placeholder="未设置" aria-label="分镜景深" value={depthOfField || undefined} onChange={(value) => setDepthOfField(value || "")} options={SHOT_DEPTH_OF_FIELD_OPTIONS} />
                        </div>
                    </div>
                    <div className="sm:max-w-[200px]">
                        <div className="mb-1 text-sm text-muted-foreground">时长（秒）</div>
                        <Input value={duration} placeholder="留空不修改" aria-label="分镜时长" onChange={(event) => setDuration(event.target.value)} />
                    </div>
                    <p className="m-0 text-xs text-muted-foreground">这些参数会进入视频提示词的镜头角度段；留空表示不设置。可用分镜列表上的「补全摄影参数」按规则批量推断。</p>
                    <div>
                        <Button type="primary" loading={configSaving} onClick={() => void saveConfig()} aria-label="保存分镜配置">
                            保存分镜配置
                        </Button>
                    </div>
                </div>
            ),
        },
        {
            key: "bindings",
            label: "资产绑定",
            children: (
                <div className="grid gap-3">
                    <label className="grid gap-1 text-sm">
                        出场角色
                        <Select
                            mode="multiple"
                            allowClear
                            value={characterIds}
                            onChange={(value) => setCharacterIds(value as string[])}
                            options={project.characters.map((asset) => ({ value: asset.id, label: asset.name || asset.id }))}
                            placeholder="选择本镜出场的角色"
                            aria-label="分镜出场角色"
                        />
                    </label>
                    <label className="grid gap-1 text-sm">
                        关联道具
                        <Select
                            mode="multiple"
                            allowClear
                            value={propIds}
                            onChange={(value) => setPropIds(value as string[])}
                            options={project.props.map((asset) => ({ value: asset.id, label: asset.name || asset.id }))}
                            placeholder="选择本镜出现的道具"
                            aria-label="分镜关联道具"
                        />
                    </label>
                    <label className="grid gap-1 text-sm">
                        所属场景
                        <Select
                            allowClear
                            value={sceneId}
                            onChange={(value) => setSceneId(value as string | undefined)}
                            options={project.scenes.map((asset) => ({ value: asset.id, label: asset.name || asset.id }))}
                            placeholder="选择本镜所属场景"
                            aria-label="分镜所属场景"
                        />
                    </label>
                    <p className="text-xs text-muted-foreground">保存为整组覆盖（与 L 的道具关联一致），未选中的资产会被解除绑定。</p>
                    <div className="flex justify-end">
                        <Button type="primary" loading={bindingSaving} onClick={() => void saveBindings()} aria-label="保存资产绑定">
                            保存资产绑定
                        </Button>
                    </div>
                </div>
            ),
        },
        {
            key: "records",
            label: "生成记录",
            children: (
                <div className="grid gap-4">
                    {(
                        [
                            ["images", "分镜图记录", shot.storyboardHistory],
                            ["videos", "分镜视频记录", shot.videoHistory],
                        ] as Array<["images" | "videos", string, DramaShotGenerationHistory[] | undefined]>
                    ).map(([kind, label, history]) => (
                        <section key={kind} className="grid gap-2">
                            <b className="text-sm">
                                {label}（{history?.length || 0}）
                            </b>
                            {history?.length ? (
                                <ul className="grid gap-2">
                                    {history.map((record) => (
                                        <li key={record.id} className="flex items-start justify-between gap-3 rounded-md border p-2">
                                            <div className="flex min-w-0 gap-2">
                                                {kind === "images" && record.url ? (
                                                    // 缩略图：挑机位靠眼睛看，纯文字列表挑不出来。
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={record.url} alt={record.prompt || "分镜图候选"} className="size-16 shrink-0 rounded border border-border object-cover" />
                                                ) : null}
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                                        <Tag>{new Date(record.createdAt).toLocaleString()}</Tag>
                                                        {sequencePanelLabel(record) ? <Tag color="blue">{sequencePanelLabel(record)}</Tag> : null}
                                                        {record.width && record.height ? (
                                                            <span className="text-muted-foreground">
                                                                {record.width}x{record.height}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    <p className="mt-1 truncate text-xs text-muted-foreground">{record.prompt || "无提示词"}</p>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                {kind === "images" && record.url ? (
                                                    <Button
                                                        size="small"
                                                        type={shot.storyboardImageUrl === record.url ? "primary" : "default"}
                                                        disabled={shot.storyboardImageUrl === record.url}
                                                        loading={recordBusyId === record.id}
                                                        aria-label={`将记录 ${record.id} 设为分镜图`}
                                                        onClick={() => void setAsStoryboard(record)}
                                                    >
                                                        {shot.storyboardImageUrl === record.url ? "当前分镜图" : "设为分镜图"}
                                                    </Button>
                                                ) : null}
                                                <Popconfirm title="删除这条生成记录？" description="同时会解除主图与首尾帧对它的引用，此操作不可撤销。" okText="删除" cancelText="取消" onConfirm={() => void removeRecord(kind, record)}>
                                                    <Button size="small" danger loading={recordBusyId === record.id} aria-label={`删除${label} ${record.id}`}>
                                                        删除
                                                    </Button>
                                                </Popconfirm>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <Empty image={null} description={`暂无${label}`} />
                            )}
                        </section>
                    ))}
                </div>
            ),
        },
    ];
    const section = sections.find((item) => item.key === initialTab) || sections[0];
    return (
        <Modal open width={initialTab === "prompts" ? 700 : 760} title={`分镜 · ${shot.title || "未命名"} · ${section.label}`} onCancel={onClose} footer={null} destroyOnHidden>
            <div className="max-h-[75vh] overflow-y-auto">{section.children}</div>
        </Modal>
    );
}
