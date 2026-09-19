/**
 * Rotating status lines shown while a node is generating, plus the pure
 * typewriter timing math behind them.
 */
export const CANVAS_GENERATING_LINES = ["正在理解你的创意…", "正在构思画面…", "正在打磨细节…", "正在调整光影…", "马上就好…"] as const;

/** Per-character type-in speed, ms. */
export const TYPE_MS = 55;
/** Per-character delete speed, ms. Deleting reads better when it's faster. */
export const ERASE_MS = 28;
/** Dwell once a line is fully typed, ms. */
export const HOLD_MS = 1500;

export type TypewriterFrame = {
    /** Visible prefix of the current line. */
    text: string;
    phase: "type" | "hold" | "erase";
};

/**
 * Map elapsed ms to a typewriter frame. Pure and total: the cycle repeats
 * forever, so any elapsed value yields a frame without accumulating state.
 * Keeping the math here (rather than in a component) makes it unit-testable
 * and keeps the component a thin `setInterval` + render.
 */
export function typewriterFrame(elapsedMs: number, lines: readonly string[] = CANVAS_GENERATING_LINES): TypewriterFrame {
    if (!lines.length) return { text: "", phase: "hold" };
    const elapsed = Math.max(0, elapsedMs);

    // Each line's slot is type + hold + erase. Slots vary in length because
    // lines vary in length, so walk them rather than dividing by a constant.
    const slots = lines.map((line) => line.length * TYPE_MS + HOLD_MS + line.length * ERASE_MS);
    const total = slots.reduce((sum, slot) => sum + slot, 0);
    let offset = elapsed % total;

    for (let index = 0; index < lines.length; index += 1) {
        if (offset >= slots[index]) {
            offset -= slots[index];
            continue;
        }
        return frameWithinSlot(lines[index], offset);
    }

    return { text: "", phase: "hold" };
}

function frameWithinSlot(line: string, offset: number): TypewriterFrame {
    const typeEnd = line.length * TYPE_MS;
    const holdEnd = typeEnd + HOLD_MS;

    if (offset < typeEnd) {
        const shown = Math.floor(offset / TYPE_MS);
        return { text: line.slice(0, shown), phase: "type" };
    }
    if (offset < holdEnd) return { text: line, phase: "hold" };

    const erased = Math.floor((offset - holdEnd) / ERASE_MS);
    return { text: line.slice(0, Math.max(0, line.length - erased)), phase: "erase" };
}
