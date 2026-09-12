import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getPracticeSessionForUser, retryPracticeSessionForUser, deletePracticeSession } from "@/lib/server/practice-session-service";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { trustedPracticeTaskHeaders } from "@/lib/server/generation-execution-policy";
import { practiceReferenceMediaUrl } from "@/lib/server/practice-reference-authorization";
import { recordWorkflowTaskContext } from "@/lib/server/runninghub-workflow-runtime";

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
        const parsed = await readJsonBodyResult<unknown>(request, 64 * 1024);
        if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
        const body = parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data) ? (parsed.data as { action?: unknown }) : {};
        if (body.action !== "retry") return NextResponse.json({ code: 400, data: null, msg: "练习操作无效" }, { status: 400 });
        const sessionId = (await context.params).id;
        const session = await retryPracticeSessionForUser(user, sessionId, { dispatch: (input) => dispatchPracticeTask(request, input) });
        return NextResponse.json({ code: 0, data: { session }, msg: "练习已重新提交" });
    } catch (error) {
        const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "练习重试失败" }, { status });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const sessionId = (await context.params).id;
        await deletePracticeSession(user.id, sessionId);
        return NextResponse.json({ code: 0, data: { success: true }, msg: "OK" });
    } catch (error) {
        const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "删除练习记录失败" }, { status });
    }
}

async function dispatchPracticeTask(request: Request, input: import("@/lib/server/practice-session-service").PracticeTaskDispatchInput) {
    const endpoint = input.capability === "text" ? "/api/text-tasks" : input.capability === "image" ? "/api/image-tasks" : input.capability === "video" ? "/api/video-generation-tasks" : "/api/audio-tasks";
    const context = {
        surface: input.projectKind === "drama" ? "drama" : "canvas",
        executionProfile: "open-source-practice" as const,
        schoolId: input.schoolId,
        projectId: input.sessionId,
        clientRequestId: input.clientRequestId,
        ...(input.workflow
            ? {
                  ...recordWorkflowTaskContext(input.workflow),
                  taskOrigin: "user" as const,
              }
            : {}),
    };
    const rawPrompt = typeof input.input.prompt === "string" ? input.input.prompt.trim() : typeof input.input.text === "string" ? input.input.text.trim() : "";
    // 任务路由要求非空 prompt；角色多视图等允许空描述词的工作流用占位标题提交，并把空 prompt 显式写进工作流输入，避免占位文本注入节点.
    const prompt = rawPrompt || "练习任务";
    const workflowInput = { ...Object.fromEntries(Object.entries(input.input).filter(([key]) => key !== "prompt" && key !== "text" && key !== "references")), ...(rawPrompt ? {} : { prompt: "" }) };
    const references = input.references.flatMap((reference) => {
        if (!reference || typeof reference !== "object" || Array.isArray(reference)) return [];
        const source = reference as { type?: unknown; id?: unknown; inputKey?: unknown; scope?: unknown };
        if (source.type !== "asset" || typeof source.id !== "string" || !source.id.trim()) return [];
        const inputKey = normalizePracticeReferenceInputKey(source.inputKey);
        return [{ type: inputKey === "audio" ? ("audio" as const) : ("image" as const), url: practiceReferenceMediaUrl(source.id, source.scope), ...(inputKey ? { inputKey } : {}) }];
    });
    const body =
        input.capability === "text"
            ? { ...workflowInput, config: { model: input.logicalModelId }, messages: [{ role: "user", content: prompt }], context }
            : input.capability === "audio"
              ? { ...workflowInput, input: workflowInput, config: { model: input.logicalModelId }, prompt, context, source: "practice" }
              : { ...workflowInput, config: { model: input.logicalModelId }, prompt, references, context, source: "practice" };
    const headers = new Headers({ "Content-Type": "application/json", ...trustedPracticeTaskHeaders(input.userId, input.schoolId, input.clientRequestId) });
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const response = await fetchInternalApi(new URL(endpoint, resolveInternalOrigin(new URL(request.url).origin)), { method: "POST", headers, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string }; error?: string };
    if (!response.ok || !payload.task?.id) throw new Error(payload.error || "练习重试调度失败");
    return { taskId: payload.task.id, taskType: input.capability };
}

function normalizePracticeReferenceInputKey(value: unknown) {
    const key = typeof value === "string" ? value.trim() : "";
    return ["referenceImage", "firstFrameImage", "lastFrameImage", "sceneImage", "characterPropImage1", "characterPropImage2", "characterPropImage3", "image", "audio"].includes(key) ? key : undefined;
}
