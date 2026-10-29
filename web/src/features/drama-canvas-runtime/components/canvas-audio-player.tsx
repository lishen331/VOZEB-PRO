"use client";

import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";

const BAR_COUNT = 48;

// Deterministic pseudo-waveform so a given clip always draws the same bars.
function barHeights(seed: string) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    return Array.from({ length: BAR_COUNT }, (_, index) => {
        hash = (hash * 1103515245 + 12345) >>> 0;
        const wave = 0.35 + 0.65 * Math.abs(Math.sin(index / 5 + (hash % 100) / 100));
        return Math.max(0.18, Math.min(1, wave * (0.55 + ((hash >>> 8) % 45) / 100)));
    });
}

function formatDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function CanvasAudioPlayer({ src, title, theme }: { src: string; title?: string; theme: CanvasTheme }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [current, setCurrent] = useState(0);
    const heights = barHeights(src);

    useEffect(() => {
        setPlaying(false);
        setCurrent(0);
        setDuration(0);
    }, [src]);

    const toggle = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) void audio.play();
        else audio.pause();
    };

    const seek = (ratio: number) => {
        const audio = audioRef.current;
        if (!audio || !audio.duration) return;
        audio.currentTime = ratio * audio.duration;
    };

    return (
        <div className="flex h-full w-full flex-col justify-center gap-3 px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
            <audio
                ref={audioRef}
                src={src}
                preload="metadata"
                data-canvas-no-zoom
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
                onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
            />
            <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: theme.node.stroke, color: theme.node.text }}>
                    <Music2 className="size-4" aria-hidden />
                </span>
                <span className="truncate text-sm" data-canvas-no-zoom>
                    {title || "音频"}
                </span>
                <span className="ml-auto shrink-0 text-xs tabular-nums opacity-60" data-canvas-no-zoom>
                    {formatDuration(current || duration)}
                </span>
            </div>
            <div className="flex min-w-0 items-center gap-2" data-canvas-no-zoom>
                <button
                    type="button"
                    data-canvas-no-drag
                    className="grid size-7 shrink-0 place-items-center rounded-full transition hover:opacity-80"
                    style={{ background: theme.node.activeStroke, color: theme.node.panel }}
                    onClick={(event) => {
                        event.stopPropagation();
                        toggle();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label={playing ? "暂停" : "播放"}
                >
                    {playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
                </button>
                <div
                    className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-[2px]"
                    role="slider"
                    aria-label="播放进度"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(current)}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        seek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
                    }}
                >
                    {heights.map((height, index) => {
                        const progress = duration ? current / duration : 0;
                        const active = index / BAR_COUNT <= progress;
                        return <span key={index} className="min-w-[1px] flex-1 rounded-full" style={{ height: `${height * 100}%`, background: active ? theme.node.activeStroke : theme.node.stroke }} />;
                    })}
                </div>
            </div>
        </div>
    );
}
