import { NextRequest, NextResponse } from "next/server";
import { getAuthSettings, setAuthSettings } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBody } from "@/lib/auth/request";
import type { PracticeModelPoolConfig, PracticePoolKind } from "@/lib/auth/store-types";

export const dynamic = "force-dynamic";

const POOL_KINDS: PracticePoolKind[] = ["text", "vision", "image", "video", "audio"];

function isPoolKind(value: unknown): value is PracticePoolKind {
    return typeof value === "string" && (POOL_KINDS as string[]).includes(value);
}

/**
 * PATCH /api/admin/practice-model-pool
 *
 * 按池更新勾选状态。
 *
 * 新格式（五个能力池各自独立）：
 * {
 *   "pool": "text" | "vision" | "image" | "video" | "audio",
 *   "updates": { "model-name": true }
 * }
 *
 * 兼容格式（写入旧的平面池）：
 * { "updates": { "model-name": true } }
 */
export async function PATCH(request: NextRequest) {
    const user = await getCurrentUser(request);
    if (!user || user.role !== "admin") {
        return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await readJsonBody<{ updates?: Record<string, unknown>; pool?: unknown }>(request);
    const { updates, pool } = body;

    if (!updates || typeof updates !== "object") {
        return NextResponse.json({ error: "无效的请求格式" }, { status: 400 });
    }
    if (pool !== undefined && !isPoolKind(pool)) {
        return NextResponse.json({ error: "模型池类型无效" }, { status: 400 });
    }

    const settings = await getAuthSettings();
    const currentPool = settings.practiceModelPool || { models: {}, version: 1 };

    const normalized = Object.fromEntries(
        Object.entries(updates)
            .filter(([, included]) => typeof included === "boolean")
            .map(([modelName, included]) => [modelName.toLowerCase(), included as boolean]),
    );

    const nextPool: PracticeModelPoolConfig = isPoolKind(pool)
        ? {
              ...currentPool,
              pools: { ...currentPool.pools, [pool]: { ...currentPool.pools?.[pool], ...normalized } },
              version: currentPool.version || 1,
          }
        : {
              ...currentPool,
              models: { ...currentPool.models, ...normalized },
              version: currentPool.version || 1,
          };

    await setAuthSettings({ ...settings, practiceModelPool: nextPool });

    return NextResponse.json({ success: true, pool: isPoolKind(pool) ? pool : "legacy" });
}
