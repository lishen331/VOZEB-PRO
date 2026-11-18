/**
 * 多角度练习的参数模型。
 *
 * 环绕 / 俯仰 / 景别的语义与画布多角度一致：
 *   摄像头模式 h ∈ [0, 360)（镜头绕主体一圈），主体模式 h ∈ [-180, 180]（主体自己转）。
 *   景别 d ∈ [1, 10]：1 最近（特写）、10 最远（全景），与 Demo / LibTV 一致。
 * P0 的生成是本地 canvas 合成，不接 AI，因此这里只放纯函数，方便统一测试。
 */

export type AngleMode = "camera" | "subject";
export type PresetKey = "custom" | "front" | "back" | "left" | "right" | "high" | "top" | "low" | "fisheye";
export type BatchSize = 1 | 4 | 6;

export const DEFAULT_SHOT_DISTANCE = 4.8;
export const MIN_SHOT_DISTANCE = 1;
export const MAX_SHOT_DISTANCE = 10;
export const WHEEL_STEP = 0.4;
/** 拖拽灵敏度：水平 0.9° / px，垂直 0.5° / px，与 Demo 一致。 */
export const DRAG_H_FACTOR = 0.9;
export const DRAG_P_FACTOR = 0.5;

/** 景别文字：1 = 特写（最近），10 = 全景（最远）。 */
export function shotLabel(d: number) {
    return d <= 2 ? "特写" : d <= 4 ? "近景" : d <= 6.5 ? "中景" : d <= 8.5 ? "远景" : "全景";
}

/** 主舞台缩放：d = 1 → 1.55（推近），d = 10 → 0.40（拉远）。 */
export function shotZoom(d: number) {
    return 1.55 - ((d - 1) / 9) * 1.15;
}

export function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

export function wrapCameraAngle(value: number) {
    return ((Math.round(value) % 360) + 360) % 360;
}

export function toCameraAngle(value: number) {
    return wrapCameraAngle(value);
}

export function toSubjectAngle(value: number) {
    return value > 180 ? value - 360 : value;
}

export const MODE_COPY: Record<AngleMode, { hLabel: string; pLabel: string; dLabel: string; stageTag: string; orbitHint: string; badge: string; readoutPrefix: [string, string] }> = {
    camera: {
        hLabel: "水平环绕",
        pLabel: "垂直俯仰",
        dLabel: "景别缩放",
        stageTag: "主体视图 · 拖动镜头环绕",
        orbitHint: "拖动镜头",
        badge: "CAMERA",
        readoutPrefix: ["环绕", "俯仰"],
    },
    subject: {
        hLabel: "主体旋转",
        pLabel: "主体倾斜",
        dLabel: "缩放",
        stageTag: "主体视图 · 像转台一样旋转盒子",
        orbitHint: "拖动旋转",
        badge: "SUBJECT",
        readoutPrefix: ["旋转", "倾斜"],
    },
};

export interface AnglePreset {
    h: number;
    p: number;
    d: number | null;
    fisheye: boolean;
}

export const ANGLE_PRESETS: Record<Exclude<PresetKey, "custom">, AnglePreset> & { custom: null } = {
    custom: null,
    front: { h: 0, p: 0, d: null, fisheye: false },
    back: { h: 180, p: 0, d: null, fisheye: false },
    left: { h: 315, p: 0, d: null, fisheye: false },
    right: { h: 45, p: 0, d: null, fisheye: false },
    high: { h: 45, p: -45, d: null, fisheye: false },
    top: { h: 0, p: -80, d: 9, fisheye: false },
    low: { h: 0, p: 60, d: null, fisheye: false },
    fisheye: { h: 0, p: 30, d: 1.5, fisheye: true },
};

export const PRESET_TABS: Array<{ key: PresetKey; label: string }> = [
    { key: "custom", label: "自定义" },
    { key: "front", label: "正面视角" },
    { key: "back", label: "背面视角" },
    { key: "left", label: "左侧 45°" },
    { key: "right", label: "右侧 45°" },
    { key: "high", label: "倾斜俯拍" },
    { key: "top", label: "全景俯拍" },
    { key: "low", label: "正面仰拍" },
    { key: "fisheye", label: "鱼眼视角" },
];

/** 批量机位：4 张环拍 / 6 张全角度，与 Demo 一致。 */
export const BATCH_ANGLES: Record<4 | 6, Array<{ h: number; p: number; name: string }>> = {
    4: [
        { h: 0, p: 0, name: "正面" },
        { h: 90, p: 0, name: "右环 90°" },
        { h: 180, p: 0, name: "背面" },
        { h: 270, p: 0, name: "左环 90°" },
    ],
    6: [
        { h: 0, p: 0, name: "正面" },
        { h: 45, p: 0, name: "右 45°" },
        { h: 315, p: 0, name: "左 45°" },
        { h: 180, p: 0, name: "背面" },
        { h: 0, p: -45, name: "俯拍" },
        { h: 0, p: 45, name: "仰拍" },
    ],
};

