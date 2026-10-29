import { describe, expect, it } from "vitest";

import { arcPath, delta, heatColor, monotonePath, niceMax, ticks } from "@/components/gamma-ui/gamma-chart-core";

describe("图表几何", () => {
    it("niceMax 取 1 / 2 / 2.5 / 5 / 10 × 10^n，且至少盖住最大值", () => {
        expect(niceMax([0])).toBe(1);
        expect(niceMax([7])).toBe(10);
        expect(niceMax([23])).toBe(25);
        expect(niceMax([180])).toBe(200);
        expect(niceMax([480, 12])).toBe(500);
        expect(niceMax([1001])).toBe(2000);
    });

    it("ticks 均分", () => {
        expect(ticks(100, 4)).toEqual([0, 25, 50, 75, 100]);
    });

    it("单调曲线：首尾经过数据点，单点退化为 M", () => {
        expect(monotonePath([])).toBe("");
        expect(monotonePath([[5, 5]])).toBe("M5 5");
        const d = monotonePath([
            [0, 10],
            [10, 0],
            [20, 10],
        ]);
        expect(d.startsWith("M0 10")).toBe(true);
        expect(d.endsWith("20 10")).toBe(true);
    });

    it("单调曲线不冲过头：单调数据的控制点不超出相邻两点的 y 范围", () => {
        const d = monotonePath([
            [0, 100],
            [10, 90],
            [20, 10],
            [30, 0],
        ]);
        const ys = [...d.matchAll(/C[\d.]+ ([\d.-]+) [\d.]+ ([\d.-]+)/g)].flatMap((match) => [Number(match[1]), Number(match[2])]);
        for (const value of ys) {
            expect(value).toBeGreaterThanOrEqual(-0.01);
            expect(value).toBeLessThanOrEqual(100.01);
        }
    });

    it("arcPath：超过半圈用大弧，满圈不会退化成零长度", () => {
        expect(arcPath(50, 50, 40, 0, 0.25)).toContain(" 0 0 1 ");
        expect(arcPath(50, 50, 40, 0, 0.75)).toContain(" 0 1 1 ");
        expect(arcPath(50, 50, 40, 0, 1)).not.toMatch(/M50\.00 10\.00A40 40 0 1 1 50\.00 10\.00$/);
    });

    it("热力色阶：0 为洗色、高值切到青色、越界被夹住", () => {
        expect(heatColor(0)).toBe("var(--gm-wash)");
        expect(heatColor(0.3)).toContain("--gm-blue");
        expect(heatColor(0.9)).toContain("--gm-cyan");
        expect(heatColor(5)).toBe(heatColor(1));
    });

    it("环比：保留 1 位，上周为 0 时为 null", () => {
        expect(delta(80, 92)).toBe(15);
        expect(delta(30, 20)).toBe(-33.3);
        expect(delta(0, 12)).toBeNull();
    });
});
