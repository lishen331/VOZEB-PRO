import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
import { scriptAgentProfileDefaults, BUILTIN_SCRIPT_SKILLS } from "@/lib/server/script-agent-skills";
export async function GET(request: Request) {
    const user = await getCurrentUser(request);
    if (!user || !hasAdminPermission(user, "upstream.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要上游配置权限" }, { status: 403 });
    const repository = new ScriptAgentRepository({ query: postgresQuery });
    const profiles = await Promise.all(
        scriptAgentProfileDefaults().map(async (seed) => (await repository.getAgentProfile(seed.agentKey)) || { ...seed, enabled: true, primaryLogicalModelId: "", fallbackLogicalModelId: "", outputPolicy: {}, timeoutConfig: {}, version: 1 }),
    );
    return NextResponse.json({
        code: 0,
        data: { profiles, skills: BUILTIN_SCRIPT_SKILLS.map(({ markdown, ...skill }) => ({ ...skill, contentLength: markdown.length })), toolCount: new Set(profiles.flatMap((item) => item.toolAllowlist)).size },
        msg: "ok",
    });
}
