"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Modal, Segmented, Slider } from "antd";
import { RotateCcw, WandSparkles } from "lucide-react";

import { imagePreviewUrl } from "@/lib/media-image-url";

export type CanvasAngleshotSize = "closeup" | "near" | "medium" | "wide" | "far";

export type CanvasImageAngleParams = {
    horizontalAngle: number;
    pitchAngle: number;
    shotSize: CanvasAngleshotSize;
    wideAngle: boolean;
    usePrompt: boolean;
};

export type CanvasImageAnglePreset = { key: string; label: string; params: Omit<CanvasImageAngleParams, "usePrompt"> };

export const SHOT_SIZE_OPTIONS: Array<{ value: CanvasAngleshotSize; label: string; distance: number }> = [
    { value: "closeup", label: "特写", distance: 2.6 },
    { value: "near", label: "近景", distance: 3.4 },
    { value: "medium", label: "中景", distance: 4.8 },
    { value: "wide", label: "全景", distance: 6.4 },
    { value: "far", label: "远景", distance: 8 },
];

const DEFAULT_PARAMS: CanvasImageAngleParams = { horizontalAngle: 0, pitchAngle: 0, shotSize: "medium", wideAngle: false, usePrompt: true };

export const ANGLE_PRESETS: CanvasImageAnglePreset[] = [
    { key: "fish-eye", label: "鱼眼视角", params: { horizontalAngle: 0, pitchAngle: 0, shotSize: "wide", wideAngle: true } },
    { key: "tilt", label: "倾斜视角", params: { horizontalAngle: 35, pitchAngle: 12, shotSize: "medium", wideAngle: false } },
    { key: "top-front", label: "正面俯拍", params: { horizontalAngle: 0, pitchAngle: 55, shotSize: "wide", wideAngle: false } },
    { key: "bottom-front", label: "正面仰拍", params: { horizontalAngle: 0, pitchAngle: -45, shotSize: "wide", wideAngle: false } },
    { key: "top-panorama", label: "全景俯拍", params: { horizontalAngle: 0, pitchAngle: 80, shotSize: "far", wideAngle: false } },
    { key: "left-side", label: "左侧面", params: { horizontalAngle: -90, pitchAngle: 0, shotSize: "medium", wideAngle: false } },
    { key: "right-side", label: "右侧面", params: { horizontalAngle: 90, pitchAngle: 0, shotSize: "medium", wideAngle: false } },
    { key: "three-quarter", label: "四分之三侧面", params: { horizontalAngle: 40, pitchAngle: 0, shotSize: "medium", wideAngle: false } },
    { key: "back", label: "背面视角", params: { horizontalAngle: 180, pitchAngle: 0, shotSize: "medium", wideAngle: false } },
];

export function shotSizeDistance(shotSize: CanvasAngleshotSize) {
    return SHOT_SIZE_OPTIONS.find((option) => option.value === shotSize)?.distance ?? 4.8;
}

/** 与预设表整组比对，用户动过任一滑块就落回自定义。 */
export function matchAnglePreset(params: CanvasImageAngleParams) {
    const hit = ANGLE_PRESETS.find((preset) => preset.params.horizontalAngle === params.horizontalAngle && preset.params.pitchAngle === params.pitchAngle && preset.params.shotSize === params.shotSize && preset.params.wideAngle === params.wideAngle);
    return hit?.key ?? "custom";
}

