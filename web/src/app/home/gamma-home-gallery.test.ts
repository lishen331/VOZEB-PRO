import { describe, expect, it } from "vitest";

import { distributeToColumns } from "./gamma-home-gallery";

const tallEveryThird = (index: number) => index % 3 === 0;

describe("distributeToColumns", () => {
    it("puts the first items across the first row from left to right", () => {
        const columns = distributeToColumns(["a", "b", "c", "d", "e", "f", "g", "h"], 6, tallEveryThird);

        expect(columns.map((column) => column[0]?.item)).toEqual(["a", "b", "c", "d", "e", "f"]);
    });

    it("keeps every item exactly once with its original index", () => {
        const items = Array.from({ length: 31 }, (_, index) => `w${index}`);
        const columns = distributeToColumns(items, 5, tallEveryThird);
        const placed = columns.flat().sort((left, right) => left.index - right.index);

        expect(placed.map((entry) => entry.item)).toEqual(items);
        expect(placed.every((entry) => entry.item === `w${entry.index}`)).toBe(true);
    });

    it("fills the shortest column next so heights stay balanced", () => {
        // 第一行：a 高、b c 矮；第 4 个应落到 b（最矮且最左）而不是 a
        const columns = distributeToColumns(["a", "b", "c", "d"], 3, tallEveryThird);

        expect(columns[1]?.map((entry) => entry.item)).toEqual(["b", "d"]);
    });

    it("falls back to a single column for invalid counts", () => {
        expect(distributeToColumns(["a", "b"], 0, tallEveryThird)).toHaveLength(1);
    });
});
