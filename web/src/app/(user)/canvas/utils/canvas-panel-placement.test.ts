import { describe, expect, it } from "vitest";

import { CANVAS_PANEL_GAP, CANVAS_PANEL_HYSTERESIS, CANVAS_PANEL_MIN_USABLE, resolveCanvasPanelPlacement, type CanvasPanelPlacement, type CanvasPanelPlacementInput } from "./canvas-panel-placement";

/** Viewport band used by most cases: 0..1000 usable, node 400..500. */
function input(overrides: Partial<CanvasPanelPlacementInput> = {}): CanvasPanelPlacementInput {
    return { nodeTop: 400, nodeBottom: 500, usableTop: 0, usableBottom: 1000, panelHeight: 300, currentPlacement: "bottom", ...overrides };
}

describe("resolveCanvasPanelPlacement", () => {
    it("keeps the panel below when it fits there", () => {
        expect(resolveCanvasPanelPlacement(input({ panelHeight: 300 }))).toEqual({ placement: "bottom", maxHeight: undefined });
    });

    it("moves the panel above when only that side fits", () => {
        // spaceBelow = 1000 - 900 = 100; spaceAbove = 900 - 0 - 16 = 884.
        expect(resolveCanvasPanelPlacement(input({ nodeTop: 900, nodeBottom: 900, panelHeight: 300 }))).toEqual({ placement: "top", maxHeight: undefined });
    });

    it("prefers below when the panel fits on either side", () => {
        expect(resolveCanvasPanelPlacement(input({ panelHeight: 50, currentPlacement: "top" }))).toEqual({ placement: "bottom", maxHeight: undefined });
    });

    it("leaves the height uncapped whenever the panel fits whole", () => {
        expect(resolveCanvasPanelPlacement(input({ panelHeight: 300 })).maxHeight).toBeUndefined();
        expect(resolveCanvasPanelPlacement(input({ nodeTop: 900, nodeBottom: 900, panelHeight: 300 })).maxHeight).toBeUndefined();
    });
});

describe("resolveCanvasPanelPlacement in the critical band", () => {
    // Node centred so neither side can show a 600px panel: spaceAbove = 384,
    // spaceBelow = 500. This is the geometry that used to strobe.
    const critical = input({ nodeTop: 400, nodeBottom: 500, panelHeight: 600 });

    it("caps the panel to the roomier side so it scrolls internally", () => {
        const result = resolveCanvasPanelPlacement(critical);

        expect(result.placement).toBe("bottom");
        expect(result.maxHeight).toBe(500);
    });

    it("returns a stable answer when fed its own output repeatedly", () => {
        let placement: CanvasPanelPlacement = "bottom";
        const seen: CanvasPanelPlacement[] = [];
        for (let i = 0; i < 10; i += 1) {
            placement = resolveCanvasPanelPlacement({ ...critical, currentPlacement: placement }).placement;
            seen.push(placement);
        }

        expect(new Set(seen).size).toBe(1);
    });

    it("converges on the same side from either starting placement", () => {
        // spaceBelow (500) beats spaceAbove (384) by more than the hysteresis.
        expect(resolveCanvasPanelPlacement({ ...critical, currentPlacement: "bottom" }).placement).toBe("bottom");
        expect(resolveCanvasPanelPlacement({ ...critical, currentPlacement: "top" }).placement).toBe("bottom");
    });

    it("holds the current side when both sides are within the hysteresis", () => {
        // spaceAbove = 500 - 0 - 16 = 484; spaceBelow = 1000 - 500 = 500.
        const nearTie = input({ nodeTop: 500, nodeBottom: 500, panelHeight: 900 });

        expect(resolveCanvasPanelPlacement({ ...nearTie, currentPlacement: "top" }).placement).toBe("top");
        expect(resolveCanvasPanelPlacement({ ...nearTie, currentPlacement: "bottom" }).placement).toBe("bottom");
    });

    it("still switches when the other side is clearly roomier", () => {
        // spaceAbove = 884, spaceBelow = 100 — well past the threshold.
        expect(resolveCanvasPanelPlacement(input({ nodeTop: 900, nodeBottom: 900, panelHeight: 2000, currentPlacement: "bottom" })).placement).toBe("top");
    });

    it("survives sub-pixel jitter without flipping", () => {
        const seen = new Set<CanvasPanelPlacement>();
        let placement: CanvasPanelPlacement = "bottom";
        for (let i = 0; i < 20; i += 1) {
            const jitter = (i % 2 === 0 ? 1 : -1) * 0.37;
            placement = resolveCanvasPanelPlacement({ ...critical, nodeTop: 400 + jitter, nodeBottom: 500 + jitter, currentPlacement: placement }).placement;
            seen.add(placement);
        }

        expect(seen.size).toBe(1);
    });
});

describe("resolveCanvasPanelPlacement degenerate geometry", () => {
    it("never returns a sliver below the minimum usable height", () => {
        // Node fills the whole band: both sides are ~0.
        expect(resolveCanvasPanelPlacement(input({ nodeTop: 0, nodeBottom: 1000, panelHeight: 600 })).maxHeight).toBeGreaterThanOrEqual(CANVAS_PANEL_MIN_USABLE);
    });

    it("treats a zero-height panel as fitting below", () => {
        expect(resolveCanvasPanelPlacement(input({ panelHeight: 0 }))).toEqual({ placement: "bottom", maxHeight: undefined });
    });

    it("clamps negative space to zero instead of propagating it", () => {
        // Node sits entirely below the usable band: spaceBelow clamps to 0
        // rather than going negative, and the panel fits in the 1184px above.
        const result = resolveCanvasPanelPlacement(input({ nodeTop: 1200, nodeBottom: 1300, panelHeight: 600 }));

        expect(result).toEqual({ placement: "top", maxHeight: undefined });
    });

    it("caps to the minimum usable height when both sides are starved", () => {
        // Node fills the band and then some: spaceAbove and spaceBelow are both 0.
        const result = resolveCanvasPanelPlacement(input({ nodeTop: -50, nodeBottom: 1050, panelHeight: 600 }));

        expect(result.maxHeight).toBe(CANVAS_PANEL_MIN_USABLE);
    });

    it("subtracts the node gap when measuring the space above", () => {
        const result = resolveCanvasPanelPlacement(input({ nodeTop: 300, nodeBottom: 300, usableBottom: 300, panelHeight: 200 }));

        expect(result.placement).toBe("top");
        expect(300 - 0 - CANVAS_PANEL_GAP).toBe(284);
    });

    it("exposes a positive hysteresis threshold", () => {
        expect(CANVAS_PANEL_HYSTERESIS).toBeGreaterThan(0);
    });
});
