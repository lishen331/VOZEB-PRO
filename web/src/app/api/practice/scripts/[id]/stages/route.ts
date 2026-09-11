import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { createScriptPracticeRepository } from "@/lib/server/database/script-practice-repository";
import { confirmScriptStage, createScriptStageService } from "@/lib/server/script-practice-stage-service";
import type { ScriptAgentOperation, ScriptStageKey } from "@/lib/script-practice-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const GENERATE_OPERATIONS = ["generate_synopsis", "generate_outline", "generate_entities", "generate_scenes", "generate_screenplay"] as const;
const STAGE_KEYS = ["idea", "synopsis", "outline", "entities", "scenes", "screenplay", "revision"] as const;

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 512 * 1024);
    if (!parsed.ok) return response(parsed.status, parsed.message);
    try {
        await requirePracticeAccess(user);
        if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) return response(400, "请求参数无效");
        const projectId = (await context.params).id;
        const repository = createScriptPracticeRepository();
        if (parsed.data.confirm === true) {
            if (!isStageKey(parsed.data.stage)) return response(400, "剧本阶段无效");
            return ok(await confirmScriptStage(repository, user.id, projectId, parsed.data.stage));
        }
        if (!isGenerateOperation(parsed.data.operation)) return response(400, "剧本阶段生成操作无效");
        return ok(await createScriptStageService({ repository }).generate(user.id, projectId, parsed.data.operation, parsed.data.stageInput));
    } catch (error) {
        return failure(error, "剧本阶段请求失败");
    }
}
function isGenerateOperation(value: unknown): value is ScriptAgentOperation {
    return typeof value === "string" && (GENERATE_OPERATIONS as readonly string[]).includes(value);
}
function isStageKey(value: unknown): value is ScriptStageKey {
    return typeof value === "string" && (STAGE_KEYS as readonly string[]).includes(value);
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
