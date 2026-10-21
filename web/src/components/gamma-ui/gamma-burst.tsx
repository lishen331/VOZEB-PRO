"use client";

import { useCallback } from "react";
import { useReducedMotion } from "motion/react";

import "@/components/gamma-ui/gamma-effects.css";

/*
 * 点击特效：在点击位置生成粒子 / 冲击环，动画结束自动移除，不经过 React 渲染（不会触发重渲染）。
 * 用法：const burst = useGammaBurst(); <button onClick={(e) => burst(e, "confetti")} className="relative" />
 */

export type GammaBurstKind = "sparkle" | "confetti" | "hearts" | "shock";

const COLORS = ["#28ebfa", "#0050f5", "#7c5cff", "#1a9dff", "#ffffff"];
const PARTICLE_COUNT: Record<GammaBurstKind, number> = { sparkle: 10, confetti: 18, hearts: 7, shock: 0 };
const HEART_PATH = "M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.2 5 6.6 5c2 0 3.5 1.1 4.4 2.5C11.9 6.1 13.4 5 15.4 5c3.4 0 5.4 3.6 4.1 6.8C19.5 16.4 12 21 12 21z";

/** 用 DOM API 建粒子节点（不拼 innerHTML） */
function makeParticle(kind: GammaBurstKind, color: string) {
    const particle = document.createElement("span");
    particle.className = "gm-particle";
    if (kind === "hearts") {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "14");
        svg.setAttribute("height", "14");
        svg.setAttribute("fill", color);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", HEART_PATH);
        svg.appendChild(path);
        particle.appendChild(svg);
    } else if (kind === "confetti") {
        Object.assign(particle.style, { width: "6px", height: "10px", borderRadius: "2px", background: color });
    } else {
        Object.assign(particle.style, { width: "6px", height: "6px", borderRadius: "999px", background: color, boxShadow: `0 0 8px ${color}` });
    }
    return particle;
}

export function useGammaBurst() {
    const reduce = useReducedMotion();

    return useCallback(
        (event: { currentTarget: EventTarget; clientX: number; clientY: number }, kind: GammaBurstKind = "sparkle") => {
            if (reduce) return;
            const host = event.currentTarget as HTMLElement;
            const rect = host.getBoundingClientRect();
            // 键盘触发时 clientX/Y 为 0，改从中心炸开
            const x = event.clientX ? event.clientX - rect.left : rect.width / 2;
            const y = event.clientY ? event.clientY - rect.top : rect.height / 2;

            const ring = document.createElement("span");
            ring.className = "gm-shock";
            const ringSize = Math.max(rect.width, rect.height) * (kind === "shock" ? 2.4 : 1.4);
            Object.assign(ring.style, { left: `${x}px`, top: `${y}px`, width: `${ringSize}px`, height: `${ringSize}px` });
            host.appendChild(ring);
            window.setTimeout(() => ring.remove(), 650);

            for (let i = 0; i < PARTICLE_COUNT[kind]; i += 1) {
                const angle = (Math.PI * 2 * i) / PARTICLE_COUNT[kind] + Math.random() * 0.6;
                const distance = (kind === "confetti" ? 46 : 34) + Math.random() * 26;
                const particle = makeParticle(kind, COLORS[i % COLORS.length]);
                Object.assign(particle.style, { left: `${x}px`, top: `${y}px` });
                particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
                particle.style.setProperty("--dy", `${Math.sin(angle) * distance - (kind === "hearts" ? 20 : 0)}px`);
                particle.style.setProperty("--rot", `${(Math.random() - 0.5) * 540}deg`);
                particle.style.setProperty("--life", `${600 + Math.random() * 300}ms`);
                host.appendChild(particle);
                window.setTimeout(() => particle.remove(), 1000);
            }
        },
        [reduce],
    );
}
