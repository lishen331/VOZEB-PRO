"use client";

/* eslint-disable @next/next/no-img-element */
import { Download, Images, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

import type { MultiAngleRun, MultiAngleShot } from "./lib/angle-history";
import { shotLabel } from "./lib/angle-model";
import s from "./multi-angle.module.css";

export default function MultiAngleResults({
    shots,
    summary,
    historical,
    generating,
    onDownload,
    onDownloadAll,
}: {
    shots: MultiAngleShot[];
    summary: string;
    historical: boolean;
    generating: boolean;
    onDownload: (url: string, name: string) => void;
    onDownloadAll: () => void;
}) {
    return (
        <section className={s.results} aria-labelledby="ma-results-heading" aria-busy={generating}>
            <div className={s.resultsHead}>
                <div>
                    <h2 id="ma-results-heading">生成结果</h2>
                    {shots.length > 0 && (
                        <p>
                            {historical ? "历史结果" : generating ? "正在生成" : "本次结果"} · {summary}
                        </p>
                    )}
                </div>
                {shots.some((shot) => shot.url) && (
                    <button type="button" className={cn(s.btn, s.btnGhost)} onClick={onDownloadAll}>
                        <Download size={14} /> 全部下载
                    </button>
                )}
            </div>
            {shots.length ? (
                <div className={cn(s.film, shots.length === 1 && s.filmSingle)}>
                    {shots.map(({ name, url, status }, index) => (
                        <div key={`${name}-${index}`} className={s.shot}>
                            <span className={s.shotLabel}>{name}</span>
                            {url ? (
                                <>
                                    <img src={url} alt={name} />
                                    <button type="button" className={s.shotDownload} aria-label={`下载 ${name}`} onClick={() => onDownload(url, name)}>
                                        <Download size={14} />
                                    </button>
                                </>
                            ) : (
                                <div className={s.shotSpin}>
                                    {status === "running" && <i />}
                                    <span>{status === "failed" ? "生成失败" : status === "missing" ? "无提交记录" : status === "running" ? "正在生成" : "等待生成"}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className={s.resultsEmpty}>
                    <Images size={23} aria-hidden="true" />
                    <p>生成的图片将在这里显示</p>
                </div>
            )}
        </section>
    );
}

const historyDate = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" });

export function MultiAngleHistory({
    runs,
    selectedId,
    loading,
    error,
    hasMore,
    disabled,
    onRestore,
    onRefresh,
    onLoadMore,
}: {
    runs: MultiAngleRun[];
    selectedId: string | null;
    loading: boolean;
    error: boolean;
    hasMore: boolean;
    disabled: boolean;
    onRestore: (run: MultiAngleRun) => void;
    onRefresh: () => void;
    onLoadMore: () => void;
}) {
    return (
        <section className={s.history} aria-labelledby="ma-history-heading" aria-busy={loading}>
            <div className={s.resultsHead}>
                <h2 id="ma-history-heading">历史记录</h2>
                <button type="button" className={cn(s.btn, s.btnGhost)} disabled={loading} onClick={onRefresh}>
                    <RefreshCw size={14} /> 刷新历史
                </button>
            </div>
            {runs.length > 0 && (
                <div className={s.historyGrid}>
                    {runs.map((run) => {
                        const { batch, mode, fisheye, d } = run.snapshot;
                        const thumbs = run.shots.flatMap((shot) => (shot.url ? [shot.url] : []));
                        return (
                            <button key={run.id} type="button" className={s.histItem} disabled={disabled} aria-pressed={selectedId === run.id} onClick={() => onRestore(run)}>
                                <div className={s.histThumbs}>
                                    {(thumbs.length ? thumbs : [run.source.url]).slice(0, 4).map((thumb, index) => (
                                        <img key={index} src={thumb} alt="" loading="lazy" />
                                    ))}
                                </div>
                                <b>多角度练习 · {batch} 张</b>
                                <small>
                                    {mode === "camera" ? "摄像头视角" : "主体视角"} · {fisheye ? "鱼眼" : shotLabel(d)} · {thumbs.length}/{batch} 张已生成
                                </small>
                                <small>{historyDate.format(new Date(run.createdAt))} · 恢复机位与参数</small>
                            </button>
                        );
                    })}
                </div>
            )}
            {loading ? (
                <p className={s.historyStatus} role="status">
                    正在加载历史记录…
                </p>
            ) : error ? (
                <p className={s.historyStatus} role="alert">
                    历史记录加载失败，请刷新重试
                </p>
            ) : !runs.length ? (
                <p className={s.historyStatus}>暂无生成记录</p>
            ) : null}
            {hasMore && (
                <button type="button" className={cn(s.btn, s.btnGhost, s.historyMore)} disabled={loading} onClick={onLoadMore}>
                    查看更多
                </button>
            )}
        </section>
    );
}
