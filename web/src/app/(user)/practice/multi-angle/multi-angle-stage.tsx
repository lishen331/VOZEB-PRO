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
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    /** 左下角环控由 workbench 传进来，和舞台共用同一组拖拽回调 */
    children?: ReactNode;
    emptyState: ReactNode;
}

/**
 * 主舞台：
 *   - 外层 zoom-wrap 只做等比 scale（景别），内层只做 3D 旋转，两者互不拉扯；
 *   - 摄像头模式下是一张随镜头转的卡片，主体模式下换成立方盒；
 */
export default function MultiAngleStage({ mode, h, p, d, fisheye, image, dragging, viewportRef, onPointerDown, onPointerMove, onPointerUp, children, emptyState }: MultiAngleStageProps) {
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

            <div
                ref={viewportRef}
                data-testid="multi-angle-viewport"
                className={cn(s.viewport, dragging && s.viewportDragging)}
                onPointerDown={image ? onPointerDown : undefined}
                onPointerMove={image ? onPointerMove : undefined}
                onPointerUp={image ? onPointerUp : undefined}
                onPointerCancel={image ? onPointerUp : undefined}
            >
                {image ? (
                    <>
                        <div className={s.zoomWrap} style={{ transform: `scale(${shotZoom(d)})` }}>
                            {cameraMode ? (
                                <div className={s.sceneCenter}>
                                    <div data-testid="multi-angle-subject-plane" className={cn(s.subjectPlane, fisheye && s.subjectPlaneFisheye)} style={{ ...imgStyle, transform: `rotateY(${h}deg) rotateX(${-p}deg)` }} />
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

                        {children}
                    </>
                ) : (
                    emptyState
                )}
            </div>

            <p className={s.hintLine}>{image ? "拖动镜头调整机位，滚轮推近或拉远。" : "选择主体图片后即可调整机位。"}</p>
        </div>
    );
}
