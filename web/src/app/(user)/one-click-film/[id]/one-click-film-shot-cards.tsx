"use client";

import { Button, Empty, Segmented, Tag, Tooltip, message } from "antd";
import { Aperture, ArrowUpToLine, Clapperboard, Film, ImageIcon, Link2, Maximize2, Pencil, Plus, Scissors, Trash2 } from "lucide-react";
import { useState } from "react";
import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";

import { OneClickFilmShotEditor } from "./one-click-film-shot-editor";

type Props = {
    projectId: string;
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
export function OneClickFilmShotCards({ projectId, episode, onProjectChange }: Props) {
    const [busyShotId, setBusyShotId] = useState<string>();
    const [editing, setEditing] = useState<DramaShot>();
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

            <ul className="mt-3 grid gap-3">
                {episode.shots.map((shot, index) => (
                    <li key={shot.id} className="rounded-lg border p-3" data-testid={`one-click-shot-card-${shot.id}`}>
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
