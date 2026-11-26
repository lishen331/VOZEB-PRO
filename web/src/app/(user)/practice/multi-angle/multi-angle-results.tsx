"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Images, RefreshCw } from "lucide-react";

import { App } from "@/components/gamma-ui/gamma-ant-app";
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
    const { message } = App.useApp();
    const [index, setIndex] = useState(0);
    const [direction, setDirection] = useState(1);
    const shot = shots[index];
    const url = shot?.url;
    const fullPrompt = shot?.prompt.full;
    const multiple = shots.length > 1;
    const select = (next: number, travel = Math.sign(next - index)) => {
        if (next === index) return;
        setDirection(travel);
        setIndex(next);
    };
    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            message.success("已复制提示词");
        } catch {
            message.error("复制失败，请展开完整提示词后手动复制");
        }
    };

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
            {shot ? (
                <>
                    <div className={cn(s.deck, multiple && s.deckStack)} role="group" aria-label="结果卡片">
                        <div key={index} className={cn(s.shot, direction < 0 ? s.cardFromLeft : s.cardFromRight)}>
                            <span className={s.shotCounter}>
                                {String(index + 1).padStart(2, "0")} / {String(shots.length).padStart(2, "0")}
                            </span>
                            <span className={s.shotLabel} aria-live="polite">
                                {shot.name}
                            </span>
                            {url ? (
                                <>
                                    <img src={url} alt={shot.name} />
                                    <button type="button" className={s.shotDownload} aria-label={`下载 ${shot.name}`} onClick={() => onDownload(url, shot.name)}>
                                        <Download size={14} />
                                    </button>
                                </>
                            ) : (
                                <div className={s.shotSpin}>
                                    {shot.status === "running" && <i />}
                                    <span>{shot.status === "failed" ? "生成失败" : shot.status === "missing" ? "无提交记录" : shot.status === "running" ? "正在生成" : "等待生成"}</span>
                                </div>
                            )}
                        </div>
                        {multiple && (
                            <>
                                <button type="button" className={cn(s.cardArrow, s.cardPrev)} aria-label="上一张" onClick={() => select((index + shots.length - 1) % shots.length, -1)}>
                                    <ChevronLeft size={22} />
                                </button>
                                <button type="button" className={cn(s.cardArrow, s.cardNext)} aria-label="下一张" onClick={() => select((index + 1) % shots.length, 1)}>
                                    <ChevronRight size={22} />
                                </button>
                            </>
                        )}
                    </div>
                    {multiple && (
                        <div className={s.cardChoices} role="group" aria-label="选择机位">
                            {shots.map(({ name }, i) => (
                                <button type="button" key={i} aria-pressed={index === i} onClick={() => select(i)}>
                                    {name}
                                </button>
                            ))}
                        </div>
                    )}
                    <section className={s.promptCard} aria-labelledby="ma-result-prompt">
                        <div className={s.resultsHead}>
                            <h3 id="ma-result-prompt">结构化提示词</h3>
                            {fullPrompt && (
                                <button type="button" className={cn(s.btn, s.btnGhost)} onClick={() => void copy(fullPrompt)}>
                                    复制完整提示词
                                </button>
                            )}
                        </div>
                        <dl>
                            <div>
                                <dt>水平机位</dt>
                                <dd>{shot.prompt.horizontal}</dd>
                            </div>
                            <div>
                                <dt>垂直机位</dt>
                                <dd>{shot.prompt.vertical}</dd>
                            </div>
                            <div>
                                <dt>景别</dt>
                                <dd>{shot.prompt.distance}</dd>
                            </div>
                        </dl>
                        <p>镜头：{shot.prompt.lens}</p>
                        <p>补充描述：{shot.prompt.description || "无"}</p>
                        {shot.prompt.full ? (
                            <details>
                                <summary>查看完整提示词</summary>
                                <p>{shot.prompt.full}</p>
                            </details>
                        ) : (
                            <p>没有保存该机位的完整提交提示词。</p>
                        )}
                    </section>
                </>
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
