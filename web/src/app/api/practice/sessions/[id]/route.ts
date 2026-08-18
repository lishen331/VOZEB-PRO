import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getPracticeSessionForUser, retryPracticeSessionForUser } from "@/lib/server/practice-session-service";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { trustedPracticeTaskHeaders } from "@/lib/server/generation-execution-policy";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const session = await getPracticeSessionForUser(user, (await context.params).id);
        return NextResponse.json({ code: 0, data: { session }, msg: "OK" });
    } catch (error) {
        const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "练习会话请求失败" }, { status });
    }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const body = (await request.json().catch(() => ({}))) as { action?: string };
        if (body.action !== "retry") return NextResponse.json({ code: 400, data: null, msg: "练习操作无效" }, { status: 400 });
        const sessionId = (await context.params).id;
        const session = await retryPracticeSessionForUser(user, sessionId, { dispatch: (input) => dispatchPracticeTask(request, input) });
        return NextResponse.json({ code: 0, data: { session }, msg: "练习已重新提交" });
    } catch (error) {
        const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "练习重试失败" }, { status });
    }
}

async function dispatchPracticeTask(request: Request, input: import("@/lib/server/practice-session-service").PracticeTaskDispatchInput) {
    const endpoint = input.capability === "text" ? "/api/text-tasks" : input.capability === "image" ? "/api/image-tasks" : input.capability === "video" ? "/api/video-generation-tasks" : "/api/audio-tasks";
    const context = { surface: input.projectKind === "drama" ? "drama" : "canvas", executionProfile: "open-source-practice", projectId: input.sessionId, clientRequestId: input.clientRequestId };
    const prompt = typeof input.input.prompt === "string" ? input.input.prompt : "练习任务";
    const body = input.capability === "text" ? { config: { model: input.logicalModelId }, messages: [{ role: "user", content: prompt }], context } : input.capability === "audio" ? { config: { model: input.logicalModelId }, prompt, context, source: "practice" } : { config: { model: input.logicalModelId }, prompt, references: input.references, context, source: "practice" };
    const headers = new Headers({ "Content-Type": "application/json", ...trustedPracticeTaskHeaders(input.userId, input.clientRequestId) });
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const response = await fetchInternalApi(new URL(endpoint, resolveInternalOrigin(new URL(request.url).origin)), { method: "POST", headers, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string }; error?: string };
    if (!response.ok || !payload.task?.id) throw new Error(payload.error || "练习重试调度失败");
    return { taskId: payload.task.id, taskType: input.capability };
}
