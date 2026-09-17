import { describe, expect, it } from "vitest";

import angleContract from "@/lib/server/one-click-film/angle-l-contract.json";
import photographyContract from "@/lib/server/one-click-film/photography-inference-l-contract.json";
import { SHOT_ANGLE_H_OPTIONS, SHOT_ANGLE_S_OPTIONS, SHOT_ANGLE_V_OPTIONS, SHOT_DEPTH_OF_FIELD_OPTIONS, SHOT_LIGHTING_OPTIONS, SHOT_MOVEMENT_OPTIONS } from "./shot-config-options";

/**
 * 这些选项的 value 必须与服务端契约完全一致。
 *
 * 若 UI 自己写一套键，就会出现「界面选了但提示词里没有」的哑参数 —— 那是本项目
 * 反复踩过的坑（后端有前端没接 / 前端发了后端白名单没放行）的第三种变体。
 */
describe("shot config options derive from the L contracts", () => {
    it("uses the angle contract keys verbatim", () => {
        expect(SHOT_ANGLE_H_OPTIONS.map((o) => o.value)).toEqual(Object.keys(angleContract.chineseLabel.horizontal));
        expect(SHOT_ANGLE_V_OPTIONS.map((o) => o.value)).toEqual(Object.keys(angleContract.chineseLabel.elevation));
        expect(SHOT_ANGLE_S_OPTIONS.map((o) => o.value)).toEqual(Object.keys(angleContract.chineseLabel.shotSize));
    });

    it("keeps the angle labels identical to the contract", () => {
        for (const option of SHOT_ANGLE_H_OPTIONS) {
            expect(option.label).toBe((angleContract.chineseLabel.horizontal as Record<string, string>)[option.value]);
        }
    });

    it("covers every movement enum with a Chinese label", () => {
        expect(SHOT_MOVEMENT_OPTIONS.map((o) => o.value)).toEqual(photographyContract.movementEnums);
        // 没有回退成英文键，说明每个枚举都写了中文名
        for (const option of SHOT_MOVEMENT_OPTIONS) expect(option.label).not.toBe(option.value);
    });

    it("covers every lighting value the inference can produce", () => {
        const contractValues = [...new Set(photographyContract.lightingRules.map((rule) => rule.value))];
        expect(SHOT_LIGHTING_OPTIONS.map((o) => o.value).sort()).toEqual(contractValues.sort());
        for (const option of SHOT_LIGHTING_OPTIONS) expect(option.label).not.toBe(option.value);
    });

    it("matches the three depth-of-field values the service writes", () => {
        // inferOneClickPhotographyParams 只会写入 shallow / medium / deep
        expect(SHOT_DEPTH_OF_FIELD_OPTIONS.map((o) => o.value)).toEqual(["shallow", "medium", "deep"]);
    });

    it("has no duplicate values in any list", () => {
        for (const list of [SHOT_ANGLE_H_OPTIONS, SHOT_ANGLE_V_OPTIONS, SHOT_ANGLE_S_OPTIONS, SHOT_MOVEMENT_OPTIONS, SHOT_LIGHTING_OPTIONS, SHOT_DEPTH_OF_FIELD_OPTIONS]) {
            expect(new Set(list.map((o) => o.value)).size).toBe(list.length);
        }
    });
});
