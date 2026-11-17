import { describe, expect, it } from "vitest";

import { ANGLE_PRESETS, matchAnglePreset, gizmoCameraVector, projectGizmoPoint, shotSizeDistance, type CanvasImageAngleParams } from "./canvas-node-angle-dialog";

const base: CanvasImageAngleParams = { horizontalAngle: 0, pitchAngle: 0, shotSize: "medium", wideAngle: false, usePrompt: true };

describe("多角度编辑器预设", () => {
    it("覆盖左右侧面、四分之三侧面和背面，且不含重复 key", () => {
        const labels = ANGLE_PRESETS.map((preset) => preset.label);

        expect(labels).toEqual(expect.arrayContaining(["鱼眼视角", "倾斜视角", "正面俯拍", "正面仰拍", "全景俯拍", "左侧面", "右侧面", "四分之三侧面", "背面视角"]));
        expect(new Set(ANGLE_PRESETS.map((preset) => preset.key)).size).toBe(ANGLE_PRESETS.length);
    });

    it("背面视角落在 180 度，左右侧面互为镜像", () => {
        const back = ANGLE_PRESETS.find((preset) => preset.key === "back");
        const left = ANGLE_PRESETS.find((preset) => preset.key === "left-side");
        const right = ANGLE_PRESETS.find((preset) => preset.key === "right-side");

        expect(back?.params.horizontalAngle).toBe(180);
        expect(left?.params.horizontalAngle).toBe(-90);
        expect(right?.params.horizontalAngle).toBe(90);
    });

    it("鱼眼视角同时开广角并取全景", () => {
        const fishEye = ANGLE_PRESETS.find((preset) => preset.key === "fish-eye");

        expect(fishEye?.params).toMatchObject({ wideAngle: true, shotSize: "wide", horizontalAngle: 0, pitchAngle: 0 });
    });

    it("参数与某个预设完全一致时返回该预设，否则回落到自定义", () => {
        expect(matchAnglePreset({ ...base, horizontalAngle: 90 })).toBe("right-side");
        expect(matchAnglePreset({ ...base, horizontalAngle: 91 })).toBe("custom");
        expect(matchAnglePreset({ ...base, horizontalAngle: 90, usePrompt: false })).toBe("right-side");
    });

    it("景别距离随景别拉远单调递增", () => {
        expect(shotSizeDistance("closeup")).toBeLessThan(shotSizeDistance("near"));
        expect(shotSizeDistance("near")).toBeLessThan(shotSizeDistance("medium"));
        expect(shotSizeDistance("medium")).toBeLessThan(shotSizeDistance("wide"));
        expect(shotSizeDistance("wide")).toBeLessThan(shotSizeDistance("far"));
    });
});

describe("取景器几何", () => {
    it("正面机位落在原点正前方，背面在正后方", () => {
        expect(gizmoCameraVector(0, 0).z).toBeCloseTo(1);
        expect(gizmoCameraVector(0, 0).x).toBeCloseTo(0);
        expect(gizmoCameraVector(180, 0).z).toBeCloseTo(-1);
    });

    it("左右侧面把机位推到球的左右两极", () => {
        expect(gizmoCameraVector(90, 0).x).toBeCloseTo(1);
        expect(gizmoCameraVector(-90, 0).x).toBeCloseTo(-1);
    });

    it("俯仰角把机位抬到球顶、压到球底", () => {
        expect(gizmoCameraVector(0, 90).y).toBeCloseTo(1);
        expect(gizmoCameraVector(0, -90).y).toBeCloseTo(-1);
    });

    it("投影后机位点落在球内，正面在圆心、背面也在圆心但更暗", () => {
        const front = projectGizmoPoint(0, 0);
        const back = projectGizmoPoint(180, 0);
        const right = projectGizmoPoint(90, 0);

        expect(front.cx).toBeCloseTo(100);
        expect(front.cy).toBeCloseTo(100);
        expect(front.depth).toBeGreaterThan(0);
        expect(back.cx).toBeCloseTo(100);
        expect(back.depth).toBeLessThan(0);
        expect(right.cx).toBeGreaterThan(160);
        expect(right.cy).toBeCloseTo(100);
    });
});
