/** UI-only snapshot stored on existing practice sessions; never sent to a generation provider. */
const presets = ["custom", "front", "back", "left", "right", "high", "top", "low", "fisheye"] as const;

export type MultiAngleHistoryShot = {
    batchId: string;
    shotIndex: number;
    mode: "camera" | "subject";
    h: number;
    p: number;
    d: number;
    fisheye: boolean;
    preset: (typeof presets)[number];
    batch: 1 | 4 | 6;
    promptOn: boolean;
    prompt: string;
};

const between = (value: unknown, min: number, max: number): value is number => typeof value === "number" && value >= min && value <= max;
const isPreset = (value: unknown): value is MultiAngleHistoryShot["preset"] => presets.some((preset) => preset === value);

export function parseMultiAngleHistoryShot(value: unknown): MultiAngleHistoryShot | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { batchId, shotIndex, mode, h, p, d, fisheye, preset, batch, promptOn, prompt } = value as Record<string, unknown>;
    if (
        typeof batchId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(batchId) ||
        (batch !== 1 && batch !== 4 && batch !== 6) ||
        !between(shotIndex, 0, batch - 1) ||
        !Number.isInteger(shotIndex) ||
        (mode !== "camera" && mode !== "subject") ||
        !between(h, mode === "camera" ? 0 : -180, mode === "camera" ? 360 : 180) ||
        !between(p, -90, 90) ||
        !between(d, 1, 10) ||
        typeof fisheye !== "boolean" ||
        !isPreset(preset) ||
        typeof promptOn !== "boolean" ||
        typeof prompt !== "string"
    )
        return null;
    return { batchId, shotIndex, mode, h, p, d, fisheye, preset, batch, promptOn, prompt };
}
