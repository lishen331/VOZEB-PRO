"use client";

import { Button, Checkbox, Empty, Image, Input, Popconfirm, Select, Switch, Tag, Tooltip, message } from "antd";
import { Aperture, ArrowUpToLine, Clapperboard, FileText, Film, ImageIcon, Link2, LoaderCircle, Maximize2, Mic, Pencil, Plus, RefreshCcw, Scissors, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import type { DramaLabStoryboardSequenceMode } from "@/lib/drama-lab-storyboard-options";
import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";

import { runBatchMedia, type BatchMediaKind, type BatchMediaProgress } from "@/lib/one-click/batch-media";
import { dramaLabVideoTaskReviewDescription, requiresDramaLabVideoTaskCheck } from "@/app/(user)/drama-lab/[id]/drama-lab-video-task-recovery";
import { recoverVideoGenerationTask } from "@/services/api/video-core";

import { OneClickShotMediaUpload } from "./one-click-shot-media-upload";
import { OneClickFilmShotEditor, type OneClickFilmShotEditorTab } from "./one-click-film-shot-editor";

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
    /** 卡上的直达入口指定编辑弹窗默认页签（对应 L 的卡内「查看提示词」）。 */
    const [editingTab, setEditingTab] = useState<OneClickFilmShotEditorTab>("basic");
    const openEditor = (shot: DramaShot, tab: OneClickFilmShotEditorTab = "basic") => {
        setEditingTab(tab);
        setEditing(shot);
    };
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
    /** 批量生成状态，对应 L 的 batchImageRunning / batchImageProgress / batchImageErrors。 */
    const [batchKind, setBatchKind] = useState<BatchMediaKind>();
    const [batchProgress, setBatchProgress] = useState<BatchMediaProgress>();
    const [batchErrors, setBatchErrors] = useState<string[]>([]);
    /** 停止标志用 ref：worker 循环里要读到最新值，state 快照读不到。 */
    const stopRequested = useRef(false);
    const [stopping, setStopping] = useState(false);
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
     * 序列图模式：一次上游调用出一张 2x2 / 3x3 网格图，每格是同一瞬间的不同机位，
     * 任务成功后由服务端按象限裁成候选（纯本地裁剪，不额外计费）。
     * 候选在编辑弹窗「生成记录」里挑，选中即成为本镜分镜图。
     */
    const setSequenceMode = (shot: DramaShot, mode: DramaLabStoryboardSequenceMode) =>
        run(shot.id, async () => {
            const data = await callJson(`${base}/shots/${encodeURIComponent(shot.id)}${query}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storyboardSequenceMode: mode }),
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
     * 批量生成分镜图 / 分镜视频，对应 L `startBatchImageGeneration` / `startBatchVideoGeneration`。
     *
     * 编排逻辑在 `@/lib/one-click/batch-media`（并发 3、跳过已有成品、协作式停止），
     * 抽出去是为了能做真实行为测试；这里只负责提交、刷新与提示。
     */
    const runBatch = async (kind: BatchMediaKind) => {
        stopRequested.current = false;
        setStopping(false);
        setBatchErrors([]);
        setBatchKind(kind);
        setBatchProgress({ current: 0, total: 0, failed: 0 });
        try {
            const result = await runBatchMedia(episode.shots, kind, {
                submit: async (shot) => {
                    await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/generate-${kind}${query}`, { method: "POST" });
                },
                reload: async () => {
                    const refreshed = await callJson(`${base}`, { cache: "no-store" });
                    if (refreshed?.project) onProjectChange(refreshed.project);
                    const next = (refreshed?.project as DramaProject | undefined)?.episodes.find((item) => item.id === episode.id);
                    return next?.shots || [];
                },
                shouldStop: () => stopRequested.current,
                onProgress: setBatchProgress,
            });
            setBatchErrors(result.errors);
            const label = kind === "image" ? "分镜图" : "分镜视频";
            if (!result.total) message.info(`所有分镜均已有${label}，无需重新生成`);
            else if (result.stopped) message.info("批量生成已停止");
            else if (result.failed) message.warning(`批量完成，${result.failed}/${result.total} 条失败`);
            else message.success(`${label}批量生成完成（共 ${result.total} 条）`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "批量生成失败");
        } finally {
            setBatchKind(undefined);
            setStopping(false);
            stopRequested.current = false;
        }
    };

    /**
     * 单镜配音，对应 L `onTtsSbDialogue`（对白配音）与 `onTtsSbNarration`（解说配音）。
     *
     * 服务端复用整集配音 runner 并只传该分镜与该音轨，避免 featureModule 分叉。
     */
    const generateAudio = (shot: DramaShot, kind: "dialogue" | "narration") =>
        run(shot.id, async () => {
            await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/generate-audio${query}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind }),
            });
            message.success(kind === "narration" ? "解说配音任务已创建" : "对白配音任务已创建");
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

    /**
     * 对应 L `onUsePrevTailAsFirst`：把上一镜视频的真实尾帧直接取来当本镜首帧。
     * V 已有两条等价路由，这里按 L 的语义组合：先在上一镜抽尾帧生成候选，
     * 再在本镜确认该候选为首帧（replaceExisting=true，与 L 的覆盖行为一致）。
     */
    const applyPreviousTailAsFirst = (shot: DramaShot, previousShot: DramaShot) =>
        run(shot.id, async () => {
            if (!previousShot.videoUrl) {
                message.info("上一镜还没有可用视频，无法取尾帧");
                return;
            }
            const extracted = (await callJson(`${base}/shots/${encodeURIComponent(previousShot.id)}/extract-tail-frame${query}`, { method: "POST" })) as unknown as { nextShot?: { id?: string; candidate?: { id?: string } } } | undefined;
            const candidateId = extracted?.nextShot?.id === shot.id ? extracted?.nextShot?.candidate?.id : undefined;
            if (!candidateId) {
                message.error("上一镜尾帧没有落到本镜候选首帧，请确认两镜相邻");
                return;
            }
            const search = `${query}&candidateId=${encodeURIComponent(candidateId)}&replaceExisting=true`;
            await callJson(`${base}/shots/${encodeURIComponent(shot.id)}/accept-first-frame-candidate${search}`, { method: "POST" });
            const refreshed = await callJson(`${base}`, { cache: "no-store" });
            if (refreshed?.project) onProjectChange(refreshed.project);
            message.success("已用上一镜尾帧作为本镜首帧");
        });

    /**
     * 对应 L `onResumeSbVideoPoll`（「继续查询」）：视频任务卡在待检查时，
     * 只查询原上游任务，绝不重新提交，避免重复扣费。
     * 走平台共享的 /api/video-tasks/:id recover（该端点无模块身份耦合），
     * 判定逻辑复用与创作工坊同一份 requiresDramaLabVideoTaskCheck。
     */
    const resumeVideoPoll = (shot: DramaShot) =>
        run(shot.id, async () => {
            const taskId = shot.generationTaskId?.trim();
            if (!taskId) {
                message.info("当前分镜没有可继续查询的视频任务");
                return;
            }
            await recoverVideoGenerationTask({ id: taskId, serverTaskId: taskId, provider: "generation", model: "one-click-film-video", pollPath: "server" });
            const refreshed = await callJson(`${base}`, { cache: "no-store" });
            if (refreshed?.project) onProjectChange(refreshed.project);
            message.success("已查询原视频任务状态，结果会同步回本镜");
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
                    {/* L §4 批量操作：批量生成分镜图 / 分镜视频 + 停止 */}
                    <Button
                        size="small"
                        icon={<ImageIcon className="size-4" />}
                        loading={batchKind === "image"}
                        disabled={Boolean(batchKind) || busyShotId === "__collection__" || !episode.shots.length}
                        aria-label="批量生成分镜图"
                        onClick={() => void runBatch("image")}
                    >
                        批量生成分镜图
                    </Button>
                    <Button
                        size="small"
                        icon={<Clapperboard className="size-4" />}
                        loading={batchKind === "video"}
                        disabled={Boolean(batchKind) || busyShotId === "__collection__" || !episode.shots.length}
                        aria-label="批量生成分镜视频"
                        onClick={() => void runBatch("video")}
                    >
                        批量生成分镜视频
                    </Button>
                    {batchKind ? (
                        <Button
                            size="small"
                            danger
                            disabled={stopping}
                            aria-label={batchKind === "image" ? "停止图片" : "停止视频"}
                            onClick={() => {
                                stopRequested.current = true;
                                setStopping(true);
                            }}
                        >
                            {batchKind === "image" ? "停止图片" : "停止视频"}
                        </Button>
                    ) : null}
                </div>
            </div>

            {/* L §4 批量进度与错误清单，对应 L 的 .batch-status */}
            {batchKind || batchErrors.length ? (
                <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-sm" data-testid="one-click-batch-status">
                    {batchKind && batchProgress ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">{batchKind === "image" ? "分镜图" : "分镜视频"}批量生成</span>
                            <span>
                                {batchProgress.current}/{batchProgress.total}
                            </span>
                            {batchProgress.failed ? <span className="text-red-500">失败 {batchProgress.failed}</span> : null}
                            {stopping ? <span className="text-muted-foreground">（正在停止...）</span> : null}
                        </div>
                    ) : null}
                    {batchErrors.length ? (
                        <div className="mt-2 text-xs text-red-500">
                            <div className="font-semibold">失败明细：</div>
                            {batchErrors.map((item) => (
                                <div key={item}>{item}</div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}

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
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">
                                        分镜 {index + 1} · {shot.title || "未命名"}
                                    </span>
                                    <Tag>{shot.creationMode === "universal" ? "全能" : shot.storyboardFrameMode === "first_last" ? "首尾帧" : "经典"}</Tag>
                                    {shot.storyboardStatus ? <Tag color={statusColor(shot.storyboardStatus)}>图 {shot.storyboardStatus}</Tag> : null}
                                    {shot.generationStatus ? <Tag color={statusColor(shot.generationStatus)}>视频 {shot.generationStatus}</Tag> : null}
                                </div>
                                <p className="mt-1 truncate text-sm text-muted-foreground">{shot.description || shot.sourceText || "暂无描述"}</p>
                                {requiresDramaLabVideoTaskCheck(shot) ? (
                                    <p className="mt-1 text-sm text-amber-600" aria-label={`分镜 ${index + 1} 视频结果待检查`}>
                                        {dramaLabVideoTaskReviewDescription(shot)}
                                    </p>
                                ) : shot.storyboardError || shot.generationError ? (
                                    <p className="mt-1 text-sm text-red-500">{shot.storyboardError || shot.generationError}</p>
                                ) : null}

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

                                <div className="mt-3 grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-3">
                                    <section aria-label="分镜脚本" className="min-w-0">
                                        <h3 className="mb-2 text-sm font-medium">分镜脚本</h3>
                                        <div className="h-64 overflow-y-auto rounded border p-3 text-sm whitespace-pre-wrap">
                                            {shot.description || shot.sourceText || "暂无描述"}
                                            {shot.dialogue ? <p className="mt-3">对白：{shot.dialogue}</p> : null}
                                            {shot.narration ? <p className="mt-3">旁白：{shot.narration}</p> : null}
                                        </div>
                                    </section>
                                    <section aria-label="分镜参考图" className="min-w-0">
                                        <h3 className="mb-2 text-sm font-medium">{shot.creationMode === "universal" ? "全能参考" : "分镜图"}</h3>
                                        {shot.creationMode === "universal" ? (
                                            <div className="flex h-64 flex-col overflow-y-auto rounded-md border border-border bg-muted/30 p-2">
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
                                                    <Button
                                                        size="small"
                                                        loading={universalBusy?.shotId === shot.id && universalBusy.mode === "polish"}
                                                        aria-label={`润色分镜 ${index + 1} 全能提示词`}
                                                        onClick={() => void runUniversalPrompt(shot, "polish")}
                                                    >
                                                        润色全能提示词
                                                    </Button>
                                                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <Switch size="small" checked={forceNoRef} onChange={setForceNoRef} aria-label="不查图片强制生成/润色" />
                                                        不查图片强制生成/润色
                                                    </label>
                                                </div>
                                            </div>
                                        ) : shot.storyboardFrameMode === "first_last" ? (
                                            <div className="grid h-64 grid-cols-2 gap-2">
                                                <div className="flex min-w-0 flex-col items-center justify-center overflow-hidden rounded border bg-muted/30">
                                                    <span className="text-xs">首帧</span>
                                                    <OneClickShotMediaUpload projectId={projectId} episodeId={episode.id} shotId={shot.id} target="first" onProjectChange={onProjectChange} />
                                                    {shot.frames?.first?.url ? <Image src={shot.frames.first.url} alt="首帧" height={210} className="object-contain" /> : <Empty image={null} description="暂无首帧" />}
                                                    <Button size="small" onClick={() => openEditor(shot, "frames")}>
                                                        查看提示词
                                                    </Button>
                                                </div>
                                                <div className="flex min-w-0 flex-col items-center justify-center overflow-hidden rounded border bg-muted/30">
                                                    <span className="text-xs">尾帧</span>
                                                    <OneClickShotMediaUpload projectId={projectId} episodeId={episode.id} shotId={shot.id} target="last" onProjectChange={onProjectChange} />
                                                    {shot.frames?.last?.url ? <Image src={shot.frames.last.url} alt="尾帧" height={210} className="object-contain" /> : <Empty image={null} description="暂无尾帧" />}
                                                    <Button size="small" onClick={() => openEditor(shot, "frames")}>
                                                        查看提示词
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex h-64 min-w-0 items-center justify-center overflow-hidden rounded border bg-muted/30">
                                                {shot.storyboardImageUrl ? <Image src={shot.storyboardImageUrl} alt="分镜参考图" height={240} className="object-contain" /> : <Empty image={null} description="暂无分镜图" />}
                                            </div>
                                        )}
                                    </section>
                                    <section aria-label="分镜视频" className="min-w-0">
                                        <h3 className="mb-2 text-sm font-medium">分镜视频</h3>
                                        <div className="flex h-64 min-w-0 items-center justify-center overflow-hidden rounded border bg-muted/30">
                                            {shot.videoUrl ? <video src={shot.videoUrl} controls preload="metadata" className="h-full w-full object-contain" /> : <Empty image={null} description="暂无分镜视频" />}
                                        </div>
                                    </section>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Button size="small" aria-label={`分镜 ${index + 1} 创作模式`} onClick={() => void setMode(shot, shot.creationMode === "universal" ? (shot.storyboardFrameMode === "first_last" ? "first_last" : "single") : "universal")}>
                                        {shot.creationMode === "universal" ? "切换成经典分镜" : "切换成全能模式"}
                                    </Button>
                                    {shot.creationMode !== "universal" ? (
                                        <Checkbox checked={shot.storyboardFrameMode === "first_last"} onChange={(event) => void setMode(shot, event.target.checked ? "first_last" : "single")}>
                                            首尾帧
                                        </Checkbox>
                                    ) : null}
                                    {shot.creationMode === "universal" ? null : (
                                        <Tooltip title="一次生成多机位网格图，完成后自动裁成候选，在编辑弹窗「生成记录」里挑一格。裁剪为本地处理，不额外计费">
                                            <Select
                                                size="small"
                                                style={{ minWidth: 108 }}
                                                value={shot.storyboardSequenceMode || "single"}
                                                aria-label={`分镜 ${index + 1} 序列图模式`}
                                                onChange={(value) => void setSequenceMode(shot, value)}
                                                options={[
                                                    { value: "single", label: "单图" },
                                                    { value: "quad_grid", label: "四宫格" },
                                                    { value: "nine_grid", label: "九宫格" },
                                                ]}
                                            />
                                        </Tooltip>
                                    )}
                                    <OneClickShotMediaUpload projectId={projectId} episodeId={episode.id} shotId={shot.id} target="image" disabled={busyShotId === shot.id} onProjectChange={onProjectChange} />
                                    <Button size="small" icon={<ImageIcon className="size-4" />} loading={busyShotId === shot.id} aria-label={`生成分镜 ${index + 1} 分镜图`} onClick={() => void generate(shot, "image")}>
                                        生成分镜图
                                    </Button>
                                    <OneClickShotMediaUpload projectId={projectId} episodeId={episode.id} shotId={shot.id} target="video" disabled={busyShotId === shot.id} onProjectChange={onProjectChange} />
                                    <Button size="small" icon={<Clapperboard className="size-4" />} loading={busyShotId === shot.id} aria-label={`生成分镜 ${index + 1} 视频`} onClick={() => void generate(shot, "video")}>
                                        生成视频
                                    </Button>
                                    {/* L: 对白配音 / 解说配音，仅在有对应文案时出现 */}
                                    {shot.dialogue?.trim() ? (
                                        <Tooltip title="对白配音（TTS）">
                                            <Button size="small" icon={<Mic className="size-4" />} loading={busyShotId === shot.id} aria-label={`为分镜 ${index + 1} 生成对白配音`} onClick={() => void generateAudio(shot, "dialogue")}>
                                                对白配音
                                            </Button>
                                        </Tooltip>
                                    ) : null}
                                    {shot.narration?.trim() ? (
                                        <Tooltip title="解说旁白配音（TTS）">
                                            <Button size="small" icon={<Mic className="size-4" />} loading={busyShotId === shot.id} aria-label={`为分镜 ${index + 1} 生成解说配音`} onClick={() => void generateAudio(shot, "narration")}>
                                                解说配音
                                            </Button>
                                        </Tooltip>
                                    ) : null}
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
                                    {requiresDramaLabVideoTaskCheck(shot) ? (
                                        <Tooltip title="只查询原上游视频任务，不会重新提交、不会重复扣费（对应 L 的「继续查询」）">
                                            <Button size="small" icon={<LoaderCircle className="size-4" />} loading={busyShotId === shot.id} aria-label={`继续查询分镜 ${index + 1} 视频任务`} onClick={() => void resumeVideoPoll(shot)}>
                                                继续查询
                                            </Button>
                                        </Tooltip>
                                    ) : null}
                                    {shot.storyboardFrameMode === "first_last" && index > 0 && episode.shots[index - 1]?.videoUrl ? (
                                        <Tooltip title="取上一镜视频的真实尾帧作为本镜首帧（对应 L 的「上镜尾帧」）">
                                            <Button
                                                size="small"
                                                icon={<Link2 className="size-4" />}
                                                loading={busyShotId === shot.id}
                                                aria-label={`用上一镜尾帧作为分镜 ${index + 1} 首帧`}
                                                onClick={() => void applyPreviousTailAsFirst(shot, episode.shots[index - 1])}
                                            >
                                                上镜尾帧
                                            </Button>
                                        </Tooltip>
                                    ) : null}
                                    {shot.firstFrameCandidate ? (
                                        <Button size="small" icon={<Link2 className="size-4" />} loading={busyShotId === shot.id} aria-label={`应用分镜 ${index + 1} 候选首帧`} onClick={() => void acceptFirstFrame(shot)}>
                                            应用候选首帧
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-1">
                                <Tooltip title="编辑分镜">
                                    <Button size="small" type="text" icon={<Pencil className="size-4" />} aria-label={`编辑分镜 ${index + 1}`} onClick={() => openEditor(shot)} />
                                </Tooltip>
                                <Tooltip title={shot.storyboardFrameMode === "first_last" ? "查看并编辑首尾帧提示词" : "查看并编辑本镜图片 / 视频提示词"}>
                                    <Button size="small" type="text" icon={<FileText className="size-4" />} aria-label={`查看分镜 ${index + 1} 提示词`} onClick={() => openEditor(shot, shot.storyboardFrameMode === "first_last" ? "frames" : "prompts")} />
                                </Tooltip>
                                <Button size="small" onClick={() => openEditor(shot, "config")}>
                                    分镜配置
                                </Button>
                                <Button size="small" onClick={() => openEditor(shot, "bindings")}>
                                    关联资产
                                </Button>
                                <Button size="small" onClick={() => openEditor(shot, "records")}>
                                    历史记录
                                </Button>
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
                    initialTab={editingTab}
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
