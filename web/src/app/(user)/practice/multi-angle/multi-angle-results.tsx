"use client";

/* 缩略图都是 canvas 产出的 data URL，next/image 的优化链路对它们没有意义，直接用 img。 */
/* eslint-disable @next/next/no-img-element */

import type { MutableRefObject } from "react";
import { Download } from "lucide-react";

import { cn } from "@/lib/utils";

import s from "./multi-angle.module.css";

export interface MultiAngleShot {
    name: string;
    url: string | null;
}

export interface MultiAngleRun {
    id: number;
    name: string;
    sub: string;
    thumbs: string[];
}

interface MultiAngleResultsProps {
    shots: MultiAngleShot[];
    summary: string;
    runs: MultiAngleRun[];
    resultsRef: MutableRefObject<HTMLElement | null>;
    onDownload: (url: string, name: string) => void;
    onDownloadAll: () => void;
}

/**
 * 结果胶片条 + 练习记录。
 * P0 的图是本地 canvas 演示渲染，所以按钮是「下载」而不是「保存到素材库」——
 * 不写会话、不占存储，避免让人以为已经进了资产库。
 */
export default function MultiAngleResults({ shots, summary, runs, resultsRef, onDownload, onDownloadAll }: MultiAngleResultsProps) {
    const readyCount = shots.filter((shot) => shot.url).length;

    return (
        <>
            {shots.length ? (
                <section ref={resultsRef} className={s.results}>
                    <div className={s.resultsHead}>
                        <div>
                            <h2>本次生成</h2>
                            <p>{summary}</p>
                        </div>
                        <button type="button" className={cn(s.btn, s.btnGhost)} disabled={!readyCount} onClick={onDownloadAll}>
                            <Download size={14} />
                            全部下载
                        </button>
                    </div>
                    <div className={s.film}>
                        {shots.map((shot, index) => (
                            <div key={`${shot.name}-${index}`} className={cn(s.shot, !shot.url && s.shotSkeleton)}>
                                <span className={s.shotLabel}>{shot.name}</span>
                                {shot.url ? (
                                    <>
                                        <img src={shot.url} alt={shot.name} />
                                        <button
                                            type="button"
                                            aria-label={`下载 ${shot.name}`}
                                            onClick={() => onDownload(shot.url as string, shot.name)}
                                            style={{
                                                position: "absolute",
                                                right: 8,
                                                top: 8,
                                                width: 26,
                                                height: 26,
                                                borderRadius: 999,
                                                display: "grid",
                                                placeItems: "center",
                                                color: "#fff",
                                                background: "rgba(5,10,25,.5)",
                                                border: "1px solid rgba(255,255,255,.2)",
                                                backdropFilter: "blur(8px)",
                                            }}
                                        >
                                            <Download size={12} />
                                        </button>
                                    </>
                                ) : (
                                    <div className={s.shotSpin}>
                                        <i />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {runs.length ? (
                <section className={s.history}>
                    <h2>练习记录</h2>
                    {runs.map((run) => (
                        <div key={run.id} className={s.histItem}>
                            <div className={s.histThumbs}>
                                {run.thumbs.map((thumb, index) => (
                                    <img key={index} src={thumb} alt="" />
                                ))}
                            </div>
                            <div>
                                <b>{run.name}</b>
                                <small>{run.sub}</small>
                            </div>
                        </div>
                    ))}
                </section>
            ) : null}
        </>
    );
}