export function CanvasNodeAngleDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageAngleParams) => void }) {
    const [params, setParams] = useState<CanvasImageAngleParams>(DEFAULT_PARAMS);
    const [gizmo, setGizmo] = useState<"sphere" | "cube">("sphere");

    useEffect(() => {
        if (open) setParams(DEFAULT_PARAMS);
    }, [dataUrl, open]);

    const presetKey = useMemo(() => matchAnglePreset(params), [params]);
    const update = <Key extends keyof CanvasImageAngleParams>(key: Key, value: CanvasImageAngleParams[Key]) => setParams((current) => ({ ...current, [key]: value }));
    const applyPreset = (key: string) => {
        const preset = ANGLE_PRESETS.find((item) => item.key === key);
        if (!preset) return;
        setParams((current) => ({ ...current, ...preset.params }));
    };

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={900} centered destroyOnHidden>
            <div className="space-y-4">
                <div>
                    <h2 className="text-xl font-semibold">多角度编辑器</h2>
                    <p className="mt-1 text-sm opacity-60">预览只表示机位方向，结果会基于原图重新生成</p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <PresetTab active={presetKey === "custom"} onClick={() => setParams((current) => ({ ...DEFAULT_PARAMS, usePrompt: current.usePrompt }))}>
                        自定义
                    </PresetTab>
                    {ANGLE_PRESETS.map((preset) => (
                        <PresetTab key={preset.key} active={presetKey === preset.key} onClick={() => applyPreset(preset.key)}>
                            {preset.label}
                        </PresetTab>
                    ))}
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] md:gap-6">
                    <div className="flex min-h-[260px] flex-col justify-between rounded-xl border p-4">
                        <div className="flex justify-end">
                            <Segmented
                                size="small"
                                value={gizmo}
                                options={[
                                    { label: "球体", value: "sphere" },
                                    { label: "立方体", value: "cube" },
                                ]}
                                onChange={(value) => setGizmo(value as "sphere" | "cube")}
                            />
                        </div>
                        <div className="grid flex-1 place-items-center py-2">{gizmo === "sphere" ? <AngleSphereGizmo dataUrl={dataUrl} params={params} /> : <AngleCubeGizmo dataUrl={dataUrl} params={params} />}</div>
                        <Button className="w-fit" size="small" icon={<RotateCcw className="size-4" />} onClick={() => setParams((current) => ({ ...DEFAULT_PARAMS, usePrompt: current.usePrompt }))}>
                            重置参数
                        </Button>
                    </div>

                    <div className="space-y-4 py-1">
                        <AngleSlider label="水平环绕" value={params.horizontalAngle} min={-180} max={180} step={1} suffix="°" hint="0° 正面，±90° 左右侧面，180° 背面" onChange={(value) => update("horizontalAngle", value)} />
                        <AngleSlider label="垂直俯仰" value={params.pitchAngle} min={-90} max={90} step={1} suffix="°" hint="正值俯拍，负值仰拍" onChange={(value) => update("pitchAngle", value)} />
                        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
                            <span className="font-medium opacity-75">景别</span>
                            <Segmented block value={params.shotSize} options={SHOT_SIZE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))} onChange={(value) => update("shotSize", value as CanvasAngleshotSize)} />
                        </div>
                        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
                            <span className="font-medium opacity-75">镜头</span>
                            <Segmented
                                className="w-fit"
                                value={params.wideAngle ? "wide" : "standard"}
                                options={[
                                    { label: "标准", value: "standard" },
                                    { label: "广角", value: "wide" },
                                ]}
                                onChange={(value) => update("wideAngle", value === "wide")}
                            />
                        </div>
                        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
                            <span className="font-medium opacity-75">提示词</span>
                            <div className="flex items-center gap-2">
                                <Segmented
                                    className="w-fit"
                                    value={params.usePrompt ? "on" : "off"}
                                    options={[
                                        { label: "写入景别", value: "on" },
                                        { label: "只写角度", value: "off" },
                                    ]}
                                    onChange={(value) => update("usePrompt", value === "on")}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button type="primary" size="large" icon={<WandSparkles className="size-4" />} onClick={() => onConfirm(params)}>
                        生成
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function PresetTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
            style={active ? { borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.10)", color: "#38bdf8" } : { borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.60)" }}
        >
            {children}
        </button>
    );
}

function AngleSlider({ label, value, min, max, step, suffix = "", hint, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; hint?: string; onChange: (value: number) => void }) {
    return (
        <div>
            <div className="grid grid-cols-[88px_minmax(0,1fr)_64px] items-center gap-4">
                <span className="font-medium opacity-75">{label}</span>
                <Slider min={min} max={max} step={step} value={value} onChange={onChange} />
                <span className="whitespace-nowrap text-right font-semibold tabular-nums">
                    {Number.isInteger(value) ? value : value.toFixed(1)}
                    {suffix}
                </span>
            </div>
            {hint ? <div className="mt-0.5 pl-[104px] text-xs opacity-50">{hint}</div> : null}
        </div>
    );
}

/** 机位在球坐标系里的单位向量：水平角绕竖轴，俯仰角抬降。 */
export function gizmoCameraVector(horizontalAngle: number, pitchAngle: number) {
    const yaw = (horizontalAngle * Math.PI) / 180;
    const pitch = (pitchAngle * Math.PI) / 180;
    return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
}