export function singleShotName(preset: PresetKey, h: number, p: number) {
    if (preset === "fisheye") return "鱼眼视角";
    if (h === 0 && p === 0) return "正面";
    return `${h}° · 俯仰 ${p}°`;
}

// ─── 环形球控件：三维投影 ───

export const ORBIT_GEOMETRY = { size: 178, cx: 89, cy: 89, R: 68 };
export const ORBIT_LATITUDES = [-60, -30, 0, 30, 60];
export const ORBIT_LONGITUDES = [0, 30, 60, 90, 120, 150];
const ORBIT_SEGMENTS = 48;

export interface OrbitPoint {
    sx: number;
    sy: number;
    depth: number;
}

export function orbitProject(x: number, y: number, z: number, hRad: number, pRad: number, R = ORBIT_GEOMETRY.R): OrbitPoint {
    const x1 = x * Math.cos(hRad) + z * Math.sin(hRad);
    const z1 = -x * Math.sin(hRad) + z * Math.cos(hRad);
    const y2 = y * Math.cos(pRad) - z1 * Math.sin(pRad);
    const z2 = y * Math.sin(pRad) + z1 * Math.cos(pRad);
    return { sx: ORBIT_GEOMETRY.cx + x1 * R, sy: ORBIT_GEOMETRY.cy - y2 * R, depth: z2 };
}

function orbitPathOf(points: number[][], hRad: number, pRad: number) {
    let d = "";
    points.forEach(([x, y, z], index) => {
        const q = orbitProject(x, y, z, hRad, pRad);
        d += `${index ? "L" : "M"}${q.sx.toFixed(1)},${q.sy.toFixed(1)}`;
    });
    return `${d}Z`;
}

export function latitudePath(latDeg: number, hRad: number, pRad: number) {
    const lat = (latDeg * Math.PI) / 180;
    const points: number[][] = [];
    for (let i = 0; i < ORBIT_SEGMENTS; i += 1) {
        const a = (i / ORBIT_SEGMENTS) * Math.PI * 2;
        points.push([Math.cos(lat) * Math.cos(a), Math.sin(lat), Math.cos(lat) * Math.sin(a)]);
    }
    return orbitPathOf(points, hRad, pRad);
}

export function longitudePath(lonDeg: number, hRad: number, pRad: number) {
    const lon = (lonDeg * Math.PI) / 180;
    const points: number[][] = [];
    for (let i = 0; i < ORBIT_SEGMENTS; i += 1) {
        const a = (i / ORBIT_SEGMENTS) * Math.PI * 2;
        points.push([Math.sin(a) * Math.cos(lon), Math.cos(a), Math.sin(a) * Math.sin(lon)]);
    }
    return orbitPathOf(points, hRad, pRad);
}

/** 镜头在球面上的位置：俯仰为正（仰拍）时球体上仰，与 Demo 一致。 */
export function orbitCamera(h: number, p: number) {
    const hRad = (h * Math.PI) / 180;
    const pRad = (-p * Math.PI) / 180;
    const x = Math.sin(hRad) * Math.cos(pRad);
    const y = Math.sin(pRad);
    const z = Math.cos(hRad) * Math.cos(pRad);
    const at = orbitProject(x, y, z, 0, 0);
    const depth = z;
    return {
        sx: at.sx,
        sy: at.sy,
        scale: 0.74 + Math.max(0, depth) * 0.2,
        opacity: depth > -0.2 ? 1 : 0.42,
    };
}

// ─── 本地合成渲染（P0 演示）───

interface RenderOptions {
    h: number;
    p: number;
    d: number;
    fisheye: boolean;
    /** 画布宽高比，默认 4:3。取景器用 1:1。 */
    aspect?: number;
}

function clipCircle(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
}

/**
 * 按机位把原图画成一张「模拟拍到」的小图：
 * 水平越侧、俯仰越大，画面越偏、越暗；鱼眼走极坐标重采样。
 * 纯本地绘制，不调用 AI，也不代表真实几何投影。
 */
