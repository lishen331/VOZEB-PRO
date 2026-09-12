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
        `INSERT INTO practice_script_agent_profiles (agent_key, name, enabled, primary_logical_model_id, fallback_logical_model_id, endpoint_id, temperature, reasoning_mode, updated_by)
         VALUES ($1, $9, $2, $3, $4, $5, $6::numeric, $7, $8)
         ON CONFLICT (agent_key) DO UPDATE SET enabled=EXCLUDED.enabled, primary_logical_model_id=EXCLUDED.primary_logical_model_id, fallback_logical_model_id=EXCLUDED.fallback_logical_model_id, endpoint_id=EXCLUDED.endpoint_id, temperature=EXCLUDED.temperature, reasoning_mode=EXCLUDED.reasoning_mode, version=practice_script_agent_profiles.version+1, updated_by=EXCLUDED.updated_by, updated_at=now() RETURNING *`,
        [
            agentKey,
            parsed.data.enabled !== false,
            model,
            fallback,
            typeof parsed.data.endpointId === "string" ? parsed.data.endpointId.trim() || null : null,
            typeof parsed.data.temperature === "number" ? parsed.data.temperature : null,
            typeof parsed.data.reasoningMode === "string" ? parsed.data.reasoningMode : "medium",
            user.id,
            typeof parsed.data.name === "string" && parsed.data.name.trim() ? parsed.data.name.trim() : agentKey,
        ],
    );
    return reply(0, result.rows[0] || null, "ok");
}
function reply<T>(code: number, data: T | null, msg: string) {
    return NextResponse.json({ code, data, msg }, { status: code === 0 ? 200 : code });
}
