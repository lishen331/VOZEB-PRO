import { describe, expect, it } from "vitest";

import { computeScreens } from "./gamma-ant-grid";

describe("gamma-ant-grid：computeScreens 断点判定与 antd 默认阈值一致", () => {
    it("宽屏（1200）：sm/md/lg/xl 均为 true，xxl 为 false", () => {
        expect(computeScreens(1200)).toEqual({ xs: true, sm: true, md: true, lg: true, xl: true, xxl: false });
    });

    it("窄屏（800）：sm/md 为 true，lg 为 false", () => {
        expect(computeScreens(800)).toMatchObject({ sm: true, md: true, lg: false });
    });

    it("移动端（375）：sm/md/lg 全为 false", () => {
        expect(computeScreens(375)).toMatchObject({ sm: false, md: false, lg: false });
    });

    it("边界值：恰好等于阈值时判定为命中（>=）", () => {
        expect(computeScreens(992).lg).toBe(true);
        expect(computeScreens(991).lg).toBe(false);
    });
});