export function paintCapture(canvas: HTMLCanvasElement, img: HTMLImageElement, options: RenderOptions) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const { h, p, d, fisheye, aspect = 4 / 3 } = options;
    ctx.clearRect(0, 0, W, H);

    const hRad = (h * Math.PI) / 180;
    const pRad = (p * Math.PI) / 180;
    const facing = Math.cos(hRad) * Math.cos(pRad);
    const edgeOn = Math.abs(Math.sin(hRad));

    ctx.save();
    if (Math.abs(aspect - 1) < 0.01) clipCircle(ctx, W, H);
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "rgba(0,80,245,.08)");
    bg.addColorStop(1, "rgba(40,235,250,.06)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const baseScale = (W / 640) * 1.15 * shotZoom(d);
    const dw = W * 1.05 * baseScale;
    const dh = H * 1.05 * baseScale;
    const skewX = Math.sin(hRad) * W * 0.18;
    const skewY = -Math.sin(pRad) * H * 0.12;

    ctx.translate(W / 2 + (facing < 0 ? -skewX * 0.4 : skewX * 0.4), H / 2 + skewY);
    ctx.transform(facing < 0 ? -1 : 1, 0, 0, 1, 0, 0);
    ctx.filter = fisheye ? "saturate(1.08) contrast(1.03)" : "none";
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.filter = "none";

    const shade = 1 - Math.max(0, 1 - Math.abs(facing)) * 0.38;
    ctx.fillStyle = `rgba(8,14,28,${(1 - shade).toFixed(2)})`;
    ctx.fillRect(-W, -H, W * 2, H * 2);

    if (edgeOn > 0.4) {
        ctx.fillStyle = `rgba(8,14,28,${(edgeOn * 0.06).toFixed(2)})`;
        ctx.fillRect(-W, -H, W * 2, H * 2);
    }
    ctx.restore();

    // 角度标记（镜头上的小取景器太小，不画）
    if (W >= 120) {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.font = "600 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${h}° / ${p}°`, W / 2, H - 8);
        ctx.restore();
    }
}

/** 生成一张结果图（640×480 JPEG data URL）。 */
export function renderShot(img: HTMLImageElement, options: RenderOptions): string {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const { h, p, d, fisheye } = options;

    if (fisheye) {
        const source = document.createElement("canvas");
        source.width = canvas.width;
        source.height = canvas.height;
        const sctx = source.getContext("2d");
        if (!sctx) return "";
        sctx.drawImage(img, -canvas.width * 0.3, -canvas.height * 0.3, canvas.width * 1.6, canvas.height * 1.6);
        const src = sctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const out = ctx.createImageData(canvas.width, canvas.height);
        for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
                const nx = (x - canvas.width / 2) / (canvas.width / 2);
                const ny = (y - canvas.height / 2) / (canvas.height / 2);
                const r = Math.hypot(nx, ny);
                const f = r === 0 ? 1 : Math.atan(r * 1.35) / (r * 1.35);
                const tx = Math.round(nx * f * (canvas.width / 2) + canvas.width / 2);
                const ty = Math.round(ny * f * (canvas.height / 2) + canvas.height / 2);
                const di = (y * canvas.width + x) * 4;
                if (tx >= 0 && tx < canvas.width && ty >= 0 && ty < canvas.height) {
                    const si = (ty * canvas.width + tx) * 4;
                    out.data[di] = src[si];
                    out.data[di + 1] = src[si + 1];
                    out.data[di + 2] = src[si + 2];
                    out.data[di + 3] = 255;
                }
            }
        }
        ctx.putImageData(out, 0, 0);
    } else {
        const zoom = shotZoom(d) * (1 + Math.abs(Math.sin((h * Math.PI) / 180)) * 0.05);
        const shiftX = Math.sin((h * Math.PI) / 180) * 34;
        const shiftY = Math.sin((p * Math.PI) / 180) * 26;
        ctx.drawImage(img, -(canvas.width * zoom - canvas.width) / 2 - shiftX, -(canvas.height * zoom - canvas.height) / 2 - shiftY, canvas.width * zoom, canvas.height * zoom);
    }
    if (Math.cos((h * Math.PI) / 180) < -0.3) {
        ctx.fillStyle = "rgba(8,14,28,.12)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL("image/jpeg", 0.88);
}

/** 没有上传图片时，用一张程序绘制的示例主体图，避免依赖外部素材。 */
export function createSampleImage(): string {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const gradient = ctx.createLinearGradient(0, 0, 800, 600);
    gradient.addColorStop(0, "#16337a");
    gradient.addColorStop(0.55, "#0050f5");
    gradient.addColorStop(1, "#28ebfa");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = "rgba(255,255,255,.16)";
    ctx.beginPath();
    ctx.arc(400, 250, 170, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0b1530";
    ctx.beginPath();
    ctx.arc(400, 230, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(400, 430, 150, 130, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.font = "600 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("示例主体图", 400, 560);
    return canvas.toDataURL("image/png");
}
