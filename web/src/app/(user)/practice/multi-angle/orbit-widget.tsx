"use client";

import type { PointerEvent, RefObject } from "react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { ORBIT_LATITUDES, ORBIT_LONGITUDES, latitudePath, longitudePath, orbitCamera, paintCapture, type AngleMode } from "./lib/angle-model";
import s from "./multi-angle.module.css";

interface OrbitWidgetProps {
    mode: AngleMode;
    h: number;
    p: number;
    d: number;
    fisheye: boolean;
    image: string | null;
    imageEl: HTMLImageElement | null;
    thumb: { width: number; height: number };
    widgetRef: RefObject<HTMLDivElement | null>;
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
}

/**
 * 左下角环形球控件：球体经纬线随镜头一起转，镜头位置带一个圆形取景屏，
 * 中央缩略卡固定不动、只做等比缩小。
 *
 * 网格路径不交给 React 渲染——每次 h/p 变化只改 setAttribute("d")，
 * 避免 60fps 拖拽时重建整棵 SVG 节点树（Demo 同款写法）。
 */
export default function OrbitWidget({ mode, h, p, d, fisheye, image, imageEl, thumb, widgetRef, onPointerDown, onPointerMove, onPointerUp }: OrbitWidgetProps) {
    const latitudeRefs = useRef<Array<SVGPathElement | null>>([]);
    const longitudeRefs = useRef<Array<SVGPathElement | null>>([]);
    const tetherRef = useRef<SVGLineElement | null>(null);
    const cameraRef = useRef<SVGGElement | null>(null);
    const lensCanvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const hRad = (h * Math.PI) / 180;
        // 俯仰为正（仰拍）时球体上仰，与 Demo 一致
        const pRad = (-p * Math.PI) / 180;
        ORBIT_LATITUDES.forEach((lat, index) => {
            latitudeRefs.current[index]?.setAttribute("d", latitudePath(lat, hRad, pRad));
        });
        ORBIT_LONGITUDES.forEach((lon, index) => {
            longitudeRefs.current[index]?.setAttribute("d", longitudePath(lon, hRad, pRad));
        });

        const camera = orbitCamera(h, p);
        tetherRef.current?.setAttribute("x2", camera.sx.toFixed(1));
        tetherRef.current?.setAttribute("y2", camera.sy.toFixed(1));
        tetherRef.current?.setAttribute("opacity", String(camera.opacity));
        cameraRef.current?.setAttribute("transform", `translate(${camera.sx.toFixed(1)}, ${camera.sy.toFixed(1)}) scale(${camera.scale.toFixed(3)})`);
        cameraRef.current?.setAttribute("opacity", String(camera.opacity));
    }, [h, p]);

    useEffect(() => {
        const canvas = lensCanvasRef.current;
        if (!canvas) return;
        if (!imageEl) {
            canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        paintCapture(canvas, imageEl, { h, p, d, fisheye, aspect: 1 });
    }, [imageEl, h, p, d, fisheye]);

    return (
        <div
            ref={widgetRef}
            className={s.orbitWidget}
            title="拖动镜头环绕采样"
            onPointerDown={(event) => {
                event.stopPropagation();
                onPointerDown(event);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            <svg className={s.sphereSvg} viewBox="0 0 178 178" aria-hidden="true">
                {ORBIT_LATITUDES.map((lat, index) => (
                    <path
                        key={`lat-${lat}`}
                        ref={(node) => {
                            latitudeRefs.current[index] = node;
                        }}
                        fill="none"
                        stroke={lat === 0 ? "var(--gm-blue)" : "var(--ma-wire-soft)"}
                        strokeOpacity={lat === 0 ? 0.3 : 1}
                        strokeWidth={1}
                        style={{ stroke: lat === 0 ? "var(--gm-blue)" : "var(--ma-wire-soft)" }}
                    />
                ))}
                {ORBIT_LONGITUDES.map((lon, index) => (
                    <path
                        key={`lon-${lon}`}
                        ref={(node) => {
                            longitudeRefs.current[index] = node;
                        }}
                        fill="none"
                        strokeWidth={1}
                        style={{ stroke: "var(--ma-wire-soft)" }}
                    />
                ))}
                <line ref={tetherRef} x1={89} y1={89} x2={89} y2={89} strokeWidth={1.2} strokeDasharray="2.5 3" style={{ stroke: "var(--gm-blue)" }} />
                <g ref={cameraRef}>
                    <rect x={-19} y={-13} width={28} height={26} rx={6.5} fill="#0b1530" />
                    <rect x={-19} y={-13} width={28} height={26} rx={6.5} fill="url(#maCamShine)" opacity={0.25} />
                    <rect x={-11} y={-16.5} width={10} height={4.5} rx={2} fill="#0b1530" />
                    <circle cx={-5} cy={0} r={10.5} fill="#0a1122" stroke="#2a3a5e" strokeWidth={1.6} />
                    <circle cx={-5} cy={0} r={8.4} fill="url(#maLensGrad)" opacity={0.95} />
                    <rect x={9} y={-6.5} width={5.5} height={13} rx={2.4} fill="#0b1530" />
                    <circle cx={11.7} cy={-16} r={2} fill="#ff4d6d" />
                    <foreignObject x={-12} y={-7} width={14} height={14}>
                        <canvas ref={lensCanvasRef} width={80} height={80} style={{ width: 14, height: 14, display: "block", borderRadius: "50%" }} />
                    </foreignObject>
                    {/* 取景器描边：一圈青色细环，标明这是镜头取景 */}
                    <circle cx={-5} cy={0} r={7.3} fill="none" stroke="#28ebfa" strokeWidth={1.2} opacity={0.7} />
                </g>
                <defs>
                    <linearGradient id="maCamShine" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#fff" />
                        <stop offset="0.5" stopColor="#fff" stopOpacity={0} />
                        <stop offset="1" stopColor="#000" />
                    </linearGradient>
                    <radialGradient id="maLensGrad" cx="0.38" cy="0.34" r="0.8">
                        <stop offset="0" stopColor="#9ff7ff" stopOpacity={0.9} />
                        <stop offset="0.45" stopColor="#28ebfa" stopOpacity={0.5} />
                        <stop offset="1" stopColor="#0050f5" stopOpacity={0.9} />
                    </radialGradient>
                </defs>
            </svg>
            <div
                className={s.centerThumb}
                style={{
                    width: thumb.width,
                    height: thumb.height,
                    backgroundImage: image ? `url(${image})` : undefined,
                }}
            />
            <span className={cn(s.edgeArrow, s.eaTop)}>▲</span>
            <span className={cn(s.edgeArrow, s.eaBottom)}>▼</span>
            <span className={cn(s.edgeArrow, s.eaLeft)}>◀</span>
            <span className={cn(s.edgeArrow, s.eaRight)}>▶</span>
            <span className={s.camBadge}>{mode === "camera" ? "CAMERA" : "SUBJECT"}</span>
            <span className={s.camLabel}>{mode === "camera" ? "拖动镜头" : "拖动旋转"}</span>
        </div>
    );
}
