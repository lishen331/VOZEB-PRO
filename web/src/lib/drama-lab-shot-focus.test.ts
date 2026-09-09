import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAMA_LAB_SHOT_FOCUS, focusDramaLabShot } from "./drama-lab-shot-focus";
afterEach(() => vi.unstubAllGlobals());
describe("shot focus", () => {
    it("reveals before measuring and scrolling, never creates a task", () => {
        const order: string[] = [];
        let frame: FrameRequestCallback = () => {};
        const dispatchEvent = vi.fn((event: CustomEvent) => {
            order.push("reveal");
            expect(event.type).toBe(DRAMA_LAB_SHOT_FOCUS);
            expect(event.detail).toEqual({ shotId: "a" });
            return true;
        });
        vi.stubGlobal("window", {
            dispatchEvent,
            requestAnimationFrame: (callback: FrameRequestCallback) => {
                frame = callback;
                return 1;
            },
        });
        const scrollIntoView = vi.fn(() => order.push("scroll"));
        const getElementById = vi.fn(() => ({ scrollIntoView }));
        vi.stubGlobal("document", { getElementById });
        focusDramaLabShot("a");
        expect(order).toEqual(["reveal"]);
        frame(0);
        expect(order).toEqual(["reveal", "scroll"]);
        expect(getElementById).toHaveBeenCalledWith("storyboard-shot-a");
    });
    it("ignores missing targets and server rendering", () => {
        vi.stubGlobal("window", undefined);
        expect(() => focusDramaLabShot("absent")).not.toThrow();
    });
});
