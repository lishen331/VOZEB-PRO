"use client";

import { Modal } from "antd";
import { Check, Download, Heart, Maximize2, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { VzProgress } from "./feedback";
import type { VzStatus } from "./primitives";
import { VzButton, VzCard, VzIconButton, VzModelTag, VzStatusBadge, VzTag } from "./primitives";

type PreviewContainer = { getContainer?: () => HTMLElement };

function useMediaActions(src: string | undefined, title: string, getContainer?: () => HTMLElement) {
    const [open, setOpen] = useState(false);
    const [feedback, setFeedback] = useState("");
    const scope = useRef<HTMLElement | null>(null);
    const preview = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        scope.current = event.currentTarget?.closest<HTMLElement>(".vz-ds") ?? null;
        if (src) setOpen(true);
    };
    const download = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!src) return;
        const link = document.createElement("a");
        link.href = src;
        link.download = `${title.replace(/[\\/:*?"<>|]/g, "-")}.${src.split(/[?#]/)[0].split(".").pop() || "png"}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setFeedback("下载已开始");
    };
    return {
        preview,
        download,
        feedback,
        modal: (
            <Modal title={title} open={open} onCancel={() => setOpen(false)} footer={null} width={960} getContainer={getContainer ?? (() => scope.current ?? document.querySelector<HTMLElement>(".vz-ds")!)} destroyOnHidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {src ? <img src={src} alt={title} style={{ display: "block", width: "100%", maxHeight: "70dvh", objectFit: "contain", borderRadius: 12 }} /> : null}
            </Modal>
        ),
    };
}

type MediaCardProps = PreviewContainer & { src: string; title: string; meta: string; ratio?: string; selected?: boolean; onSelect?: () => void; tag?: string };

export function VzMediaCard({ src, title, meta, ratio = "4 / 3", selected, onSelect, tag, getContainer }: MediaCardProps) {
    const [favorite, setFavorite] = useState(false);
    const actions = useMediaActions(src, title, getContainer);
    return (
        <VzCard
            interactive={Boolean(onSelect)}
            selected={selected}
            role={onSelect ? "button" : undefined}
            aria-label={onSelect ? `选择作品：${title}` : undefined}
            aria-pressed={onSelect ? Boolean(selected) : undefined}
            aria-selected={undefined}
            onClick={
                onSelect
                    ? (event) => {
                          if (event.currentTarget.contains(event.target as Node)) onSelect();
                      }
                    : undefined
            }
            onKeyDown={(event) => {
                if (event.target !== event.currentTarget || !onSelect || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault();
                onSelect();
            }}
            className="vz-media-card"
            style={{ padding: 10 }}
        >
            <div className="vz-media" style={{ "--ratio": ratio } as React.CSSProperties}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={title} loading="lazy" />
                {tag ? (
                    <div className="vz-media__corner">
                        <VzTag tone="brand">{tag}</VzTag>
                    </div>
                ) : null}
                {selected ? (
                    <span className="vz-media__check" aria-hidden>
                        <Check />
                    </span>
                ) : null}
                <div className="vz-media__overlay">
                    <span />
                    <span className="vz-row" style={{ gap: 6 }}>
                        <VzIconButton size="sm" icon={Maximize2} label="放大预览" onClick={actions.preview} />
                        <VzIconButton
                            size="sm"
                            icon={Heart}
                            label={favorite ? "取消收藏" : "收藏"}
                            aria-pressed={favorite}
                            selected={favorite}
                            onClick={(event) => {
                                event.stopPropagation();
                                setFavorite((value) => !value);
                            }}
                        />
                        <VzIconButton size="sm" icon={Download} label="下载" onClick={actions.download} />
                    </span>
                </div>
            </div>
            <div style={{ padding: "10px 4px 2px", display: "grid", gap: 2, minWidth: 0 }}>
                <span className="vz-h3" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {title}
                </span>
                <span className="vz-caption">{meta}</span>
                <span className="vz-caption vz-media-note" role="status">
                    {actions.feedback || (favorite ? "已收藏 · 仅当前预览" : "")}
                </span>
            </div>
            {actions.modal}
        </VzCard>
    );
}

type ResultCardProps = PreviewContainer & { status: VzStatus; src?: string; prompt: string; model: { name: string; vendor: string }; progress?: number; error?: string; onRetry?: () => void };

export function VzResultCard({ status, src, prompt, model, progress = 0, error, onRetry, getContainer }: ResultCardProps) {
    const actions = useMediaActions(src, "生成结果预览", getContainer);
    return (
        <VzCard style={{ padding: 12, display: "grid", gap: 12 }}>
            <div className="vz-media" style={{ "--ratio": "16 / 10" } as React.CSSProperties}>
                {status === "success" && src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={prompt} />
                ) : status === "failed" ? (
                    <div className="vz-generating" style={{ background: "color-mix(in srgb, var(--vz-danger) 8%, var(--vz-surface-3))" }}>
                        <span className="vz-caption" style={{ color: "var(--vz-danger-text)" }}>
                            {error ?? "生成失败"}
                        </span>
                        <VzButton size="sm" variant="secondary" icon={RotateCcw} onClick={onRetry} disabled={!onRetry}>
                            重新生成
                        </VzButton>
                        {!onRetry ? <span className="vz-caption">状态样例 · 不会提交真实生成</span> : null}
                    </div>
                ) : status === "success" ? (
                    <div className="vz-generating">
                        <span className="vz-caption">暂无可预览图片</span>
                    </div>
                ) : (
                    <div className="vz-generating" data-running="true" aria-live="polite">
                        <Sparkles aria-hidden style={{ width: 22, height: 22, color: "var(--vz-brand-text)", position: "relative", zIndex: 1 }} />
                        <span className="vz-caption vz-num" style={{ position: "relative", zIndex: 1 }}>
                            {status === "queued" ? "排队中 · 前方 2 个任务" : `正在渲染细节 · ${Math.round(progress)}%`}
                        </span>
                        <div style={{ width: "min(200px, 70%)", position: "relative", zIndex: 1 }}>
                            <VzProgress label="生成进度" value={progress} indeterminate={status === "queued"} />
                        </div>
                    </div>
                )}
                {status === "success" && src ? (
                    <div className="vz-media__overlay" style={{ opacity: 1, transform: "none" }}>
                        <span />
                        <span className="vz-row" style={{ gap: 6 }}>
                            <VzIconButton size="sm" icon={Maximize2} label="放大预览" onClick={actions.preview} />
                            <VzIconButton size="sm" icon={Download} label="下载原图" onClick={actions.download} />
                        </span>
                    </div>
                ) : null}
            </div>
            <div className="vz-row" style={{ justifyContent: "space-between" }}>
                <VzModelTag {...model} />
                <VzStatusBadge status={status} />
            </div>
            <p className="vz-body" style={{ fontSize: 13, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
                {prompt}
            </p>
            {actions.feedback ? (
                <span className="vz-caption" role="status">
                    {actions.feedback}
                </span>
            ) : null}
            {actions.modal}
        </VzCard>
    );
}

export function VzVideoPreview({ src, poster, title }: { src: string; poster?: string; title: string }) {
    return (
        <VzCard style={{ padding: 10 }}>
            <div className="vz-media" style={{ "--ratio": "16 / 9" } as React.CSSProperties}>
                <video src={src} poster={poster} controls playsInline preload="metadata" aria-label={title} />
            </div>
            <div className="vz-row" style={{ justifyContent: "space-between", padding: "10px 4px 2px" }}>
                <span className="vz-h3" style={{ fontSize: 14 }}>
                    {title}
                </span>
                <VzTag className="vz-num">00:08 · 1080p</VzTag>
            </div>
        </VzCard>
    );
}

/** Local mono PCM fixture. No network request, recorded voice, or business API. */
export function createLocalAudioFixture(duration = 8) {
    const sampleRate = 16000;
    const length = Math.floor(sampleRate * (Number.isFinite(duration) && duration > 0 ? duration : 8));
    const bytes = new ArrayBuffer(44 + length * 2);
    const view = new DataView(bytes);
    const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, 36 + length * 2, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, length * 2, true);
    const notes = [261.63, 329.63, 392, 523.25];
    for (let i = 0; i < length; i++) {
        const time = i / sampleRate;
        const envelope = Math.sin((Math.PI * (time % 2)) / 2) * Math.min(1, (length - i) / sampleRate);
        const sample = Math.sin(time * Math.PI * 2 * notes[Math.floor(time / 2) % notes.length]) * envelope * 0.14;
        view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
    }
    return new Blob([bytes], { type: "audio/wav" });
}

export function VzAudioPreview({ title, duration = 8, src }: { title: string; duration?: number; src?: string }) {
    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [total, setTotal] = useState(duration);
    const [localSrc, setLocalSrc] = useState("");
    const [error, setError] = useState("");
    const audio = useRef<HTMLAudioElement>(null);
    const bars = useMemo(() => Array.from({ length: 56 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21)) * 0.75), []);

    useEffect(() => {
        if (src) return;
        const url = URL.createObjectURL(createLocalAudioFixture(duration));
        setLocalSrc(url);
        return () => URL.revokeObjectURL(url);
    }, [src, duration]);

    const togglePlayback = async () => {
        if (!audio.current) return;
        setError("");
        if (!audio.current.paused) {
            audio.current.pause();
            return;
        }
        if (audio.current.ended) audio.current.currentTime = 0;
        try {
            await audio.current.play();
        } catch {
            setPlaying(false);
            setError("音频播放失败，请再次点击播放");
        }
    };

    const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const ratio = total > 0 ? time / total : 0;

    return (
        <VzCard style={{ display: "grid", gap: 12 }}>
            <div className="vz-row" style={{ justifyContent: "space-between" }}>
                <span className="vz-h3" style={{ fontSize: 14 }}>
                    {title}
                </span>
                <VzTag tone="accent">{src ? "音频" : "本地合成样音"}</VzTag>
            </div>
            <audio
                ref={audio}
                src={src || localSrc || undefined}
                preload="metadata"
                aria-label={title}
                onLoadedMetadata={(event) => {
                    if (Number.isFinite(event.currentTarget.duration)) setTotal(event.currentTarget.duration);
                }}
                onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onError={() => {
                    setPlaying(false);
                    setError("音频加载失败，请检查媒体文件");
                }}
            />
            <div className="vz-audio">
                <VzIconButton variant="primary" className="vz-audio__play" icon={playing ? Pause : Play} label={playing ? "暂停" : "播放"} disabled={!src && !localSrc} onClick={togglePlayback} />
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <div className="vz-wave" aria-hidden>
                        {bars.map((h, i) => (
                            <i key={i} data-on={i / bars.length <= ratio || undefined} style={{ height: `${Math.round(h * 100)}%` }} />
                        ))}
                    </div>
                    <input
                        className="vz-audio__seek"
                        type="range"
                        min={0}
                        max={total || duration}
                        step={0.1}
                        value={time}
                        aria-label="播放进度"
                        aria-valuetext={`${fmt(time)} / ${fmt(total)}`}
                        disabled={!src && !localSrc}
                        onChange={(event) => {
                            if (audio.current) {
                                audio.current.currentTime = Number(event.target.value);
                                setTime(audio.current.currentTime);
                            }
                        }}
                    />
                    <div className="vz-row vz-caption vz-num" style={{ justifyContent: "space-between" }}>
                        <span>{fmt(time)}</span>
                        <span>{fmt(total)}</span>
                    </div>
                </div>
            </div>
            {error ? (
                <span className="vz-caption" style={{ color: "var(--vz-danger)" }} role="alert">
                    {error}
                </span>
            ) : (
                <span className="vz-caption">{src ? (playing ? "正在播放" : "可播放音频") : `${Math.round(total)} 秒轻音乐 · 浏览器本地合成，无接口调用`}</span>
            )}
        </VzCard>
    );
}
