"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";

export type VoicePreview = ReturnType<typeof useVoicePreview>;

/** 同一时间只播一条试听：点新的会停掉旧的，再点同一条是暂停。 */
export function useVoicePreview() {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState<string>();
    const [failed, setFailed] = useState<string>();

    useEffect(() => {
        const ref = audioRef;
        return () => ref.current?.pause();
    }, []);

    const toggle = useCallback(
        (url: string) => {
            audioRef.current?.pause();
            if (playing === url) {
                audioRef.current = null;
                setPlaying(undefined);
                return;
            }
            const audio = new Audio(url);
            audioRef.current = audio;
            const stop = (error: boolean) => {
                if (audioRef.current !== audio) return;
                audioRef.current = null;
                setPlaying(undefined);
                if (error) setFailed(url);
            };
            audio.onended = () => stop(false);
            audio.onerror = () => stop(true);
            setFailed(undefined);
            setPlaying(url);
            audio.play().catch(() => stop(true));
        },
        [playing],
    );

    return { playing, failed, toggle };
}

/** 播放/停止同一个 URL：正在播时显示停止，播完自动复原。 */
export function VoicePreviewButton({ url, preview, theme }: { url: string; preview: VoicePreview; theme: CanvasTheme }) {
    const playing = preview.playing === url;
    const failed = preview.failed === url;
    return (
        <button
            type="button"
            aria-label={playing ? "停止试听" : "试听"}
            title={failed ? "试听加载失败，点击重试" : playing ? "停止试听" : "试听"}
            className={`grid size-6 shrink-0 place-items-center rounded-full hover:opacity-75 ${failed ? "text-red-500" : ""}`}
            style={failed ? undefined : { color: playing ? theme.node.text : theme.node.muted }}
            onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
            onClick={(event) => {
                event.stopPropagation();
                preview.toggle(url);
            }}
        >
            {playing ? <Square className="size-3" fill="currentColor" /> : <Play className="size-3.5" />}
        </button>
    );
}
