import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getFreshAuthSettings } from "@/lib/auth/store";
import { normalizeModelId } from "@/lib/model-capability";
import { createChannelProtocolDraft, ProtocolDraftError } from "@/lib/server/channel-protocol-assistant";
import { getProtocolAnalysisHistory, recordProtocolAnalysis, sanitizeProtocolHistory } from "@/lib/server/protocol-analysis-history";
import type { AdminChannelProtocolInput } from "@/services/api/admin-channel-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type DraftBody = AdminChannelProtocolInput & { channelId?: string; targetModel?: string };
async function validateScope(channelId: unknown, targetModel: unknown) {
    if (typeof channelId !== "string" || !channelId || typeof targetModel !== "string" || !targetModel.trim()) throw new ProtocolDraftError("缺少渠道和当前上游模型", 400);
    const settings = await getFreshAuthSettings();
    const channel = settings.systemChannels.find((item) => item.id === channelId);
    const model = normalizeModelId(targetModel);
    const bound = settings.logicalModels.some((item) => item.bindings.some((binding) => binding.channelId === channelId && normalizeModelId(binding.upstreamModel) === model));
    if (!channel || !bound) throw new ProtocolDraftError("当前渠道模型绑定不存在", 404);
    return { channelId, model };
}
export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "upstream.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    try {
        const params = new URL(request.url).searchParams;
        const scope = await validateScope(params.get("channelId"), params.get("targetModel"));
        return NextResponse.json({ history: await getProtocolAnalysisHistory(scope.channelId, scope.model) }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        return NextResponse.json({ error: error instanceof ProtocolDraftError ? error.message : "读取分析历史失败" }, { status: error instanceof ProtocolDraftError ? error.status : 500 });
    }
}
export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "upstream.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    let scope: { channelId: string; model: string } | undefined;
    let input: AdminChannelProtocolInput | undefined;
    try {
        const body = await readJsonBody<DraftBody>(request, 1024 * 1024);
        if (body.targetModel !== undefined || body.channelId !== undefined) scope = await validateScope(body.channelId, body.targetModel);
        if (body.referenceTypes !== undefined && (!Array.isArray(body.referenceTypes) || body.referenceTypes.some((type) => !["image", "video", "audio"].includes(type)))) throw new ProtocolDraftError("参考输入类型无效", 400);
        input = { documentationUrl: body.documentationUrl, documentationText: body.documentationText, examples: body.examples, useTextModel: body.useTextModel, ...(body.referenceTypes ? { referenceTypes: Array.from(new Set(body.referenceTypes)) } : {}) };
        let result;
        try {
            result = await createChannelProtocolDraft({ requestUrl: request.url, cookie: request.headers.get("cookie") || "", userId: currentUser.id, targetModel: scope?.model, ...input });
        } catch (error) {
            if (scope) await recordProtocolAnalysis({ ...scope, input, error: error instanceof Error ? error.message : "协议分析失败" });
            throw error;
        }
        if (scope) await recordProtocolAnalysis({ ...scope, input, result });
        return NextResponse.json({ ...sanitizeProtocolHistory(result), draft: sanitizeProtocolHistory(result.drafts[0]) }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        if (error instanceof ProtocolDraftError) return NextResponse.json({ error: sanitizeProtocolHistory(error.message) }, { status: error.status });
        console.error("Channel protocol draft failed", error instanceof Error ? sanitizeProtocolHistory(error.message) : "unknown error");
        return NextResponse.json({ error: "协议分析失败或历史保存失败，请检查文档或示例" }, { status: 502 });
    }
}
