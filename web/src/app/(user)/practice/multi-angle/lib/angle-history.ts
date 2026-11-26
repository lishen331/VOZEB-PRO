import { parseMultiAngleHistoryShot, type MultiAngleHistoryShot } from "@/lib/practice-multi-angle-history";
import type { PracticeSession } from "@/services/api/practice";
import { serverMediaUrl } from "@/services/server-media-storage";

import { BATCH_ANGLES, singleShotName } from "./angle-model";

export type MultiAngleShot = { name: string; url: string | null; status: "queued" | "running" | "success" | "failed" | "missing" };
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
            shots: angleJobs(snapshot).map(({ name }): MultiAngleShot => ({ name, url: null, status: "missing" })),
        };
        const shot = run.shots[snapshot.shotIndex];
        if (run.snapshot.batch !== snapshot.batch || run.source.storageKey !== asset.id || !shot || shot.status !== "missing") continue;
        const resultUrl = session.status === "success" ? (session.result?.media?.url ?? null) : null;
        shot.url = resultUrl;
        shot.status = resultUrl ? "success" : session.status === "running" || session.status === "queued" ? session.status : "failed";
        batches.set(run.id, run);
    }
    return [...batches.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
