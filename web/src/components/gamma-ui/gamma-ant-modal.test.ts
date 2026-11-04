import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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

/*
 * 回归：弹窗里的「身份」下拉点不动。
 *
 * Select 与 DatePicker 的浮层 Portal 到 body，和 Modal 不在同一个层叠上下文里，
 * 只能用 z-index 比较。Modal 遮罩与容器是 z-[1000]，浮层若低于它就整个被压在下面，
 * 表现为「下拉被遮罩盖住、选不了」。另外 dialog 打开时 radix 给 body 设了
 * pointer-events:none，浮层必须显式 pointer-events-auto 才可点。
 */
const DIALOG_Z = 1000;

function zIndexesIn(source: string) {
    return [...source.matchAll(/z-\[(\d+)\]/g)].map((match) => Number(match[1]));
}

describe("gamma-ui 浮层与弹窗的层级关系", () => {
    it("keeps the Select popup above the dialog layer", async () => {
        const source = await readFile(resolve(process.cwd(), "src/components/gamma-ui/gamma-ant-select.tsx"), "utf8");
        const popup = source.slice(source.indexOf("ant-select-dropdown"));
        const popupZ = zIndexesIn(popup.slice(0, 400));
        expect(popupZ.length, "Select 浮层缺少 z-index").toBeGreaterThan(0);
        expect(Math.max(...popupZ), "Select 浮层必须高于 Modal/Drawer 的 z-[1000]").toBeGreaterThan(DIALOG_Z);
    });

    it("keeps the DatePicker popup above the dialog layer", async () => {
        const source = await readFile(resolve(process.cwd(), "src/components/gamma-ui/gamma-ant-datepicker.tsx"), "utf8");
        const popupZ = zIndexesIn(source.slice(source.indexOf("const CONTENT_CLASS")));
        expect(popupZ.length, "DatePicker 浮层缺少 z-index").toBeGreaterThan(0);
        expect(Math.max(...popupZ), "DatePicker 浮层必须高于 Modal/Drawer 的 z-[1000]").toBeGreaterThan(DIALOG_Z);
    });

    it("lets both popups receive pointer events while a dialog disables body events", async () => {
        for (const file of ["gamma-ant-select.tsx", "gamma-ant-datepicker.tsx"]) {
            const source = await readFile(resolve(process.cwd(), "src/components/gamma-ui", file), "utf8");
            expect(source, `${file} 的浮层需要 pointer-events-auto`).toContain("pointer-events-auto");
        }
    });

    it("marks the DatePicker popup as a popup layer so the dialog does not treat its clicks as outside", async () => {
        const modal = await readFile(resolve(process.cwd(), "src/components/gamma-ui/gamma-ant-modal.tsx"), "utf8");
        expect(modal).toContain(".gm-popup-layer");
        const datepicker = await readFile(resolve(process.cwd(), "src/components/gamma-ui/gamma-ant-datepicker.tsx"), "utf8");
        // DatePicker 刻意不挂 ant-picker-dropdown（会破版），只能靠自己的标记类被识别。
        // 注释里提到这个类名是解释原因，真正的类名只允许出现在 CONTENT_CLASS 之外的地方。
        const classNameLines = datepicker.split("\n").filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"));
        expect(classNameLines.some((line) => line.includes("ant-picker-dropdown"))).toBe(false);
        expect(datepicker).toContain("gm-popup-layer");
    });
});
