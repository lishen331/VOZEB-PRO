import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { createScriptPracticeRepository } from "@/lib/server/database/script-practice-repository";
import { createScriptAgentService } from "@/lib/server/script-practice-agent-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 256 * 1024);
    if (!parsed.ok) return response(parsed.status, parsed.message);
    try {
        await requirePracticeAccess(user);
        if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) return response(400, "请求参数无效");
        const operation = parsed.data.operation;
        if (typeof operation !== "string" || !["rewrite_selection", "expand_selection", "polish_selection", "enhance_conflict", "check_continuity", "validate_format"].includes(operation)) return response(400, "剧本 Agent 操作无效");
        const baseVersionId = typeof parsed.data.baseVersionId === "string" ? parsed.data.baseVersionId.trim() : "";
        const targetBlockIds = Array.isArray(parsed.data.targetBlockIds)
            ? parsed.data.targetBlockIds
                  .filter((item): item is string => typeof item === "string")
                  .map((item) => item.trim())
                  .filter(Boolean)
            : [];
        if (!baseVersionId || !targetBlockIds.length) return response(400, "缺少剧本版本或选区");
        const service = createScriptAgentService({ repository: createScriptPracticeRepository() });
        return ok(await service.propose(user.id, (await context.params).id, { operation: operation as never, baseVersionId, targetBlockIds, instruction: typeof parsed.data.instruction === "string" ? parsed.data.instruction.trim() : "" }));
    } catch (error) {
        return failure(error, "剧本 Agent 请求失败");
    }
}
function ok<T>(data: T) {
    return NextResponse.json({ code: 0, data, msg: "ok" });
}
function response(code: number, msg: string) {
    return NextResponse.json({ code, data: null, msg }, { status: code });
}
function failure(error: unknown, fallback: string) {
    const status = error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return response(status, status === 500 ? fallback : error instanceof Error ? error.message : fallback);
}
