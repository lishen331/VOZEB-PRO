import { buildAnglePrompt } from "@/lib/angle/angle-presets";
import { parseMultiAngleHistoryShot, type MultiAngleHistoryShot } from "@/lib/practice-multi-angle-history";
import type { PracticeSession } from "@/services/api/practice";
import { serverMediaUrl } from "@/services/server-media-storage";

import { BATCH_ANGLES, shotLabel, singleShotName, toCanvasAngleParams } from "./angle-model";

export type MultiAngleShot = {
    name: string;
    url: string | null;
    status: "queued" | "running" | "success" | "failed" | "missing";
    prompt: { horizontal: string; vertical: string; distance: string; lens: string; description: string; full: string | null };
};
export type MultiAngleRun = {
    id: string;
    createdAt: string;
    source: { storageKey: string; url: string };
    snapshot: MultiAngleHistoryShot;
    shots: MultiAngleShot[];
};

export function angleJobs(snapshot: Pick<MultiAngleHistoryShot, "batch" | "h" | "p" | "preset">) {
    const { batch, h, p, preset } = snapshot;
    return batch === 1 ? [{ h, p, name: singleShotName(preset, h, p) }] : BATCH_ANGLES[batch];
}

type AngleSnapshot = Omit<MultiAngleHistoryShot, "shotIndex">;

function shotPrompt(snapshot: AngleSnapshot, h: number, p: number): MultiAngleShot["prompt"] {
    const params = toCanvasAngleParams(h, p, snapshot.d, snapshot.fisheye, snapshot.promptOn);
    const { horizontalAngle: yaw, pitchAngle: pitch } = params;
    const description = snapshot.prompt.trim();
    return {
        horizontal: yaw === 0 ? "正面 0°" : Math.abs(yaw) === 180 ? "背面 180°" : `向${yaw > 0 ? "右" : "左"}旋转 ${Math.abs(yaw)}°`,
        vertical: pitch === 0 ? "平视 0°" : `${pitch > 0 ? "俯视" : "仰视"} ${Math.abs(pitch)}°`,
        distance: `${shotLabel(snapshot.d)}${snapshot.promptOn ? "" : "（未写入提示词）"}`,
        lens: snapshot.fisheye ? "广角" : "标准镜头",
        description,
        full: [description, buildAnglePrompt(params)].filter(Boolean).join("，"),
    };
}

export function createAngleShots(snapshot: AngleSnapshot): MultiAngleShot[] {
    return angleJobs(snapshot).map(({ h, p, name }) => ({ name, url: null, status: "queued", prompt: shotPrompt(snapshot, h, p) }));
}

export function groupMultiAngleSessions(sessions: PracticeSession[]): MultiAngleRun[] {
    const batches = new Map<string, MultiAngleRun>();
    for (const session of sessions) {
        const snapshot = parseMultiAngleHistoryShot(session.input?.multiAngle);
        if (!snapshot || session.module !== "storyboard-image") continue;
        const references: unknown[] = Array.isArray(session.input.references) ? session.input.references : [];
        const asset = references.find((reference): reference is { type: "asset"; inputKey: "referenceImage"; id: string; scope?: string } => {
            if (!reference || typeof reference !== "object") return false;
            const { type, inputKey, id } = reference as Record<string, unknown>;
            return type === "asset" && inputKey === "referenceImage" && typeof id === "string" && /^(?:temporary|permanent)\//.test(id);
        });
        if (!asset) continue;
        const url = asset.scope === "generation" ? `/api/generation-log-assets/${asset.id.split("/").map(encodeURIComponent).join("/")}` : serverMediaUrl(asset.id);
        const run = batches.get(snapshot.batchId) ?? {
            id: snapshot.batchId,
            createdAt: session.createdAt,
            source: { storageKey: asset.id, url },
            snapshot,
            shots: createAngleShots(snapshot).map((shot): MultiAngleShot => ({ ...shot, status: "missing", prompt: { ...shot.prompt, full: null } })),
        };
        const shot = run.shots[snapshot.shotIndex];
        if (run.snapshot.batch !== snapshot.batch || run.source.storageKey !== asset.id || !shot || shot.status !== "missing") continue;
        const resultUrl = session.status === "success" ? (session.result?.media?.url ?? null) : null;
        shot.url = resultUrl;
        const { h, p } = angleJobs(snapshot)[snapshot.shotIndex];
        shot.prompt = { ...shotPrompt(snapshot, h, p), full: typeof session.input.prompt === "string" && session.input.prompt ? session.input.prompt : null };
        shot.status = resultUrl ? "success" : session.status === "running" || session.status === "queued" ? session.status : "failed";
        batches.set(run.id, run);
    }
    return [...batches.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
