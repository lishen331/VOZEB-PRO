import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { getFreshAuthSettings } from "@/lib/auth/store";
import { normalizeRunningHubWorkflowConfig } from "@/lib/server/runninghub-workflow-domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user || !hasAdminPermission(user, "upstream.manage")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workflowKey = request.nextUrl.searchParams.get("key");
    if (!workflowKey) {
        return Response.json({ error: "Missing workflow key" }, { status: 400 });
    }

    const settings = await getFreshAuthSettings();

    // Find workflow in all channels
    for (const channel of settings.systemChannels) {
        if (channel.advancedConfig?.protocol !== "runninghub") continue;

        const config = channel.advancedConfig.workflowConfigs?.[workflowKey];
        if (config) {
            const normalized = normalizeRunningHubWorkflowConfig(config);
            return Response.json({
                workflowKey: normalized.workflowKey,
                workflowName: normalized.workflowName,
                workflowId: normalized.workflowId,
                businessCode: normalized.businessCode,
                capability: normalized.capability,
                inputSchema: normalized.inputSchema,
                nodeMappings: normalized.nodeMappings,
                outputMappings: normalized.outputMappings,
            });
        }
    }

    return Response.json({ error: "Workflow not found" }, { status: 404 });
}
