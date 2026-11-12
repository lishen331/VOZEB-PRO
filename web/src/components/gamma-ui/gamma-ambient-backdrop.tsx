"use client";

import { useEffect, useRef, useState } from "react";

import { usePublicSessionStore } from "@/stores/use-public-session-store";

const DEFAULT_VIDEO_URL = "/login/hero.mp4";
const DEFAULT_POSTER_URL = "/login/hero-poster.webp";

/** 减少动效、省流量时只放海报图 */
function prefersStillBackdrop() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    return reducedMotion || saveData;
}

/*
 * 平台背景：复用登录页的视频与海报（后台换登录视频这里同步换），模糊 + 品牌遮罩后只剩流动的色块。
 * 层叠从下到上：底色 → 海报 → 视频 → 遮罩 → 光晕；任一层加载失败都退回下一层，最差是纯色底。
 * 样式在 global-ambient.css，玻璃面板的半透明 token 挂在 .gm-ambient 作用域上。
 */
export function GammaAmbientBackdrop() {
    const sessionReady = usePublicSessionStore((state) => state.ready);
    const loginPage = usePublicSessionStore((state) => state.payload?.settings?.site?.loginPage);
    const videoUrl = loginPage?.heroVideoUrl || DEFAULT_VIDEO_URL;
    const posterUrl = loginPage?.heroPosterUrl || DEFAULT_POSTER_URL;
    const [motionEnabled, setMotionEnabled] = useState(false);
    const [videoReady, setVideoReady] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    // 海报立即显示；视频等会话拿到后台配置的地址、且浏览器空闲后再挂，不和首屏内容抢带宽与主线程
    useEffect(() => {
        if (!sessionReady) return;
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const sync = () => setMotionEnabled(!prefersStillBackdrop());
        let idleId: number | undefined;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        if (typeof window.requestIdleCallback === "function") idleId = window.requestIdleCallback(sync, { timeout: 2000 });
        else timeoutId = setTimeout(sync, 600);
        media.addEventListener("change", sync);
        return () => {
            if (idleId !== undefined) window.cancelIdleCallback(idleId);
            if (timeoutId !== undefined) clearTimeout(timeoutId);
            media.removeEventListener("change", sync);
        };
    }, [sessionReady]);

    // 标签页切到后台暂停，回来继续
    useEffect(() => {
        if (!motionEnabled) return;
        const onVisibility = () => {
            const video = videoRef.current;
            if (!video) return;
            if (document.hidden) video.pause();
            else void video.play().catch(() => undefined);
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [motionEnabled]);

    useEffect(() => setVideoReady(false), [videoUrl]);

    return (
        <div aria-hidden className="gm-ambient-backdrop">
            <div className="gm-ambient-media">
                {/* eslint-disable-next-line @next/next/no-img-element -- 纯装饰背景，不走 next/image 优化 */}
                <img src={posterUrl} alt="" decoding="async" onError={(event) => (event.currentTarget.style.display = "none")} />
                {motionEnabled ? (
                    <video key={videoUrl} ref={videoRef} className={videoReady ? "is-ready" : ""} muted autoPlay loop playsInline preload="auto" poster={posterUrl} onCanPlay={() => setVideoReady(true)} onError={() => setVideoReady(false)}>
                        <source src={videoUrl} type="video/mp4" />
                    </video>
                ) : null}
            </div>
            <div className="gm-ambient-scrim" />
            <div className="gm-ambient-aurora" />
        </div>
    );
}
