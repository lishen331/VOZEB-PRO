import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { postgresQuery } from "@/lib/server/database/postgres";
import { isScriptAgentKey } from "@/lib/server/script-agent-domain";
type Context = { params: Promise<{ agentKey: string }> };
export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user || !hasAdminPermission(user, "upstream.manage")) return reply(403, null, "需要上游配置权限");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 128 * 1024);
    if (!parsed.ok) return reply(parsed.status, null, parsed.message);
    const { agentKey } = await context.params;
    if (!isScriptAgentKey(agentKey)) return reply(400, null, "Agent 无效");
    const model = typeof parsed.data.primaryLogicalModelId === "string" ? parsed.data.primaryLogicalModelId.trim() : "";
    const fallback = typeof parsed.data.fallbackLogicalModelId === "string" ? parsed.data.fallbackLogicalModelId.trim() : "";
    const result = await postgresQuery(
        `UPDATE practice_script_agent_profiles SET enabled=$2, primary_logical_model_id=$3, fallback_logical_model_id=$4, endpoint_id=$5, temperature=$6::numeric, reasoning_mode=$7, version=version+1, updated_by=$8, updated_at=now() WHERE agent_key=$1 RETURNING *`,
        [
            agentKey,
            parsed.data.enabled !== false,
            model,
            fallback,
            typeof parsed.data.endpointId === "string" ? parsed.data.endpointId.trim() || null : null,
            typeof parsed.data.temperature === "number" ? parsed.data.temperature : null,
            typeof parsed.data.reasoningMode === "string" ? parsed.data.reasoningMode : "medium",
            user.id,
        ],
    );
    return reply(0, result.rows[0] || null, "ok");
}
function reply<T>(code: number, data: T | null, msg: string) {
    return NextResponse.json({ code, data, msg }, { status: code === 0 ? 200 : code });
}
