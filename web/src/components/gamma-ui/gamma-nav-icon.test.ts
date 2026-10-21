import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { GAMMA_NAV_ICON_LABELS, GAMMA_NAV_ICON_NAMES } from "@/components/gamma-ui/gamma-nav-icon";

/*
 * 导航图标几何规则（防止再出现「素材」选中态那种底色 / 横线伸出轮廓的问题）：
 *   1. 所有坐标落在 3.5–20.5 安全区
 *   2. fill 与 spark 的包围盒不超出 outline 的包围盒
 * 用简化的路径解析：只取坐标对的端点（弧线 / 曲线控制点也算进去，结果偏保守）。
 */

const source = readFileSync(resolve(__dirname, "gamma-nav-icon.tsx"), "utf8");

interface Box {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** 把 path d 转成绝对坐标点（支持 M L H V C S Q A Z 及其小写形式） */
function pathPoints(d: string): [number, number][] {
    const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
    const points: [number, number][] = [];
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let command = "";
    let i = 0;
    const num = () => Number(tokens[i++]);
    const arity: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
    while (i < tokens.length) {
        if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
        const lower = command.toLowerCase();
        const relative = command === lower;
        if (lower === "z") {
            x = startX;
            y = startY;
            continue;
        }
        const values = Array.from({ length: arity[lower] }, num);
        if (lower === "h") x = relative ? x + values[0] : values[0];
        else if (lower === "v") y = relative ? y + values[0] : values[0];
        else if (lower === "a") {
            // 弧线：起点与终点的中点 ± 半径 近似包围盒（对圆 / 半圆是精确的）
            const ex = relative ? x + values[5] : values[5];
            const ey = relative ? y + values[6] : values[6];
            const [rx, ry] = [Math.abs(values[0]), Math.abs(values[1])];
            const [cx, cy] = [(x + ex) / 2, (y + ey) / 2];
            const span = Math.hypot(ex - x, ey - y) / 2;
            // 小于半圆的短弧不会到达 ± 半径处，只取端点
            if (span >= Math.min(rx, ry) * 0.99 || values[3] === 1) points.push([cx - rx, cy], [cx + rx, cy], [cx, cy - ry], [cx, cy + ry]);
            x = ex;
            y = ey;
        } else {
            for (let k = 0; k < values.length; k += 2) {
                const px = relative ? x + values[k] : values[k];
                const py = relative ? y + values[k + 1] : values[k + 1];
                points.push([px, py]);
                if (k === values.length - 2) {
                    x = px;
                    y = py;
                }
            }
            if (lower === "m") {
                startX = x;
                startY = y;
                command = relative ? "l" : "L";
            }
            continue;
        }
        points.push([x, y]);
    }
    return points;
}

function boxOf(points: [number, number][]): Box {
    return points.reduce((box, [px, py]) => ({ minX: Math.min(box.minX, px), minY: Math.min(box.minY, py), maxX: Math.max(box.maxX, px), maxY: Math.max(box.maxY, py) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

/** 从源码里按图标名取出三层 d */
function layers(name: string) {
    const block = source.match(new RegExp(`\\n    ${name}: \\{([\\s\\S]*?)\\n    \\},`))?.[1] ?? "";
    // 长路径会被 Prettier 折到下一行（outline:\n "..."），所以冒号后允许任意空白
    const pick = (key: string) => block.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1];
    return { outline: pick("outline"), fill: pick("fill"), spark: pick("spark") };
}

const TOLERANCE = 0.6;

describe("导航图标几何", () => {
    it("每个图标都有中文名", () => {
        for (const name of GAMMA_NAV_ICON_NAMES) expect(GAMMA_NAV_ICON_LABELS[name], name).toMatch(/[一-龥]/);
    });

    it.each(GAMMA_NAV_ICON_NAMES)("%s：坐标在安全区内，选中层不超出轮廓", (name) => {
        const { outline, fill, spark } = layers(name);
        expect(outline, `${name} outline`).toBeTruthy();
        const outer = boxOf(pathPoints(outline ?? ""));
        expect(outer.minX).toBeGreaterThanOrEqual(3.5 - TOLERANCE);
        expect(outer.minY).toBeGreaterThanOrEqual(3.5 - TOLERANCE);
        expect(outer.maxX).toBeLessThanOrEqual(20.5 + TOLERANCE);
        expect(outer.maxY).toBeLessThanOrEqual(20.5 + TOLERANCE);
        for (const [layer, d] of [
            ["fill", fill],
            ["spark", spark],
        ] as const) {
            if (!d) continue;
            const inner = boxOf(pathPoints(d));
            expect(inner.minX, `${name} ${layer} 左`).toBeGreaterThanOrEqual(outer.minX - TOLERANCE);
            expect(inner.minY, `${name} ${layer} 上`).toBeGreaterThanOrEqual(outer.minY - TOLERANCE);
            expect(inner.maxX, `${name} ${layer} 右`).toBeLessThanOrEqual(outer.maxX + TOLERANCE);
            expect(inner.maxY, `${name} ${layer} 下`).toBeLessThanOrEqual(outer.maxY + TOLERANCE);
        }
    });

    it("设计系统页的分组覆盖全部图标", () => {
        const page = readFileSync(resolve(__dirname, "../../app/bluegamma/design/design-icons.tsx"), "utf8");
        for (const name of GAMMA_NAV_ICON_NAMES) expect(page, name).toContain(`"${name}"`);
    });
});
