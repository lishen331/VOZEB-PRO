/*
 * 任意图标形变的几何核心（纯函数，不依赖 DOM，便于单测）。
 * 思路同 morphicons：把两个图标的每条子路径都按弧长等距采样成点列，
 * 子路径按位置一一配对（数量不同就让多出来的从对方质心"长出来"），
 * 闭合路径再旋转起点、必要时反向，让点对点的移动距离最短，最后逐点插值。
 */

export type Pt = readonly [number, number];

export interface MorphShape {
    points: readonly Pt[];
    closed: boolean;
}

export const MORPH_SAMPLES = 64;

function dist2(a: Pt, b: Pt) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return dx * dx + dy * dy;
}

export function centroid(points: readonly Pt[]): Pt {
    if (points.length === 0) return [12, 12];
    let x = 0;
    let y = 0;
    for (const point of points) {
        x += point[0];
        y += point[1];
    }
    return [x / points.length, y / points.length];
}

/** 按弧长等距重采样到 n 个点（闭合路径不重复首点） */
export function resample(points: readonly Pt[], n: number, closed: boolean): Pt[] {
    if (points.length === 0) return Array.from({ length: n }, () => [12, 12] as Pt);
    if (points.length === 1) return Array.from({ length: n }, () => points[0]);
    const ring = closed ? [...points, points[0]] : [...points];
    const lengths = [0];
    for (let i = 1; i < ring.length; i += 1) lengths.push(lengths[i - 1] + Math.sqrt(dist2(ring[i - 1], ring[i])));
    const total = lengths[lengths.length - 1];
    if (total === 0) return Array.from({ length: n }, () => ring[0]);
    const result: Pt[] = [];
    let segment = 1;
    for (let i = 0; i < n; i += 1) {
        const target = closed ? (total * i) / n : (total * i) / (n - 1);
        while (segment < ring.length - 1 && lengths[segment] < target) segment += 1;
        const start = lengths[segment - 1];
        const span = lengths[segment] - start || 1;
        const t = Math.min(1, Math.max(0, (target - start) / span));
        const a = ring[segment - 1];
        const b = ring[segment];
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return result;
}

function cost(a: readonly Pt[], b: readonly Pt[]) {
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) sum += dist2(a[i], b[i]);
    return sum;
}

/** 让 b 的点序与 a 对齐：闭合路径试所有起点 × 正反两向，开放路径只试正反 */
export function alignPoints(a: readonly Pt[], b: readonly Pt[], closed: boolean): Pt[] {
    const reversed = [...b].reverse();
    if (!closed) return cost(a, reversed) < cost(a, b) ? reversed : [...b];
    let best: Pt[] = [...b];
    let bestCost = Number.POSITIVE_INFINITY;
    for (const candidate of [b, reversed]) {
        for (let offset = 0; offset < candidate.length; offset += 1) {
            const rotated = [...candidate.slice(offset), ...candidate.slice(0, offset)];
            const value = cost(a, rotated);
            if (value < bestCost) {
                bestCost = value;
                best = rotated;
            }
        }
    }
    return best;
}

/** SVG 数字：允许省略分隔符（"18-8-14" 是三个数，"1.41.41" 是两个数） */
const SVG_NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/**
 * 把一个子路径开头的 m 改写成绝对 M，便于单独测量。
 * SVG 规定：整条 d 的第一个 m 按绝对坐标处理；之后的 m 相对上一段终点。
 * m 后面跟的多余坐标是隐式的相对 lineto，所以补一个 l。
 */
export function absolutizeMove(raw: string, cursor: Pt, isFirst: boolean): string {
    if (raw[0] !== "m") return raw;
    const body = raw.slice(1);
    const numbers = body.match(SVG_NUMBER) ?? [];
    if (numbers.length < 2) return `M${cursor[0]} ${cursor[1]}`;
    const x = (isFirst ? 0 : cursor[0]) + Number(numbers[0]);
    const y = (isFirst ? 0 : cursor[1]) + Number(numbers[1]);
    let consumed = 0;
    const rest = body.replace(SVG_NUMBER, (match) => (consumed++ < 2 ? "" : match)).replace(/^[\s,]+/, "");
    return `M${x} ${y}${rest ? (/^[a-zA-Z]/.test(rest) ? rest : `l${rest}`) : ""}`;
}

/** 一对可直接插值的点列：from / to 点数相同、点序已对齐 */
export interface MorphPair {
    from: Pt[];
    to: Pt[];
    closed: boolean;
}

function collapsed(at: Pt, n: number): Pt[] {
    return Array.from({ length: n }, () => at);
}

/**
 * 子路径配对：按质心距离贪心匹配。
 * 多出来的子路径与"对方质心处的一个点"配对，于是形变时它从那里长出 / 缩回去。
 */
export function pairShapes(from: readonly MorphShape[], to: readonly MorphShape[], n = MORPH_SAMPLES): MorphPair[] {
    const a = from.map((shape) => ({ ...shape, sampled: resample(shape.points, n, shape.closed), center: centroid(shape.points) }));
    const b = to.map((shape) => ({ ...shape, sampled: resample(shape.points, n, shape.closed), center: centroid(shape.points) }));
    const usedB = new Set<number>();
    const pairs: MorphPair[] = [];

    for (const left of a) {
        let bestIndex = -1;
        let bestDistance = Number.POSITIVE_INFINITY;
        b.forEach((right, index) => {
            if (usedB.has(index)) return;
            const value = dist2(left.center, right.center);
            if (value < bestDistance) {
                bestDistance = value;
                bestIndex = index;
            }
        });
        if (bestIndex < 0) {
            pairs.push({ from: left.sampled, to: collapsed(left.center, n), closed: left.closed });
            continue;
        }
        usedB.add(bestIndex);
        const right = b[bestIndex];
        // 一闭一开时按开放处理（闭合环当作首尾相连的折线），避免插值中途出现多余的封口线
        const closed = left.closed && right.closed;
        pairs.push({ from: left.sampled, to: alignPoints(left.sampled, right.sampled, closed), closed });
    }
    b.forEach((right, index) => {
        if (!usedB.has(index)) pairs.push({ from: collapsed(right.center, n), to: right.sampled, closed: right.closed });
    });
    return pairs;
}

/** t ∈ [0,1]（弹簧会略微超出，原样外推即可产生回弹感） */
export function interpolatePairs(pairs: readonly MorphPair[], t: number): MorphShape[] {
    return pairs.map((pair) => ({
        closed: pair.closed,
        points: pair.from.map((point, index) => {
            const target = pair.to[index];
            return [point[0] + (target[0] - point[0]) * t, point[1] + (target[1] - point[1]) * t] as Pt;
        }),
    }));
}

const round = (value: number) => Math.round(value * 100) / 100;

/** 点列 → SVG path d；全部缩成一点的子路径直接省略，免得在描边下留一个圆点 */
export function shapesToPath(shapes: readonly MorphShape[]): string {
    return shapes
        .filter((shape) => shape.points.some((point) => dist2(point, shape.points[0]) > 0.01))
        .map((shape) => `M${shape.points.map((point) => `${round(point[0])} ${round(point[1])}`).join("L")}${shape.closed ? "Z" : ""}`)
        .join("");
}
