import { NextRequest, NextResponse } from "next/server";
import { getAuthSettings, setAuthSettings } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBody } from "@/lib/auth/request";
import type { PracticeModelPoolConfig } from "@/lib/auth/store-types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/practice-model-pool
 *
 * Update practice model pool configuration.
 *
 * Request body:
 * {
 *   "updates": {
 *     "model-name-1": true,   // Include in pool
 *     "model-name-2": false,  // Exclude from pool
 *   }
 * }
 */
export async function PATCH(request: NextRequest) {
    const user = await getCurrentUser(request);
    if (!user || user.role !== "admin") {
        return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await readJsonBody<{ updates?: Record<string, unknown> }>(request);
    const { updates } = body;

    if (!updates || typeof updates !== "object") {
        return NextResponse.json({ error: "无效的请求格式" }, { status: 400 });
    }

    const settings = await getAuthSettings();
    const currentPool = settings.practiceModelPool || { models: {}, version: 1 };

    // Merge updates
    const updatedModels = { ...currentPool.models };
    for (const [modelName, included] of Object.entries(updates)) {
        const key = modelName.toLowerCase();
        if (typeof included === "boolean") {
            updatedModels[key] = included;
        }
    }

    const newPoolConfig: PracticeModelPoolConfig = {
        models: updatedModels,
        version: currentPool.version || 1,
    };

    await setAuthSettings({
        ...settings,
        practiceModelPool: newPoolConfig,
    });

    return NextResponse.json({ success: true });
}
