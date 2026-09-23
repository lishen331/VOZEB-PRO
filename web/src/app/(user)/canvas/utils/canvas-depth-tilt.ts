/**
 * Pointer-driven 3D tilt for a node card, following the React Bits "Depth
 * Card" model: the card rotates toward the pointer and inner layers shift by
 * a depth-scaled parallax offset.
 */

/** Depth Card's `maxRotation` default, degrees. */
export const MAX_ROTATION = 20;
/** Depth Card's `maxTranslation` default, px. */
export const MAX_TRANSLATION = 20;

export type DepthTilt = {
    /** Degrees about the X axis. Positive tips the top away from the viewer. */
    rotateX: number;
    /** Degrees about the Y axis. */
    rotateY: number;
    /** Spotlight center as a 0-100 percentage of the card box. */
    spotlightX: number;
    spotlightY: number;
};

/**
 * Resolve a pointer position (world coords) against a node box (world coords)
 * into tilt angles. Working in world space means zoom cancels out: the same
 * pointer-to-card relationship yields the same tilt at any scale.
 *
 * Rotation is inverted relative to the offset so the card leans *toward* the
 * pointer — pointer right of center tips the right edge back, which reads as
 * the surface turning to face the cursor.
 */
export function depthTilt(pointer: { x: number; y: number }, box: { x: number; y: number; width: number; height: number }, maxRotation = MAX_ROTATION): DepthTilt {
    const width = Math.max(1, box.width);
    const height = Math.max(1, box.height);

    // Normalize to -1..1 from the card center, clamped so a pointer far outside
    // the card doesn't drive the tilt past its limit.
    const nx = clamp(((pointer.x - box.x) / width) * 2 - 1, -1, 1);
    const ny = clamp(((pointer.y - box.y) / height) * 2 - 1, -1, 1);

    return {
        rotateX: -ny * maxRotation,
        rotateY: nx * maxRotation,
        spotlightX: ((nx + 1) / 2) * 100,
        spotlightY: ((ny + 1) / 2) * 100,
    };
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}
