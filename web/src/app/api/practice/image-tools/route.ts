import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getAuthSettings } from "@/lib/auth/store";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { practiceCanvasVirtualModel, practicePoolIncludes, resolvePracticeGenerationCandidates } from "@/lib/server/runninghub-workflow-runtime";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { trustedPracticeTaskHeaders } from "@/lib/server/generation-execution-policy";
import { getPracticeImageToolConfig } from "@/lib/practice-image-tools";
import { buildPracticeReversePromptInstruction } from "@/lib/practice-reverse-prompt";
import { getLocalMediaRegistration, isLocalMediaRegistrationExpired } from "@/lib/server/local-media-registry";
import { createSignedReferenceAssetUrl } from "@/lib/server/reference-asset-access";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { toSafeGenerationErrorMessage } from "@/lib/server/generation-errors";

type ToolRequest = { action?: unknown; toolId?: unknown; sourceUrl?: unknown; maskUrl?: unknown; prompt?: unknown; clientRequestId?: unknown; options?: unknown };

export async function POST(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return errorResponse("请先登录", 401);

    const parsed = await readJsonBodyResult<ToolRequest>(request, 128 * 1024);
    if (!parsed.ok) return errorResponse(parsed.message, parsed.status);
    const body = parsed.data;
    if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("请求内容格式错误", 400);
    // Do not silently ignore privilege/routing overrides. The model and execution profile are server-owned.
    if (["model", "channelId", "provider", "executionProfile", "config"].some((key) => key in body)) return errorResponse("模型与执行环境由练习平台管理，不能由请求指定", 400);

    const tool = getPracticeImageToolConfig(typeof body.toolId === "string" ? body.toolId : "");
    if (!tool || tool.kind === "local-image") return errorResponse("练习工具类型无效", 400);
    const trial = body.action === "try-generate";
    if (body.action !== undefined && (!trial || tool.id !== "reverse-prompt" || Object.keys(body).some((key) => !["action", "toolId", "prompt", "clientRequestId"].includes(key)))) return errorResponse("试生成只支持输入文本提示词", 400);
    const source = trial ? null : await ownReferenceUrl(body.sourceUrl, request.url, user.id);
    if (!trial && !source) return errorResponse("请上传有效的练习图片", 400);
    const mask = body.maskUrl === undefined ? undefined : await ownReferenceUrl(body.maskUrl, request.url, user.id);
    if (body.maskUrl !== undefined && !mask) return errorResponse("编辑蒙版无效，请重新绘制", 400);
    if (tool.id === "local-edit" && !mask) return errorResponse("请先绘制需要修改的蒙版区域", 400);
    const publicOrigin = resolvePublicRequestOrigin(request);
    const sourceUrl = source ? createSignedReferenceAssetUrl(source.storageKey, publicOrigin, user.id) : undefined;
    const maskUrl = mask ? createSignedReferenceAssetUrl(mask.storageKey, publicOrigin, user.id) : undefined;
    if ((!trial && !sourceUrl) || (mask && !maskUrl)) return errorResponse("无法为练习图片创建安全读取凭证，请重新上传", 503);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 20_000) : "";
    if ((trial || tool.id !== "reverse-prompt") && !prompt) return errorResponse(trial ? "请输入生图提示词" : "请填写本次编辑说明", 400);
    const clientRequestId = typeof body.clientRequestId === "string" && /^[\w-]{8,160}$/.test(body.clientRequestId) ? body.clientRequestId : "";
    if (!clientRequestId) return errorResponse("练习请求标识无效，请重试", 400);

    let practiceAccess: Awaited<ReturnType<typeof requirePracticeAccess>>;
    try {
        practiceAccess = await requirePracticeAccess(user);
    } catch (error) {
        const status = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 403;
        return errorResponse(error instanceof Error ? error.message : "当前账号没有无限练习权限", status);
    }

    const capability = !trial && tool.kind === "ai-text" ? "text" : "image";
    const settings = await getAuthSettings();
    const routingContext = { executionProfile: "open-source-practice" as const, ...(capability === "text" ? { requiresImageInput: true } : {}) };
    let configuredModel = trial ? practiceCanvasVirtualModel("image") : capability === "text" ? settings.practiceDefaultModels.visionModel || settings.practiceDefaultModels.textModel : settings.practiceDefaultModels.imageModel;
    let candidates = configuredModel ? resolvePracticeGenerationCandidates(settings, capability, configuredModel, routingContext) : [];
    if (!configuredModel && capability === "text") {
        // When a standalone analysis default has not been set, only use active practice bindings that support images and are not disabled in the vision pool.
        for (const model of settings.logicalModels || []) {
            if (!model.enabled || model.capability !== "text") continue;
            const routes = resolvePracticeGenerationCandidates(settings, "text", model.id, routingContext);
            if (!routes.length || !routes.every((route) => route.capabilityProfile?.supportsImageInput === true && practicePoolIncludes(settings.practiceModelPool, "vision", route.upstreamModel.toLowerCase()))) continue;
            configuredModel = model.id;
            candidates = routes;
            break;
        }
    }
    if (!candidates.length) return errorResponse("当前无限练习模型池没有可用的对应能力模型，请检查练习模型配置", 503);

    const taskContext = {
        surface: "canvas" as const,
        executionProfile: "open-source-practice" as const,
        schoolId: practiceAccess.schoolId,
        clientRequestId,
    };
    const endpoint = capability === "text" ? "/api/text-tasks" : "/api/image-tasks";
    const payload =
        capability === "text"
            ? {
                  config: { model: configuredModel },
                  messages: [
                      {
                          role: "user",
                          content: [
                              { type: "text", text: buildPracticeReversePromptInstruction(prompt) },
                              { type: "image_url", image_url: { url: sourceUrl } },
                          ],
                      },
                  ],
                  context: taskContext,
              }
            : {
                  kind: trial ? "generation" : "edit",
                  config: { model: configuredModel, size: "auto", quality: "auto" },
                  prompt: tool.id === "local-edit" ? `只修改蒙版标示区域，其余区域尽量保持原样。${prompt}` : prompt,
                  references: trial ? [] : [{ type: "image", url: sourceUrl }],
                  ...(maskUrl ? { mask: { type: "image", url: maskUrl } } : {}),
                  source: "practice",
                  title: trial ? "反推提示词 · 试生成" : tool.title,
                  context: taskContext,
              };
    const headers = new Headers({ "Content-Type": "application/json", ...trustedPracticeTaskHeaders(user.id, practiceAccess.schoolId, clientRequestId) });
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    try {
        const upstream = await fetchInternalApi(new URL(endpoint, resolveInternalOrigin(new URL(request.url).origin)), { method: "POST", headers, body: JSON.stringify(payload) });
        const result = (await upstream.json().catch(() => ({}))) as { task?: { id?: unknown; model?: unknown }; error?: unknown };
        if (!upstream.ok || typeof result.task?.id !== "string") return errorResponse(toSafeGenerationErrorMessage(typeof result.error === "string" ? result.error : "练习任务提交失败", "练习任务提交失败"), upstream.status || 502);
        return NextResponse.json({ task: { id: result.task.id, type: capability, model: typeof result.task.model === "string" ? result.task.model : candidates[0]?.logicalModelId || configuredModel } });
    } catch {
        return errorResponse("练习任务提交失败，请稍后重试", 502);
    }
}

async function ownReferenceUrl(value: unknown, requestUrl: string, ownerUserId: string): Promise<{ storageKey: string } | null> {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
        const base = new URL(requestUrl);
        const url = new URL(value, base);
        if (url.origin !== base.origin || !url.pathname.startsWith("/api/reference-assets/")) return null;
        if (url.search || url.hash || url.pathname.includes("..")) return null;
        const storageKey = url.pathname.slice("/api/reference-assets/".length).split("/").map(decodeURIComponent).join("/");
        if (!/^(?:temporary|permanent)\//.test(storageKey)) return null;
        const registration = await getLocalMediaRegistration(storageKey);
        if (!registration || registration.ownerUserId !== ownerUserId || (registration.scope !== "reference" && registration.scope !== "generation") || registration.type !== "image" || isLocalMediaRegistrationExpired(registration)) return null;
        return { storageKey };
    } catch {
        return null;
    }
}

function errorResponse(error: string, status: number) {
    return NextResponse.json({ error }, { status });
}
