"use client";

import { Check, Download, Heart, Maximize2, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { LabProgress } from "./feedback";
import type { LabStatus } from "./primitives";
import { LabButton, LabCard, LabIconButton, LabModelTag, LabStatusBadge, LabTag } from "./primitives";

const ratioStyle = (ratio: string) => ({ "--ratio": ratio }) as CSSProperties;

export function LabMediaCard({ src, title, meta, ratio = "4 / 3", selected, onSelect, tag }: { src: string; title: string; meta: string; ratio?: string; selected?: boolean; onSelect?: () => void; tag?: string }) {
    return (
        <LabCard
            interactive
            selected={selected}
            role="checkbox"
            aria-checked={Boolean(selected)}
            aria-label={title}
            onClick={onSelect}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect?.();
                }
            }}
            style={{ padding: 10 }}
        >
            <div className="vzl-media" style={ratioStyle(ratio)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading="lazy" />
                {tag ? (
                    <div className="vzl-media__corner">
                        <LabTag>{tag}</LabTag>
                    </div>
                ) : null}
                {selected ? (
                    <span className="vzl-media__check" aria-hidden>
                        <Check />
                    </span>
                ) : null}
                <div className="vzl-media__bar">
                    <LabIconButton size="sm" icon={Heart} label="收藏" className="vzl-on-media" onClick={(event) => event.stopPropagation()} />
                    <LabIconButton size="sm" icon={Download} label="下载" className="vzl-on-media" onClick={(event) => event.stopPropagation()} />
                </div>
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0, padding: "10px 4px 2px" }}>
                <span className="vzl-ellipsis" style={{ fontSize: 14, fontWeight: 600 }}>
                    {title}
                </span>
                <span className="vzl-caption vzl-ellipsis">{meta}</span>
            </div>
        </LabCard>
    );
}

export function LabResultCard({ status, src, prompt, model, progress = 0, error, onRetry }: { status: LabStatus; src?: string; prompt: string; model: { name: string; vendor: string }; progress?: number; error?: string; onRetry?: () => void }) {
    return (
        <LabCard style={{ display: "grid", gap: 12, padding: 12 }}>
            <div className="vzl-media" style={ratioStyle("16 / 10")}>
                {status === "success" && src ? (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={prompt} />
                        <div className="vzl-media__bar" data-pinned="true">
                            <LabIconButton size="sm" icon={Maximize2} label="放大预览" className="vzl-on-media" />
                            <LabIconButton size="sm" icon={Download} label="下载原图" className="vzl-on-media" />
                        </div>
                    </>
                ) : status === "failed" ? (
                    <div className="vzl-generating" data-tone="danger">
                        <span className="vzl-caption" style={{ color: "var(--vzl-danger)" }}>
                            {error ?? "生成失败"}
                        </span>
                        <LabButton size="sm" icon={RotateCcw} onClick={onRetry}>
                            重新生成
                        </LabButton>
                    </div>
                ) : (
                    <div className="vzl-generating">
                        <Sparkles aria-hidden style={{ width: 22, height: 22, color: "var(--vzl-brand-text)" }} />
                        <span className="vzl-caption vzl-num">{status === "queued" ? "排队中 · 前方 2 个任务" : `正在渲染细节 · ${Math.round(progress)}%`}</span>
                        <div style={{ width: "min(200px, 70%)" }}>
                            <LabProgress label="生成进度" value={progress} indeterminate={status === "queued"} />
                        </div>
                    </div>
                )}
            </div>
            <div className="vzl-row vzl-between">
                <LabModelTag {...model} />
                <LabStatusBadge status={status} />
            </div>
            <p className="vzl-body vzl-clamp-2" style={{ margin: 0, fontSize: 13 }}>
                {prompt}
            </p>
        </LabCard>
    );
}

export function LabVideoPreview({ src, poster, title }: { src: string; poster?: string; title: string }) {
    return (
        <LabCard style={{ padding: 10 }}>
            <div className="vzl-media" style={ratioStyle("16 / 9")}>
                <video src={src} poster={poster} controls playsInline muted preload="metadata" aria-label={title} />
            </div>
            <div className="vzl-row vzl-between" style={{ padding: "10px 4px 2px" }}>
                <span className="vzl-ellipsis" style={{ fontSize: 14, fontWeight: 600 }}>
                    {title}
                </span>
                <LabTag className="vzl-num">1080p</LabTag>
            </div>
        </LabCard>
    );
}

// Deterministic integer bar heights keep server and client markup identical.
const BARS = Array.from({ length: 56 }, (_, i) => 25 + Math.round(Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21)) * 75));

/** Simulated audio player: no real file, demonstrates play/seek states only. */
export function LabAudioPreview({ title, duration = 32 }: { title: string; duration?: number }) {
    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(9);

    useEffect(() => {
        if (!playing) return;
        const id = window.setInterval(() => setTime((t) => (t >= duration ? 0 : t + 0.25)), 250);
        return () => window.clearInterval(id);
    }, [playing, duration]);

    const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

    return (
        <LabCard style={{ display: "grid", gap: 12 }}>
            <div className="vzl-row vzl-between">
                <span className="vzl-ellipsis" style={{ fontSize: 14, fontWeight: 600 }}>
                    {title}
                </span>
                <LabTag tone="accent">配音 · 女声</LabTag>
            </div>
            <div className="vzl-audio">
                <LabButton variant="primary" className="vzl-btn--icon" style={{ width: 44, height: 44, borderRadius: "50%" }} icon={playing ? Pause : Play} aria-label={playing ? "暂停" : "播放"} onClick={() => setPlaying((p) => !p)} />
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <div
                        className="vzl-wave"
                        role="slider"
                        tabIndex={0}
                        aria-label="播放进度"
                        aria-valuemin={0}
                        aria-valuemax={duration}
                        aria-valuenow={Math.round(time)}
                        aria-valuetext={fmt(time)}
                        onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            setTime(((event.clientX - rect.left) / rect.width) * duration);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowRight") setTime((t) => Math.min(duration, t + 2));
                            if (event.key === "ArrowLeft") setTime((t) => Math.max(0, t - 2));
                        }}
                    >
                        {BARS.map((h, i) => (
                            <i key={i} data-on={i / BARS.length <= time / duration || undefined} style={{ height: `${h}%` }} />
                        ))}
                    </div>
                    <div className="vzl-row vzl-between vzl-caption vzl-num">
                        <span>{fmt(time)}</span>
                        <span>{fmt(duration)}</span>
                    </div>
                </div>
            </div>
        </LabCard>
    );
}
