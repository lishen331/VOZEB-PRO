"use client";

import type { PointerEvent, ReactNode, RefObject } from "react";

import { cn } from "@/lib/utils";

import { shotLabel, shotZoom, type AngleMode } from "./lib/angle-model";
import s from "./multi-angle.module.css";

interface MultiAngleStageProps {
    mode: AngleMode;
    h: number;
    p: number;
    d: number;
    fisheye: boolean;
    image: string | null;
    dragging: boolean;
    viewportRef: RefObject<HTMLDivElement | null>;
    captureCanvasRef: RefObject<HTMLCanvasElement | null>;
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    /** 左下角环控由 workbench 传进来，和舞台共用同一组拖拽回调 */
    children?: ReactNode;
}

/**
 * 主舞台：
 *   - 外层 zoom-wrap 只做等比 scale（景别），内层只做 3D 旋转，两者互不拉扯；
 *   - 摄像头模式下是一张随镜头转的卡片，主体模式下换成立方盒；
 *   - 右上圆形取景窗实时重绘当前机位画面（canvas 在 workbench 的 effect 里画）。
 */
export default function MultiAngleStage({ mode, h, p, d, fisheye, image, dragging, viewportRef, captureCanvasRef, onPointerDown, onPointerMove, onPointerUp, children }: MultiAngleStageProps) {
    const cameraMode = mode === "camera";
    const imgStyle = image ? { backgroundImage: `url(${image})` } : undefined;

    return (
        <div className={s.stageCard}>
            <div className={s.stageTop}>
                <span className={s.stageTag}>{cameraMode ? "主体视图 · 拖动镜头环绕" : "主体视图 · 像转台一样旋转盒子"}</span>
                <div className={s.angleReadout}>
                    <span>
                        {cameraMode ? "环绕" : "旋转"} {h}°
                    </span>
                    <span>
                        {cameraMode ? "俯仰" : "倾斜"} {p}°
                    </span>
                    <span>{fisheye ? "鱼眼" : shotLabel(d)}</span>
                </div>
            </div>

            <div ref={viewportRef} className={cn(s.viewport, dragging && s.viewportDragging)} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                <div className={s.zoomWrap} style={{ transform: `scale(${shotZoom(d)})` }}>
                    {cameraMode ? (
                        <div className={s.sceneCenter}>
                            <div className={cn(s.subjectPlane, fisheye && s.subjectPlaneFisheye)} style={{ ...imgStyle, transform: `rotateY(${h}deg) rotateX(${-p}deg)` }} />
                        </div>
                    ) : (
                        <div className={s.cube} style={{ transform: `rotateX(${-p}deg) rotateY(${-h}deg)` }}>
                            <div className={cn(s.cubeFace, s.cubeBack)} />
                            <div className={cn(s.cubeFace, s.cubeRight)} />
                            <div className={cn(s.cubeFace, s.cubeLeft)} />
                            <div className={cn(s.cubeFace, s.cubeTop)} />
                            <div className={cn(s.cubeFace, s.cubeBottom)} />
                            <div className={cn(s.cubeFace, s.cubeFrontPlane)} style={imgStyle} />
                        </div>
                    )}
                </div>

                <div className={s.capturePreview}>
                    <canvas ref={captureCanvasRef} width={192} height={192} />
                </div>
                <span className={s.captureLabel}>当前取景</span>

                {children}
            </div>

            <p className={s.hintLine}>镜头决定视角，景别决定远近。取景窗里就是该机位会拍到的画面。</p>
        </div>
    );
}
