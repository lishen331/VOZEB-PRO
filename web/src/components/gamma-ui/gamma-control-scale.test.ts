import { describe, expect, it } from "vitest";

import { CONTROL_TIER, controlBox, controlItem, controlShell, controlSquare } from "./gamma-control-scale";

/**
 * 刻度标准的护栏：设计页 GammaButton（gamma-button.tsx 的 SIZE 表）就是唯一标准，
 * 兼容层只能对齐它，不能各自漂移。任何一档被改动都会在这里失败。
 */
describe("gamma control scale", () => {
    it("三档高度与设计页 GammaButton 的 xs/sm/md 完全一致", () => {
        // 设计页：xs h-7(28) / sm h-8(32) / md h-10(40)
        expect(CONTROL_TIER.small.height).toBe("h-7");
        expect(CONTROL_TIER.middle.height).toBe("h-8");
        expect(CONTROL_TIER.large.height).toBe("h-10");
    });

    it("圆角只在 md 档升到 --gm-radius，其余两档同为 --gm-radius-sm", () => {
        expect(CONTROL_TIER.small.radius).toBe("rounded-[var(--gm-radius-sm)]");
        expect(CONTROL_TIER.middle.radius).toBe("rounded-[var(--gm-radius-sm)]");
        expect(CONTROL_TIER.large.radius).toBe("rounded-[var(--gm-radius)]");
    });

    it("字号随档位递增，不出现 antd 遗留的 7px 圆角或 24px 小档", () => {
        expect(CONTROL_TIER.small.text).toBe("text-xs");
        expect(CONTROL_TIER.middle.text).toBe("text-[13px]");
        expect(CONTROL_TIER.large.text).toBe("text-sm");
        for (const tier of Object.values(CONTROL_TIER)) {
            expect(tier.radius).not.toContain("7px");
            expect(tier.height).not.toBe("h-6");
            expect(tier.square).not.toBe("size-6");
        }
    });

    it("组合函数只拼该档的刻度，不夹带其它档的类名", () => {
        expect(controlBox("middle", "px-3.5")).toBe("h-8 gap-1.5 rounded-[var(--gm-radius-sm)] px-3.5 text-[13px]");
        expect(controlSquare("small")).toBe("size-7 rounded-[var(--gm-radius-sm)]");
        expect(controlShell("large", "px-3")).toBe("min-h-10 rounded-[var(--gm-radius)] px-3 text-sm");
        expect(controlItem("small", "px-2.5")).toBe("h-7 px-2.5 text-xs");
    });

    it("同一档在按钮、输入框、分段项里高度相同（这是统一的核心）", () => {
        for (const size of ["small", "middle", "large"] as const) {
            const tier = CONTROL_TIER[size];
            expect(controlBox(size, "px-3")).toContain(tier.height);
            expect(controlItem(size, "px-3")).toContain(tier.height);
            expect(controlShell(size, "px-3")).toContain(tier.minHeight);
            // h-7 与 min-h-7 数值必须一致，否则输入框和按钮会错位
            expect(tier.minHeight).toBe(`min-${tier.height}`);
        }
    });
});
