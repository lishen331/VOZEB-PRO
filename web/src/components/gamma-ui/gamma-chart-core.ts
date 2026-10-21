/*
 * 图表几何（纯函数，可单测）：刻度、坐标映射、平滑曲线、环形弧、热力色阶。
 */

/** 取一个「好看」的上限：1 / 2 / 2.5 / 5 / 10 × 10^n，至少盖住最大值 */
export function niceMax(values: readonly number[]) {
    const max = Math.max(0, ...values);
    if (max === 0) return 1;
    const power = 10 ** Math.floor(Math.log10(max));
    const ratio = max / power;
    const step = [1, 2, 2.5, 5, 10].find((candidate) => ratio <= candidate) ?? 10;
    return step * power;
}

/** 0..max 之间等分 count 段的刻度 */
export function ticks(max: number, count = 4) {
    return Array.from({ length: count + 1 }, (_, index) => (max / count) * index);
}

/** 单调平滑曲线（Fritsch–Carlson），不会在数据点之间冲过头 */
export function monotonePath(points: readonly [number, number][]) {
    const n = points.length;
    if (n === 0) return "";
    if (n === 1) return `M${points[0][0]} ${points[0][1]}`;
    const dx: number[] = [];
    const slope: number[] = [];
    for (let i = 0; i < n - 1; i += 1) {
        dx.push(points[i + 1][0] - points[i][0]);
        slope.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1));
    }
    const tangent = [slope[0]];
    for (let i = 1; i < n - 1; i += 1) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
    tangent.push(slope[n - 2]);
    for (let i = 0; i < n - 1; i += 1) {
        if (slope[i] === 0) {
            tangent[i] = 0;
            tangent[i + 1] = 0;
            continue;
        }
        const a = tangent[i] / slope[i];
        const b = tangent[i + 1] / slope[i];
        const h = a * a + b * b;
        if (h > 9) {
            const t = 3 / Math.sqrt(h);
            tangent[i] = t * a * slope[i];
            tangent[i + 1] = t * b * slope[i];
        }
    }
    const round = (value: number) => Math.round(value * 100) / 100;
    let d = `M${round(points[0][0])} ${round(points[0][1])}`;
    for (let i = 0; i < n - 1; i += 1) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        const third = dx[i] / 3;
        d += `C${round(x0 + third)} ${round(y0 + tangent[i] * third)} ${round(x1 - third)} ${round(y1 - tangent[i + 1] * third)} ${round(x1)} ${round(y1)}`;
    }
    return d;
}

/** 从 12 点方向顺时针画弧：start / end 为 0..1 */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
    const clampEnd = Math.min(end, start + 0.9999);
    const point = (t: number) => {
        const angle = t * Math.PI * 2 - Math.PI / 2;
        return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
    };
    const [x0, y0] = point(start);
    const [x1, y1] = point(clampEnd);
    const large = clampEnd - start > 0.5 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** 热力色阶：0 → 透明洗色，1 → 品牌青；返回 CSS color-mix 字符串 */
export function heatColor(value: number) {
    const t = Math.max(0, Math.min(1, value));
    if (t === 0) return "var(--gm-wash)";
    const percent = Math.round(18 + t * 82);
    return `color-mix(in srgb, ${t > 0.66 ? "var(--gm-cyan)" : "var(--gm-blue)"} ${percent}%, transparent)`;
}

/** 环比：上周 → 本周的变化百分比，保留 1 位；上周为 0 时返回 null */
export function delta(previous: number, current: number) {
    if (previous === 0) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
}
