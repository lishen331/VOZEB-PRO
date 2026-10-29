import { describe, expect, it } from "vitest";

import { absolutizeMove, alignPoints, centroid, interpolatePairs, pairShapes, resample, shapesToPath, type MorphShape, type Pt } from "@/components/gamma-ui/gamma-path-morph";

const line = (x1: number, y1: number, x2: number, y2: number): MorphShape => ({
    points: [
        [x1, y1],
        [x2, y2],
    ],
    closed: false,
});
const square: MorphShape = {
    points: [
        [4, 4],
        [20, 4],
        [20, 20],
        [4, 20],
    ],
    closed: true,
};

describe("图标形变几何", () => {
    it("开放路径按弧长等距采样，首尾保留", () => {
        const points = resample(
            [
                [0, 0],
                [10, 0],
            ],
            5,
            false,
        );
        expect(points).toEqual([
            [0, 0],
            [2.5, 0],
            [5, 0],
            [7.5, 0],
            [10, 0],
        ]);
    });

    it("闭合路径采样不重复首点，周长均分", () => {
        const points = resample(square.points, 4, true);
        expect(points).toEqual([
            [4, 4],
            [20, 4],
            [20, 20],
            [4, 20],
        ]);
    });

    it("开放路径对齐会在反向更近时翻转", () => {
        const a: Pt[] = [
            [0, 0],
            [10, 0],
        ];
        expect(
            alignPoints(
                a,
                [
                    [10, 0],
                    [0, 0],
                ],
                false,
            ),
        ).toEqual([
            [0, 0],
            [10, 0],
        ]);
    });

    it("闭合路径对齐会旋转起点", () => {
        const a = resample(square.points, 4, true);
        const shifted = [a[2], a[3], a[0], a[1]];
        expect(alignPoints(a, shifted, true)).toEqual(a);
    });

    it("子路径数量不同：多出来的从对方质心长出来", () => {
        const pairs = pairShapes([line(4, 6, 20, 6), line(4, 12, 20, 12), line(4, 18, 20, 18)], [line(6, 6, 18, 18), line(18, 6, 6, 18)], 8);
        expect(pairs).toHaveLength(3);
        const grown = pairs.find((pair) => pair.to.every((point) => point[0] === pair.to[0][0] && point[1] === pair.to[0][1]));
        expect(grown).toBeTruthy();
    });

    it("t=0 / t=1 分别等于起点和终点", () => {
        const pairs = pairShapes([line(4, 12, 20, 12)], [line(12, 4, 12, 20)], 8);
        const start = interpolatePairs(pairs, 0)[0].points;
        const end = interpolatePairs(pairs, 1)[0].points;
        expect(start[0]).toEqual(pairs[0].from[0]);
        expect(end.at(-1)).toEqual(pairs[0].to.at(-1));
    });

    it("缩成一点的子路径不输出，闭合路径带 Z", () => {
        expect(
            shapesToPath([
                {
                    points: [
                        [3, 3],
                        [3, 3],
                    ],
                    closed: false,
                },
            ]),
        ).toBe("");
        expect(shapesToPath([square])).toMatch(/^M4 4L20 4L20 20L4 20Z$/);
    });

    it("首个 m 按绝对坐标处理，后续 m 相对上一段终点，多余坐标变成相对 lineto", () => {
        // lucide sun 的射线："m4.93 4.93 1.41 1.41" 是从 (4.93,4.93) 画到 (6.34,6.34)
        expect(absolutizeMove("m4.93 4.93 1.41 1.41", [0, 0], true)).toBe("M4.93 4.93l1.41 1.41");
        expect(absolutizeMove("m2 3h4", [10, 10], false)).toBe("M12 13h4");
        expect(absolutizeMove("M5 5L6 6", [10, 10], false)).toBe("M5 5L6 6");
        // 省略分隔符的写法
        expect(absolutizeMove("m6 6 12 12", [0, 0], true)).toBe("M6 6l12 12");
        expect(absolutizeMove("m-1-2", [3, 3], false)).toBe("M2 1");
    });

    it("质心", () => {
        expect(centroid(square.points)).toEqual([12, 12]);
        expect(centroid([])).toEqual([12, 12]);
    });
});