const SPHERE_RADIUS = 78;

/** 正交投影：x 向右，y 向上（SVG 里取负），z 只用于大小与远近。 */
export function projectGizmoPoint(horizontalAngle: number, pitchAngle: number, radius = SPHERE_RADIUS) {
    const vector = gizmoCameraVector(horizontalAngle, pitchAngle);
    return { cx: 100 + vector.x * radius, cy: 100 - vector.y * radius, depth: vector.z };
}

function AngleSphereGizmo({ dataUrl, params }: { dataUrl: string; params: CanvasImageAngleParams }) {
    const marker = projectGizmoPoint(params.horizontalAngle, params.pitchAngle);
    const thumb = Math.max(20, Math.min(34, 34 - (shotSizeDistance(params.shotSize) - 2.6) * 2.2));
    return (
        <svg viewBox="0 0 200 200" className="h-56 w-56" role="img" aria-label="机位球面示意">
            <circle cx="100" cy="100" r={SPHERE_RADIUS} fill="transparent" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
            {[0, 1, 2, 3].map((index) => (
                <ellipse key={`lat-${index}`} cx="100" cy="100" rx={SPHERE_RADIUS} ry={SPHERE_RADIUS * Math.abs(Math.sin(((index + 1) * Math.PI) / 5))} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />
            ))}
            {[0, 1, 2, 3].map((index) => (
                <ellipse key={`lon-${index}`} cx="100" cy="100" rx={SPHERE_RADIUS * Math.abs(Math.cos((index * Math.PI) / 4))} ry={SPHERE_RADIUS} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />
            ))}
            <defs>
                <clipPath id="angle-sphere-thumb">
                    <circle cx="100" cy="100" r={thumb} />
                </clipPath>
            </defs>
            <image href={imagePreviewUrl(dataUrl, 256)} x={100 - thumb} y={100 - thumb} width={thumb * 2} height={thumb * 2} preserveAspectRatio="xMidYMid slice" clipPath="url(#angle-sphere-thumb)" />
            <circle cx="100" cy="100" r={thumb} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
            <line x1="100" y1="100" x2={marker.cx} y2={marker.cy} stroke="#38bdf8" strokeWidth="1.4" strokeDasharray="3 3" />
            <circle cx={marker.cx} cy={marker.cy} r={marker.depth >= 0 ? 6 : 4.5} fill="#38bdf8" opacity={marker.depth >= 0 ? 1 : 0.6} />
        </svg>
    );
}

function AngleCubeGizmo({ dataUrl, params }: { dataUrl: string; params: CanvasImageAngleParams }) {
    const distance = shotSizeDistance(params.shotSize);
    const scale = Math.max(0.62, Math.min(1.12, 1.18 - distance * 0.055 + (params.wideAngle ? -0.1 : 0)));
    const size = 96;
    const faces = [
        { key: "front", transform: `translateZ(${size / 2}px)`, image: true },
        { key: "back", transform: `rotateY(180deg) translateZ(${size / 2}px)` },
        { key: "right", transform: `rotateY(90deg) translateZ(${size / 2}px)` },
        { key: "left", transform: `rotateY(-90deg) translateZ(${size / 2}px)` },
        { key: "top", transform: `rotateX(90deg) translateZ(${size / 2}px)` },
        { key: "bottom", transform: `rotateX(-90deg) translateZ(${size / 2}px)` },
    ];
    return (
        <div className="grid h-56 w-56 place-items-center" style={{ perspective: "680px" }}>
            <div
                className="relative"
                style={{
                    width: size,
                    height: size,
                    transformStyle: "preserve-3d",
                    transform: `rotateX(${params.pitchAngle * 0.9}deg) rotateY(${-params.horizontalAngle}deg) scale(${scale})`,
                }}
            >
                {faces.map((face) => (
                    <div key={face.key} className="absolute inset-0 border" style={{ borderColor: "rgba(56,189,248,0.45)", backgroundColor: "rgba(56,189,248,0.08)", transform: face.transform, backfaceVisibility: "hidden" }}>
                        {face.image ? <img src={imagePreviewUrl(dataUrl, 256)} alt="" className="size-full object-cover" draggable={false} /> : null}
                    </div>
                ))}
            </div>
        </div>
    );
}
