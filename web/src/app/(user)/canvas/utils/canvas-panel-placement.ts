export type CanvasPanelPlacement = "top" | "bottom";

export type CanvasPanelPlacementInput = {
    /** Node bounds in viewport coordinates. */
    nodeTop: number;
    nodeBottom: number;
    /** Usable band, already inset for the surface, visual viewport and toolbar. */
    usableTop: number;
    usableBottom: number;
    /** Intrinsic panel height (scrollHeight), independent of where it currently sits. */
    panelHeight: number;
    /** Placement in effect right now, used only for the hysteresis tie-break. */
    currentPlacement: CanvasPanelPlacement;
};

export type CanvasPanelPlacementResult = {
    placement: CanvasPanelPlacement;
    /** Cap for the panel's own scroll area. `undefined` means "leave it uncapped". */
    maxHeight: number | undefined;
};

/** Gap kept between the node and a panel sitting above it. */
export const CANVAS_PANEL_GAP = 16;

/**
 * Extra room the opposite side must offer before the current placement is
 * abandoned. Without it, `spaceAbove ≈ spaceBelow` lets sub-pixel drift from
 * getBoundingClientRect flip the panel between consecutive measurements.
 */
export const CANVAS_PANEL_HYSTERESIS = 24;

/** Below this, a side is too cramped to be worth flipping to. */
export const CANVAS_PANEL_MIN_USABLE = 96;

/**
 * Decide which side of a node its panel occupies.
 *
 * Deliberately a pure function of the node box, the usable band and the panel's
 * *intrinsic* height. The previous implementation asked "does the panel's current
 * bottom edge overflow?" — but that edge is itself a product of the placement it
 * was about to choose, so the two answers fed each other:
 *
 *   bottom -> panelRect.bottom overflows      -> flip to top
 *   top    -> panelRect.bottom no longer over -> flip back to bottom
 *
 * At zoom levels that leave the node near the middle of the viewport neither
 * side fits, so that loop never settles and the panel visibly strobes up and
 * down. Measuring intrinsic height instead makes the decision idempotent:
 * identical geometry always yields an identical answer.
 */
export function resolveCanvasPanelPlacement({ nodeTop, nodeBottom, usableTop, usableBottom, panelHeight, currentPlacement }: CanvasPanelPlacementInput): CanvasPanelPlacementResult {
    const spaceAbove = Math.max(0, nodeTop - usableTop - CANVAS_PANEL_GAP);
    const spaceBelow = Math.max(0, usableBottom - nodeBottom);
    const height = Math.max(0, panelHeight);
    const fitsBelow = spaceBelow >= height;
    const fitsAbove = spaceAbove >= height;

    // Fits on exactly one side: no judgement call to make.
    if (fitsBelow && !fitsAbove) return { placement: "bottom", maxHeight: undefined };
    if (fitsAbove && !fitsBelow) return { placement: "top", maxHeight: undefined };

    // Fits either way — prefer below (reading order) and leave it uncapped.
    if (fitsBelow && fitsAbove) return { placement: "bottom", maxHeight: undefined };

    // The critical band: neither side can show the panel whole, so it has to
    // scroll internally. Take the roomier side and cap to that room; the
    // hysteresis stops a near-tie from oscillating.
    const preferred = spaceAbove > spaceBelow ? "top" : "bottom";
    const currentSpace = currentPlacement === "top" ? spaceAbove : spaceBelow;
    const preferredSpace = preferred === "top" ? spaceAbove : spaceBelow;
    const keepCurrent = preferred !== currentPlacement && preferredSpace - currentSpace < CANVAS_PANEL_HYSTERESIS;
    const placement = keepCurrent ? currentPlacement : preferred;
    const space = placement === "top" ? spaceAbove : spaceBelow;

    // A side with almost no room would render an unusable sliver: fall back to
    // whichever side is larger outright and let it scroll.
    if (space < CANVAS_PANEL_MIN_USABLE) {
        const fallback = spaceAbove > spaceBelow ? "top" : "bottom";
        return { placement: fallback, maxHeight: Math.max(CANVAS_PANEL_MIN_USABLE, spaceAbove, spaceBelow) };
    }

    return { placement, maxHeight: space };
}
