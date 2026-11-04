import { describe, expect, it } from "vitest";

import { shouldBlockOutsideDismiss } from "./gamma-ant-modal";

/*
 * 回归：新建/编辑弹窗「鼠标点不开、键盘 Enter 能开」。
 *
 * Radix 的 DismissableLayer 在 Dialog 上带 deferPointerDownOutside：pointerdown 只记下
 * 「按在弹层外」，真正的外部点击命令要等这次 click 才派发。React 的 onClick 挂在根容器上，
 * click 冒泡到容器时先执行页面的 openCreate()（弹窗已经变 open），再冒泡到 document 触发
 * Radix 的派发 —— 如果这时按「当前 open === true」判定，刚打开的弹窗会被立刻关掉。
 * 键盘 Enter 不产生 pointerdown，Radix 不会挂 click 回调，所以能正常打开。
 */
describe("shouldBlockOutsideDismiss", () => {
    it("blocks dismissal when the layer was closed at pointerdown (the click that opens it)", () => {
        // 按下时弹窗还关着 —— 这次点击是「打开」手势，不能同时被当成「点外面」而关掉
        expect(shouldBlockOutsideDismiss(false, true, false)).toBe(true);
    });

    it("blocks dismissal for a closed-but-mounted layer even when the target is outside", () => {
        // 关闭态残留 DOM 时，页面上的任何点击都不能触发关闭回调
        expect(shouldBlockOutsideDismiss(false, true, true)).toBe(true);
    });

    it("allows dismissal when the layer was already open and the mask is closable", () => {
        expect(shouldBlockOutsideDismiss(true, true, false)).toBe(false);
    });

    it("never dismisses when maskClosable is false", () => {
        expect(shouldBlockOutsideDismiss(true, false, false)).toBe(true);
    });

    it("keeps the dialog open when the click landed inside a portalled popup layer", () => {
        // 弹层内的 antd Select / Dropdown 浮层 Portal 到 body，Radix 会当成外部点击
        expect(shouldBlockOutsideDismiss(true, true, true)).toBe(true);
    });

    it("lets an already open layer close on a genuine outside click", () => {
        // 已经打开的弹窗点遮罩外：应当正常关闭
        expect(shouldBlockOutsideDismiss(true, true, false)).toBe(false);
    });
});
