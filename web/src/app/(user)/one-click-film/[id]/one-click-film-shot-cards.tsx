"use client";

import { Button, Empty, Input, Popconfirm, Segmented, Switch, Tag, Tooltip, message } from "antd";
import { Aperture, ArrowUpToLine, Clapperboard, Film, ImageIcon, Link2, Maximize2, Pencil, Plus, RefreshCcw, Scissors, Trash2 } from "lucide-react";
import { useState } from "react";
import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";

import { OneClickFilmShotEditor } from "./one-click-film-shot-editor";

type Props = {
    projectId: string;
    /** 资产绑定需要项目级的角色/场景/道具清单，故整个项目一起传下去。 */
    project: DramaProject;
    episode: DramaEpisode;
    onProjectChange: (project: DramaProject) => void;
};

async function callJson(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as { code?: number; data?: { project?: DramaProject }; msg?: string };
    if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "请求失败");
    return payload.data;
}

/**
 * 分镜卡片列表。
 *
 * 这些操作对应 L 的 storyboards 接口（create / insert-before / update / delete / split-by-audio），
 * 全部走一键成片自有路由，不经由创作工坊。
 */
export function OneClickFilmShotCards({ projectId, project, episode, onProjectChange }: Props) {
    const [busyShotId, setBusyShotId] = useState<string>();
    const [editing, setEditing] = useState<DramaShot>();
    /** 全能片段草稿：按分镜 id 存，避免多镜互相串写。 */
    const [universalDrafts, setUniversalDrafts] = useState<Record<string, string>>({});
    const [universalBusy, setUniversalBusy] = useState<{ shotId: string; mode: "generate" | "polish" }>();
    const [forceNoRef, setForceNoRef] = useState(false);
    /**
     * L §4 配置行参数。留空 = 交给 AI 决定，与 L 的空值语义一致。
     * 这四项经服务端 normalizeDramaLabStoryboardOptions 校验后注入拆解提示词约束。
     */
    const [shotCount, setShotCount] = useState("");
    const [totalDuration, setTotalDuration] = useState("");
    const [universalMode, setUniversalMode] = useState(false);
    const [generateNarration, setGenerateNarration] = useState(true);
    const base = `/api/one-click-film/projects/${encodeURIComponent(projectId)}`;
    const query = `?episodeId=${encodeURIComponent(episode.id)}`;

    const run = async (shotId: string | undefined, action: () => Promise<void>) => {
        setBusyShotId(shotId || "__collection__");
        try {
            await action();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
        } finally {
            setBusyShotId(undefined);
        }
    };

    /**
     * 重新拆解本集分镜，对应 L `GET /storyboards/episode/:episode_id/generate`。
     *
     * V 此前只能跑完整 7 步工作流，改完剧本没法只重拆分镜。这里走同一个
     * storyboard_extract 子工作流，所以提示词契约与落库字段一致。
     */
    const regenerateStoryboards = () =>
        run(undefined, async () => {
            const storyboardOptions: Record<string, unknown> = {
                ...(shotCount.trim() ? { shotCount: shotCount.trim() } : {}),
                ...(totalDuration.trim() ? { totalDuration: totalDuration.trim() } : {}),
                creationMode: universalMode ? "universal" : "classic",
                generateNarration,
            };
            await callJson(`${base}/episodes/${encodeURIComponent(episode.id)}/storyboards/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storyboardOptions }),
            });
            const refreshed = await callJson(`${base}`, { cache: "no-store" });
            if (refreshed?.project) onProjectChange(refreshed.project);
            message.success("分镜拆解已完成");
        });

    /**
     * 生成 / 润色全能片段描述，对应 L `POST /storyboards/:id/universal-segment-prompt`
     * 与 `universal-segment-polish-stream` 的非流式等价物。
     *
     * L 把这个入口放在全能模式分镜的中栏（片段描述区），不是页面级的单选面板，
     * 所以这里按分镜承载；`forceNoRef` 对应 L 菜单里的「不查图片强制生成/润色」。
     */
    const runUniversalPrompt = async (shot: DramaShot, mode: "generate" | "polish") => {
        const draft = universalDrafts[shot.id] ?? shot.universalSegmentText ?? "";
        if (mode === "polish" && !draft.trim()) {
            message.warning("请先生成或填写全能片段描述后再润色");
            return;
        }
        setUniversalBusy({ shotId: shot.id, mode });
        try {
            const data = (await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/universal-prompt${query}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode, draft, forceWithoutReferenceImages: forceNoRef }),
            })) as unknown as { universalSegmentText?: string } | undefined;
            if (data?.universalSegmentText) setUniversalDrafts((prev) => ({ ...prev, [shot.id]: data.universalSegmentText as string }));
            const refreshed = await callJson(`${base}`, { cache: "no-store" });
            if (refreshed?.project) onProjectChange(refreshed.project);
            message.success(mode === "polish" ? "已润色全能片段描述" : "已生成全能片段描述");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "全能提示词生成失败");
        } finally {
            setUniversalBusy(undefined);
        }
    };

    /**
     * 批量补全本集分镜的摄影参数，对应 L `POST /storyboards/batch-infer-params`。
     *
     * 纯本地规则推断，不调用模型，因此不产生计费。默认只补缺失字段。
     */
    const batchInferParams = () =>
        run(undefined, async () => {
            const data = (await callJson(`${base}/shots/batch-infer-params`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ episodeId: episode.id, overwrite: false }),
            })) as unknown as { total?: number; updated?: number; project?: DramaProject } | undefined;
            if (data?.project) onProjectChange(data.project);
            const updated = data?.updated || 0;
            if (updated > 0) message.success(`已补全 ${updated} 个分镜的摄影参数`);
            else message.info("所有分镜的摄影参数都已完整");
        });

    const createShot = () =>
        run(undefined, async () => {
            const data = await callJson(`${base}/shots${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "新分镜" }) });
            if (data?.project) onProjectChange(data.project);
            message.success("已新增分镜");
        });

    const insertBefore = (shot: DramaShot) =>
        run(shot.id, async () => {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/insert-before${query}`, { method: "POST" });
            if (data?.project) onProjectChange(data.project);
            message.success("已在该分镜前插入");
        });

    const removeShot = (shot: DramaShot) =>
        run(shot.id, async () => {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}${query}`, { method: "DELETE" });
            if (data?.project) onProjectChange(data.project);
            message.success("已删除分镜");
        });

    const splitByAudio = (shot: DramaShot) =>
        run(shot.id, async () => {
            // L 的按音频拆镜是"先预览再应用"，应用为追加式，不覆盖原分镜。
            const preview = (await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/split-by-audio${query}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "preview" }),
            })) as unknown as { plan?: { segments?: unknown[] }; sourceUpdatedAt?: string } | undefined;
            const segments = preview?.plan?.segments?.length || 0;
            if (!segments) {
                message.info("当前分镜没有可拆分的音频片段");
                return;
            }

            const applied = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/split-by-audio${query}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "apply", plan: preview?.plan, expectedUpdatedAt: preview?.sourceUpdatedAt }),
            });
            if (applied?.project) onProjectChange(applied.project);
            message.success(`已按音频拆出 ${segments} 段候选`);
        });

    /** L 的三模式：经典单图 / 首尾帧 / 全能。经典与首尾帧靠 storyboardFrameMode 区分。 */
    const setMode = (shot: DramaShot, mode: "single" | "first_last" | "universal") =>
        run(shot.id, async () => {
            const patch = mode === "universal" ? { creationMode: "universal" as const } : { creationMode: "classic" as const, storyboardFrameMode: mode };
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}${query}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            if (data?.project) onProjectChange(data.project);
        });

    /**
     * 单镜生成。走一键成片自有的 generate-image / generate-video，
     * 因此计费归属是 one-click-film，而不是教学版。
     */
    const generate = (shot: DramaShot, kind: "image" | "video") =>
        run(shot.id, async () => {
            await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/generate-${kind}${query}`, { method: "POST" });
            message.success(kind === "image" ? "分镜图任务已创建" : "分镜视频任务已创建");
            // 任务状态由服务端持久化，这里刷新项目以拿到最新的 running 状态。
            const refreshed = await callJson(`${base}`, { cache: "no-store" });
            if (refreshed?.project) onProjectChange(refreshed.project);
        });

    /**
     * 分镜图 2 倍超分，对应 L `POST /storyboards/:id/upscale`。
     *
     * 纯本地 sharp 处理，不调模型也不计费；成功后分镜主图指向放大结果。
     */
    const upscaleImage = (shot: DramaShot) =>
        run(shot.id, async () => {
            const data = (await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/upscale${query}`, { method: "POST" })) as unknown as { project?: DramaProject; width?: number; height?: number } | undefined;
            if (data?.project) onProjectChange(data.project);
            message.success(data?.width && data?.height ? `分镜图已放大到 ${data.width}x${data.height}` : "分镜图已放大");
        });

    /**
     * 对应 L `link-tail-frame` 的前半段：从本镜已完成视频抽最后一帧，
     * 作为下一镜的候选首帧，实现首尾帧连续性。
     */
    const extractTailFrame = (shot: DramaShot) =>
        run(shot.id, async () => {
            await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/extract-tail-frame${query}`, { method: "POST" });
            const refreshed = await callJson(`${base}`, { cache: "no-store" });
            if (refreshed?.project) onProjectChange(refreshed.project);
            message.success("已提取视频尾帧，可应用为下一镜首帧");
        });

    /** L `link-tail-frame` 的后半段：把候选正式应用为本镜首帧。 */
    const acceptFirstFrame = (shot: DramaShot) =>
        run(shot.id, async () => {
            const candidateId = shot.firstFrameCandidate?.id;
            if (!candidateId) {
                message.info("当前分镜没有候选首帧");
                return;
            }
            const search = `${query}&candidateId=${encodeURIComponent(candidateId)}&replaceExisting=true`;
            await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/accept-first-frame-candidate${search}`, { method: "POST" });
            const refreshed = await callJson(`${base}`, { cache: "no-store" });
            if (refreshed?.project) onProjectChange(refreshed.project);
            message.success("候选首帧已应用");
        });

    if (!episode.shots.length) {
        return (
            <div className="mt-5 rounded-lg border p-6">
                <Empty description="本集还没有分镜，可先运行拆解，或手动新增一条" />
                <div className="mt-3 flex justify-center">
                    <Button icon={<Plus className="size-4" />} loading={busyShotId === "__collection__"} onClick={() => void createShot()} aria-label="新增分镜">
                        新增分镜
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
                <b>分镜（{episode.shots.length}）</b>
                <div className="flex items-center gap-2">
                    <Popconfirm title="重新拆解本集分镜？" description="会按当前剧本重新生成分镜，已生成的图与视频不会被删除。" okText="重新拆解" cancelText="取消" onConfirm={() => void regenerateStoryboards()}>
                        <Button size="small" icon={<RefreshCcw className="size-4" />} loading={busyShotId === "__collection__"} aria-label="重新拆解本集分镜">
                            重新拆解分镜
                        </Button>
                    </Popconfirm>
                    <Tooltip title="按镜头类型与情绪推断缺失的摄影参数，不调用模型">
                        <Button size="small" icon={<Aperture className="size-4" />} loading={busyShotId === "__collection__"} onClick={() => void batchInferParams()} aria-label="批量补全摄影参数">
                            补全摄影参数
                        </Button>
                    </Tooltip>
                    <Button size="small" icon={<Plus className="size-4" />} loading={busyShotId === "__collection__"} onClick={() => void createShot()} aria-label="新增分镜">
                        新增分镜
                    </Button>
                </div>
            </div>

            {/* L §4 配置行：分镜数量 / 视频总时长 / 全能分镜 / 解说旁白 */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                <label className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">分镜数量</span>
                    <Input size="small" style={{ width: 96 }} value={shotCount} placeholder="自动" aria-label="分镜数量" onChange={(event) => setShotCount(event.target.value)} />
                    <span className="text-xs text-muted-foreground">留空由 AI 决定</span>
                </label>
                <label className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">视频总时长</span>
                    <Input size="small" style={{ width: 96 }} value={totalDuration} placeholder="秒" aria-label="视频总时长" onChange={(event) => setTotalDuration(event.target.value)} />
                    <span className="text-xs text-muted-foreground">秒，留空不约束</span>
                </label>
                <Tooltip title="每镜输出多子分镜段落式 universal_segment，与「生成/润色全能提示词」同版式">
                    <label className="flex items-center gap-1.5">
                        <Switch size="small" checked={universalMode} onChange={setUniversalMode} aria-label="全能分镜模式" />
                        <span>全能分镜模式</span>
                    </label>
                </Tooltip>
                <Tooltip title="narration 与对白分开存放，便于后期 TTS 与导出 SRT">
                    <label className="flex items-center gap-1.5">
                        <Switch size="small" checked={generateNarration} onChange={setGenerateNarration} aria-label="生成解说旁白" />
                        <span>生成解说旁白</span>
                    </label>
                </Tooltip>
                <span className="text-xs text-muted-foreground">以上参数在「重新拆解分镜」时生效</span>
            </div>

            <ul className="mt-3 grid gap-3">
                {episode.shots.map((shot, index) => (
                    <li key={shot.id} id={`one-click-shot-${shot.id}`} className="rounded-lg border p-3" data-testid={`one-click-shot-card-${shot.id}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">
                                        分镜 {index + 1} · {shot.title || "未命名"}
                                    </span>
                                    <Tag>{shot.creationMode === "universal" ? "全能" : shot.storyboardFrameMode === "first_last" ? "首尾帧" : "经典"}</Tag>
                                    {shot.storyboardStatus ? <Tag color={statusColor(shot.storyboardStatus)}>图 {shot.storyboardStatus}</Tag> : null}
                                    {shot.generationStatus ? <Tag color={statusColor(shot.generationStatus)}>视频 {shot.generationStatus}</Tag> : null}
                                </div>
                                <p className="mt-1 truncate text-sm text-muted-foreground">{shot.description || shot.sourceText || "暂无描述"}</p>
                                {shot.storyboardError || shot.generationError ? <p className="mt-1 text-sm text-red-500">{shot.storyboardError || shot.generationError}</p> : null}

                                {shot.dialogueAudio || shot.narrationAudio ? (
                                    <div className="mt-2 grid gap-1">
                                        {(
                                            [
                                                ["对白", shot.dialogueAudio],
                                                ["旁白", shot.narrationAudio],
                                            ] as Array<[string, typeof shot.dialogueAudio]>
                                        )
                                            .filter(([, state]) => Boolean(state))
                                            .map(([label, state]) => (
                                                <div key={label} className="flex flex-wrap items-center gap-2 text-xs">
                                                    <span className="text-muted-foreground">{label}配音</span>
                                                    <Tag color={statusColor(state?.status || "idle")}>{state?.status}</Tag>
                                                    {state?.speaker ? <span className="text-muted-foreground">{state.speaker}</span> : null}
                                                    {state?.voice ? <span className="text-muted-foreground">音色 {state.voice}</span> : null}
                                                    {state?.url ? (
                                                        // 结果由服务端回写，这里只播放，不在前端合成
                                                        <audio controls preload="none" src={state.url} className="h-6" aria-label={`播放分镜 ${index + 1} ${label}配音`} />
                                                    ) : null}
                                                    {state?.error ? <span className="text-red-500">{state.error}</span> : null}
                                                </div>
                                            ))}
                                    </div>
                                ) : null}

                                {shot.creationMode === "universal" ? (
                                    <div className="mt-2 rounded-md border border-border bg-muted/30 p-2">
                                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <span>片段描述</span>
                                            <span title="全能生视频链路：由片段描述与 @ 引用的资产共同驱动">（@ 可引用本集角色 / 场景 / 道具）</span>
                                        </div>
                                        <Input.TextArea
                                            rows={5}
                                            value={universalDrafts[shot.id] ?? shot.universalSegmentText ?? ""}
                                            onChange={(event) => setUniversalDrafts((prev) => ({ ...prev, [shot.id]: event.target.value }))}
                                            placeholder="例如：@图片1 为夜景街道，@图片2 从餐厅冲出停在光斑里，低头操作手机…"
                                            aria-label={`分镜 ${index + 1} 全能片段描述`}
                                        />
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <Button
                                                size="small"
                                                type="primary"
                                                loading={universalBusy?.shotId === shot.id && universalBusy.mode === "generate"}
                                                aria-label={`生成分镜 ${index + 1} 全能提示词`}
                                                onClick={() => void runUniversalPrompt(shot, "generate")}
                                            >
                                                生成全能提示词
                                            </Button>
                                            <Button size="small" loading={universalBusy?.shotId === shot.id && universalBusy.mode === "polish"} aria-label={`润色分镜 ${index + 1} 全能提示词`} onClick={() => void runUniversalPrompt(shot, "polish")}>
                                                润色全能提示词
                                            </Button>
                                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Switch size="small" checked={forceNoRef} onChange={setForceNoRef} aria-label="不查图片强制生成/润色" />
                                                不查图片强制生成/润色
                                            </label>
                                        </div>
                                    </div>
                                ) : null}

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Segmented
                                        size="small"
                                        value={shot.creationMode === "universal" ? "universal" : shot.storyboardFrameMode === "first_last" ? "first_last" : "single"}
                                        onChange={(value) => void setMode(shot, value as "single" | "first_last" | "universal")}
                                        options={[
                                            { value: "single", label: "经典" },
                                            { value: "first_last", label: "首尾帧" },
                                            { value: "universal", label: "全能" },
                                        ]}
                                        aria-label={`分镜 ${index + 1} 创作模式`}
                                    />
                                    <Button size="small" icon={<ImageIcon className="size-4" />} loading={busyShotId === shot.id} aria-label={`生成分镜 ${index + 1} 分镜图`} onClick={() => void generate(shot, "image")}>
                                        生成分镜图
                                    </Button>
                                    <Button size="small" icon={<Clapperboard className="size-4" />} loading={busyShotId === shot.id} aria-label={`生成分镜 ${index + 1} 视频`} onClick={() => void generate(shot, "video")}>
                                        生成视频
                                    </Button>
                                    {shot.storyboardImageUrl ? (
                                        <Tooltip title="把分镜图放大 2 倍（本地处理，不计费）">
                                            <Button size="small" icon={<Maximize2 className="size-4" />} loading={busyShotId === shot.id} aria-label={`放大分镜 ${index + 1} 分镜图`} onClick={() => void upscaleImage(shot)}>
                                                放大分镜图
                                            </Button>
                                        </Tooltip>
                                    ) : null}
                                    {shot.videoUrl ? (
                                        <Button size="small" icon={<Film className="size-4" />} loading={busyShotId === shot.id} aria-label={`提取分镜 ${index + 1} 视频尾帧`} onClick={() => void extractTailFrame(shot)}>
                                            提取尾帧
                                        </Button>
                                    ) : null}
                                    {shot.firstFrameCandidate ? (
                                        <Button size="small" icon={<Link2 className="size-4" />} loading={busyShotId === shot.id} aria-label={`应用分镜 ${index + 1} 候选首帧`} onClick={() => void acceptFirstFrame(shot)}>
                                            应用候选首帧
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <Tooltip title="编辑分镜">
                                    <Button size="small" type="text" icon={<Pencil className="size-4" />} aria-label={`编辑分镜 ${index + 1}`} onClick={() => setEditing(shot)} />
                                </Tooltip>
                                <Tooltip title="在此分镜前插入">
                                    <Button size="small" type="text" icon={<ArrowUpToLine className="size-4" />} loading={busyShotId === shot.id} aria-label={`在分镜 ${index + 1} 前插入`} onClick={() => void insertBefore(shot)} />
                                </Tooltip>
                                <Tooltip title="按音频拆镜">
                                    <Button size="small" type="text" icon={<Scissors className="size-4" />} loading={busyShotId === shot.id} aria-label={`按音频拆分镜 ${index + 1}`} onClick={() => void splitByAudio(shot)} />
                                </Tooltip>
                                <Tooltip title="删除分镜">
                                    <Button size="small" type="text" danger icon={<Trash2 className="size-4" />} loading={busyShotId === shot.id} aria-label={`删除分镜 ${index + 1}`} onClick={() => void removeShot(shot)} />
                                </Tooltip>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>

            {editing ? (
                <OneClickFilmShotEditor
                    projectId={projectId}
                    project={project}
                    episodeId={episode.id}
                    shot={editing}
                    onClose={() => setEditing(undefined)}
                    onProjectChange={(next) => {
                        onProjectChange(next);
                        const refreshed = next.episodes.find((item) => item.id === episode.id)?.shots.find((item) => item.id === editing.id);
                        if (refreshed) setEditing(refreshed);
                    }}
                />
            ) : null}
        </div>
    );
}

function statusColor(status: string) {
    if (status === "success") return "success";
    if (status === "error" || status === "cancelled") return "error";
    if (status === "running" || status === "pending" || status === "queued") return "processing";
    return "default";
}
