import type { LogicalModelCapability } from "@/lib/auth/store";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery } from "@/lib/server/database";

export type ChannelRateLimit = { requestsPerMinute: number; burst: number };

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

function bucketKey(capability: LogicalModelCapability, channelId: string) {
    return `${capability}:${channelId}`;
}

export function resetChannelRateLimits() {
    buckets.clear();
}

/** Takes one token from the channel/model bucket; false when this second's budget is spent. */
export async function takeChannelRateToken(capability: LogicalModelCapability, channelId: string, upstreamModel: string, limit: ChannelRateLimit) {
    const burst = Math.max(1, limit.burst);
    const perSecond = Math.max(0, limit.requestsPerMinute) / 60;
    if (!perSecond) return true;
    const slot = bucketKey(capability, channelId);
    if (getDatabaseProvider() !== "postgres") {
        const key = `${slot}:${upstreamModel}`;
        const now = Date.now();
        const current = buckets.get(key) || { tokens: burst, updatedAt: now };
        const tokens = Math.min(burst, current.tokens + ((now - current.updatedAt) / 1000) * perSecond);
        if (tokens < 1) {
            buckets.set(key, { tokens, updatedAt: now });
            return false;
        }
        buckets.set(key, { tokens: tokens - 1, updatedAt: now });
        return true;
    }
    await ensurePostgresSchema();
    // 单条语句原子补充并扣减令牌，多进程共享同一个桶；令牌不足时 WHERE 不成立、不返回行。
    const result = await postgresQuery(
        `INSERT INTO channel_rate_limits AS bucket (channel_id, upstream_model, tokens, updated_at)
         VALUES ($1, $2, $3::double precision - 1, clock_timestamp())
         ON CONFLICT (channel_id, upstream_model) DO UPDATE
            SET tokens = LEAST($3::double precision, bucket.tokens + EXTRACT(EPOCH FROM clock_timestamp() - bucket.updated_at) * $4::double precision) - 1,
                updated_at = clock_timestamp()
          WHERE LEAST($3::double precision, bucket.tokens + EXTRACT(EPOCH FROM clock_timestamp() - bucket.updated_at) * $4::double precision) >= 1
         RETURNING tokens`,
        [slot, upstreamModel, burst, perSecond],
    );
    return result.rows.length > 0;
}
