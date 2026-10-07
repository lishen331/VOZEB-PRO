import type { LogicalModelCapability } from "@/lib/auth/store";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery, withPostgresTransaction } from "@/lib/server/database";

export const CHANNEL_SATURATED_MESSAGE = "当前使用人数较多，请稍后再试";

export class ChannelSaturatedError extends Error {
    constructor(message = CHANNEL_SATURATED_MESSAGE) {
        super(message);
        this.name = "ChannelSaturatedError";
    }
}

const DEFAULT_RESERVATION_TTL_MS = 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set(["success", "error", "cancelled", "completed", "failed", "canceled"]);

// requestId -> expiresAt, grouped by "capability:channelId:upstreamModel".
// Authoritative in file mode; a same-process hint for the router in postgres mode.
const slots = new Map<string, Map<string, number>>();
const requestKeys = new Map<string, string>();

export function channelReservationTtlMs() {
    const configured = Number(process.env.VOZEB_PRO_CHANNEL_RESERVATION_TTL_MS);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RESERVATION_TTL_MS;
}

function concurrencyKey(capability: LogicalModelCapability, channelId: string, upstreamModel: string) {
    return `${capability}:${channelId}:${upstreamModel}`;
}

function slotId(capability: LogicalModelCapability, channelId: string) {
    return `${capability}:${channelId}`;
}

function liveHolders(key: string, now = Date.now()) {
    const holders = slots.get(key);
    if (!holders) return undefined;
    for (const [requestId, expiresAt] of holders) {
        if (expiresAt > now) continue;
        holders.delete(requestId);
        if (requestKeys.get(requestId) === key) requestKeys.delete(requestId);
    }
    if (!holders.size) slots.delete(key);
    return holders.size ? holders : undefined;
}

function remember(key: string, requestId: string, expiresAt: number) {
    const previous = requestKeys.get(requestId);
    if (previous && previous !== key) slots.get(previous)?.delete(requestId);
    const holders = slots.get(key) || new Map<string, number>();
    holders.set(requestId, expiresAt);
    slots.set(key, holders);
    requestKeys.set(requestId, key);
}

function forget(requestId: string) {
    const key = requestKeys.get(requestId);
    if (!key) return;
    requestKeys.delete(requestId);
    const holders = slots.get(key);
    holders?.delete(requestId);
    if (holders && !holders.size) slots.delete(key);
}

export function channelInFlight(capability: LogicalModelCapability, channelId: string, upstreamModel: string) {
    return liveHolders(concurrencyKey(capability, channelId, upstreamModel))?.size || 0;
}

export function channelHasCapacity(capability: LogicalModelCapability, channelId: string, upstreamModel: string, limit?: number) {
    if (!limit || limit <= 0) return true;
    return channelInFlight(capability, channelId, upstreamModel) < limit;
}

export function resetChannelConcurrency() {
    slots.clear();
    requestKeys.clear();
}

/** Reserves one in-flight slot. Re-reserving the same requestId is idempotent and refreshes its expiry. */
export async function reserveChannelSlot(capability: LogicalModelCapability, channelId: string, upstreamModel: string, requestId: string, limit?: number, ttlMs = channelReservationTtlMs()) {
    if (!limit || limit <= 0) return true;
    const key = concurrencyKey(capability, channelId, upstreamModel);
    const expiresAt = Date.now() + ttlMs;
    if (getDatabaseProvider() !== "postgres") {
        const holders = liveHolders(key);
        if (!holders?.has(requestId) && (holders?.size || 0) >= limit) return false;
        remember(key, requestId, expiresAt);
        return true;
    }
    await ensurePostgresSchema();
    const slot = slotId(capability, channelId);
    const reserved = await withPostgresTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [slot, upstreamModel]);
        await client.query("DELETE FROM channel_concurrency_reservations WHERE channel_id = $1 AND upstream_model = $2 AND expires_at <= now()", [slot, upstreamModel]);
        const renewed = await client.query("UPDATE channel_concurrency_reservations SET expires_at = $4 WHERE channel_id = $1 AND upstream_model = $2 AND request_id = $3 RETURNING request_id", [slot, upstreamModel, requestId, new Date(expiresAt)]);
        if (renewed.rows.length) return true;
        const counted = await client.query<{ total: string | number }>("SELECT count(*) AS total FROM channel_concurrency_reservations WHERE channel_id = $1 AND upstream_model = $2", [slot, upstreamModel]);
        if (Number(counted.rows[0]?.total || 0) >= limit) return false;
        await client.query("INSERT INTO channel_concurrency_reservations (channel_id, upstream_model, request_id, expires_at) VALUES ($1, $2, $3, $4)", [slot, upstreamModel, requestId, new Date(expiresAt)]);
        return true;
    });
    if (reserved) remember(key, requestId, expiresAt);
    return reserved;
}

export async function releaseChannelReservations(requestIds: string[]) {
    const ids = [...new Set(requestIds.filter(Boolean))];
    if (!ids.length) return;
    for (const requestId of ids) forget(requestId);
    if (getDatabaseProvider() !== "postgres") return;
    await ensurePostgresSchema();
    await postgresQuery("DELETE FROM channel_concurrency_reservations WHERE request_id = ANY($1::text[])", [ids]);
}

/** Extends live reservations only; an already-expired reservation is not resurrected. */
export async function renewChannelReservations(requestIds: string[], ttlMs = channelReservationTtlMs()) {
    const ids = [...new Set(requestIds.filter(Boolean))];
    if (!ids.length) return;
    const expiresAt = Date.now() + ttlMs;
    for (const requestId of ids) {
        const key = requestKeys.get(requestId);
        const holders = key ? liveHolders(key) : undefined;
        if (key && holders?.has(requestId)) holders.set(requestId, expiresAt);
    }
    if (getDatabaseProvider() !== "postgres") return;
    await ensurePostgresSchema();
    await postgresQuery("UPDATE channel_concurrency_reservations SET expires_at = $2 WHERE request_id = ANY($1::text[]) AND expires_at > now()", [ids, new Date(expiresAt)]);
}

type ReservationHolder = { status?: unknown; attempts?: unknown };

/** Releases every reservation recorded on a task once it reaches a terminal status. Never throws. */
export async function releaseTerminalTaskReservations(task: ReservationHolder | null | undefined) {
    if (!task || typeof task.status !== "string" || !TERMINAL_STATUSES.has(task.status.trim().toLowerCase())) return;
    if (!Array.isArray(task.attempts)) return;
    const ids = task.attempts.map((attempt) => (attempt && typeof attempt === "object" ? (attempt as { reservationId?: unknown }).reservationId : undefined)).filter((id): id is string => typeof id === "string" && Boolean(id));
    if (!ids.length) return;
    try {
        await releaseChannelReservations(ids);
    } catch (error) {
        console.error("Channel reservation release failed", { requestIds: ids, error });
    }
}
