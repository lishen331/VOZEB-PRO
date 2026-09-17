"use client";

import { Button, Empty, Tag, Tooltip, message } from "antd";
import { ArrowUpToLine, Pencil, Plus, Scissors, Trash2 } from "lucide-react";
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
                <Button size="small" icon={<Plus className="size-4" />} loading={busyShotId === "__collection__"} onClick={() => void createShot()} aria-label="新增分镜">
                    新增分镜
                </Button>
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
