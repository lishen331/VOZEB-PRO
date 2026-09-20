import { assertCustomProtocolReferenceMapping } from "@/lib/custom-protocol-reference-preflight";
import { parseBindingVerificationInput } from "@/lib/binding-verification-input";
import { bindingVerificationFixtures } from "./binding-verification-fixtures";
export { bindingVerificationFixtures } from "./binding-verification-fixtures";
import { createHash, randomBytes } from "node:crypto";
import { imageReferenceToDataUrl } from "@/app/api/image-tasks/image-task-support";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { fileTypeFromBlob } from "file-type";
import { openAsBlob } from "node:fs";
import { channelConnectionReady } from "@/lib/channel-protocol-registry";
import { getFreshAuthSettings, type PublicUser } from "@/lib/auth/store";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { resolveLogicalModelCapabilityProfile } from "@/lib/model-routing-config";
import { creativeUploadMaxBytes } from "@/lib/creative-upload";
import { bindingVerificationFingerprint } from "./binding-verification-policy";
import { recordBindingVerificationDiagnostic, completeBindingVerification, createBindingVerification, getBindingVerification, updateBindingVerification, claimBindingVerification, type BindingVerificationRun } from "./binding-verification-store";
import { withBindingVerificationScope } from "./binding-verification-authority";
import { toSystemGenerationChannel } from "./generation-channel";
import { assertCapabilityConstraints } from "./capability-constraints";
import { scheduleGenerationTask } from "./generation-task-scheduler";
import { resolveModelRequestTimeoutMs } from "./model-request-policy";
import { resolveUpstreamVideoDuration } from "./video-task-config";
import { createTextTask, getTextTask } from "./text-task-store";
import { runTextTaskStep } from "./text-task-runtime";
import { createImageTask, getImageTask } from "./image-task-store";
import { createImageTaskUpstreamStep, queryImageTaskUpstreamStep, persistImageTaskResult } from "./image-task-runtime";
import { createVideoTask, getVideoTask, updateVideoTask } from "./video-task-store";
import { createUpstream } from "@/app/api/video-generation-tasks/video-generation-route";
import { queryVideoTaskUpstream, persistVideoTaskResult } from "./video-task-runtime";
import { resolveInternalOrigin } from "./internal-origin";
import { downloadMediaToFile } from "./media-download";
import { runFfprobe, runFfmpeg } from "./ffmpeg";
import { GenerationSubmissionUncertainError } from "./generation-submission-error";
import { assertReferenceCapabilities, assertReferenceUrls, assertVideoReferenceRoles } from "./provider-task-config";
import { resolveGlobalAiOpcPreset } from "@/lib/globalaiopc-catalog";

const PROMPT = "参考图片中的橙色小球，生成同一小球在白色桌面上的画面，保持颜色与形状一致。";
export function publicBindingVerification(run: BindingVerificationRun) {
    return {
        id: run.id,
        platformTaskId: run.taskId,
        upstreamTaskId: run.upstreamTaskId,
        status: run.status,
        phase: run.phase,
        ...(run.error ? { error: run.error } : {}),
        ...(run.result ? { result: run.result } : {}),
        ...(run.diagnostics ? { diagnostics: run.diagnostics } : {}),
        fixtureUrls: run.fixtureUrls,
        ...(run.input ? { input: run.input } : {}),
    };
}
async function target(logicalModelId: string, bindingId: string) {
    const settings = await getFreshAuthSettings();
    const model = settings.logicalModels.find((item) => item.id === logicalModelId);
    const binding = model?.bindings.find((item) => item.id === bindingId);
    const channel = settings.systemChannels.find((item) => item.id === binding?.channelId);
    if (!model || !binding || !channel) throw new Error("逻辑模型或渠道绑定不存在");
    if (!["text", "image", "video"].includes(model.capability)) throw new Error("当前绑定验证仅支持文本、图片、视频");
    if (channel.advancedConfig?.protocol === "runninghub") throw new Error("RunningHub 请使用工作流验证");
    if (!channelConnectionReady(channel)) throw new Error("请先保存完整的渠道连接配置");
    const config = toSystemGenerationChannel({
        logicalModelId: model.id,
        channelId: channel.id,
        upstreamModel: binding.upstreamModel,
        channel,
        capabilityProfile: resolveLogicalModelCapabilityProfile(binding, model.capability, channel, binding.upstreamModel),
    });
    return { settings, model, binding, channel, config, fingerprint: bindingVerificationFingerprint(model, binding, channel) };
}
export async function startBindingVerification(input: { logicalModelId: string; bindingId: string; user: PublicUser; publicOrigin: string; input?: unknown }) {
    if (!hasAdminPermission(input.user, "upstream.manage")) throw new Error("需要上游配置管理员权限");
    const resolved = await target(input.logicalModelId, input.bindingId);
    const capability = resolved.model.capability as BindingVerificationRun["capability"];
    const requestedInput = input.input === undefined ? undefined : parseBindingVerificationInput(input.input, capability);
    return createBindingVerification({
        userId: input.user.id,
        logicalModelId: resolved.model.id,
        bindingId: resolved.binding.id,
        channelId: resolved.channel.id,
        capability,
        fingerprint: resolved.fingerprint,
        token: randomBytes(32).toString("hex"),
        status: "running",
        phase: "queued",
        ...(requestedInput ? { input: requestedInput } : {}),
        fixtureUrls: Array.from({ length: capability === "video" ? 3 : 1 }, (_, i) => `${input.publicOrigin}/api/admin/binding-verifications/fixtures/${i}`),
        diagnostics: {
            channelId: resolved.channel.id,
            upstreamModel: resolved.binding.upstreamModel,
            referenceCount: requestedInput ? requestedInput.references.length : capability === "video" ? 3 : 1,
            referenceTypes: requestedInput?.references.map((item) => item.type),
            ...(capability === "video" ? { resolution: "480p", durationSeconds: 5 } : {}),
            fallback: false,
        },
    });
}

/** One durable submit/query step. A lost submission is never replayed automatically. */
export async function advanceBindingVerification(id: string, user: PublicUser, publicOrigin: string, cookie: string) {
    const current = await getBindingVerification(id);
    if (!current || current.userId !== user.id || !hasAdminPermission(user, "upstream.manage")) throw new Error("验证记录不存在或无权访问");
    if (current.status !== "running") return current;
    if (current.busyUntil) {
        if (current.busyUntil < Date.now()) return (await updateBindingVerification(id, { status: "needs_review", phase: "interrupted", error: "上次执行中断或超时；为避免重复提交，需人工确认后重新测试", busyUntil: 0 }))!;
        return current;
    }
    const resolved = await target(current.logicalModelId, current.bindingId);
    if (resolved.fingerprint !== current.fingerprint)
        return (await updateBindingVerification(id, {
            status: current.taskId ? "needs_review" : "failed",
            phase: "stale",
            error: current.taskId ? "绑定配置已变更，但原生成任务尚需核对；禁止通过修改配置重复生成。" : "绑定配置已变更，尚未提交上游，请重新运行测试",
        }))!;
    const timeout = resolveModelRequestTimeoutMs(resolved.config, current.capability);
    const run = await claimBindingVerification(id, Date.now() + timeout);
    if (!run) return (await getBindingVerification(id))!;
    const origin = resolveInternalOrigin(publicOrigin);
    try {
        await withBindingVerificationScope({ id: run.id, token: run.token, channelId: run.channelId, origin }, async () => {
            assertCapabilityConstraints(run.capability === "text" ? { ...resolved.config.capabilityProfile, supportsReferenceImage: true } : resolved.config.capabilityProfile, {
                capability: run.capability,
                referenceTypes: run.input ? run.input.references.map((item) => item.type) : ["image"],
                referenceCount: run.input ? run.input.references.length : run.capability === "video" ? 3 : 1,
                ...(run.capability === "video" ? { durationSeconds: 5, resolution: "480p", aspectRatio: "16:9" } : {}),
            });
            if (run.capability === "video" && resolveUpstreamVideoDuration(5, 5, { ...resolved.config.capabilityProfile, durationRange: resolved.config.advancedConfig?.durationRange }) !== 5)
                throw new Error("此绑定不能原样请求 5 秒视频，验证不会改用其他时长");
            if (run.input) assertCustomProtocolReferenceMapping({ ...resolved.config.advancedConfig, capability: run.capability }, run.input.references);
            const fixtures = await bindingVerificationFixtures();
            const bindingContext = { bindingVerificationId: run.id };
            let result: BindingVerificationRun["result"];
            if (run.capability === "text") {
                let task = run.taskId ? await getTextTask(run.taskId) : null;
                if (!task) {
                    if (run.taskId) throw new Error("原测试任务已丢失，禁止自动重提");
                    task = await createTextTask({
                        ...bindingContext,
                        userId: user.id,
                        config: resolved.config,
                        candidateConfigs: [],
                        messages: [
                            {
                                role: "user",
                                content: run.input
                                    ? [{ type: "text" as const, text: run.input.prompt }, ...run.input.references.map((reference) => ({ type: "image_url" as const, image_url: { url: reference.url } }))]
                                    : [
                                          { type: "text", text: "请准确描述这张图片中的物体、形状和颜色。" },
                                          { type: "image_url", image_url: { url: `data:image/png;base64,${fixtures[0].toString("base64")}` } },
                                      ],
                            },
                        ],
                    });
                    await updateBindingVerification(id, { taskId: task.id, phase: "submitting" });
                }
                const step = await runTextTaskStep(task, origin, cookie);
                if (step.state === "pending") {
                    await scheduleGenerationTask("text", task.id, { executionPhase: "submitted", channelId: run.channelId, upstreamTaskId: step.upstreamTaskId });
                    await updateBindingVerification(id, { upstreamTaskId: step.upstreamTaskId });
                }
                if (step.state === "failed") throw new Error(step.error);
                if (step.state === "needs_review") throw new GenerationSubmissionUncertainError(step.error);
                const completed = await getTextTask(task.id);
                if (completed?.status === "success") {
                    if (!completed.result?.content.trim()) throw new Error("文本结果为空");
                    result = { text: completed.result.content, mimeType: "text/plain" };
                }
            } else if (run.capability === "image") {
                let task = run.taskId ? await getImageTask(run.taskId) : null;
                if (!task) {
                    if (run.taskId) throw new Error("原测试任务已丢失，禁止自动重提");
                    const preparedReferences = run.input
                        ? await Promise.all(
                              run.input.references.map(async (reference, index) => {
                                  const name = `reference-${index + 1}`;
                                  const dataUrl = await imageReferenceToDataUrl({ name, dataUrl: "", url: reference.url }, name, origin, cookie);
                                  return { name, dataUrl, url: reference.url };
                              }),
                          )
                        : [{ name: "binding-reference.png", dataUrl: `data:image/png;base64,${fixtures[0].toString("base64")}`, url: run.fixtureUrls[0] }];
                    await updateBindingVerification(id, { referenceEvidence: preparedReferences.map((reference) => ({ url: reference.url, sha256: bindingReferenceContentDigest(reference.dataUrl) })) });
                    task = await createImageTask({
                        ...bindingContext,
                        userId: user.id,
                        username: user.username,
                        displayName: user.displayName,
                        kind: run.input && !run.input.references.length ? "generation" : "edit",
                        source: "image-workbench",
                        config: { ...resolved.config, size: "auto" },
                        candidateConfigs: [],
                        prompt: run.input?.prompt || PROMPT,
                        references: preparedReferences,
                    });
                    await updateBindingVerification(id, { taskId: task.id, phase: "submitting" });
                }
                const step = task.upstream?.id ? await queryImageTaskUpstreamStep(task, origin, cookie) : await createImageTaskUpstreamStep(task, origin, publicOrigin, cookie);
                if (step.state === "failed") throw new Error(step.error);
                if (step.state === "needs_review") throw new GenerationSubmissionUncertainError(step.reason);
                if (step.state === "result_ready") await persistImageTaskResult((await getImageTask(task.id))!, origin, step.resultUrl, cookie);
                const completed = await getImageTask(task.id);
                if (completed?.upstream?.id) await updateBindingVerification(id, { upstreamTaskId: completed.upstream.id });
                if (completed?.status === "success") {
                    const url = completed.result?.serverUrl || completed.result?.dataUrl;
                    if (!url) throw new Error("图片生成成功但没有已保存产物");
                    const metadata = await inspectSavedMedia(url, "image", origin, cookie, timeout);
                    result = { url, mimeType: metadata.mimeType };
                    await updateBindingVerification(id, { diagnostics: { ...(await getBindingVerification(id))?.diagnostics, ...metadata } });
                }
            } else {
                let task = run.taskId ? await getVideoTask(run.taskId) : null;
                if (!task) {
                    if (run.taskId) throw new Error("原测试任务已丢失，禁止自动重提");
                    const references = run.input?.references || run.fixtureUrls.map((url) => ({ type: "image" as const, url }));
                    const preset = resolveGlobalAiOpcPreset(resolved.config.advancedConfig, resolved.config.model);
                    assertReferenceCapabilities(
                        {
                            ...resolved.config.advancedConfig!,
                            supportsReferenceImage: resolved.config.capabilityProfile?.supportsReferenceImage ?? Boolean(preset ? preset.supportsReferenceImage : resolved.config.advancedConfig?.supportsReferenceImage),
                            supportsReferenceVideo: resolved.config.capabilityProfile?.supportsReferenceVideo ?? Boolean(preset ? preset.supportsReferenceVideo : resolved.config.advancedConfig?.supportsReferenceVideo),
                            supportsReferenceAudio: resolved.config.capabilityProfile?.supportsReferenceAudio ?? Boolean(preset ? preset.supportsReferenceAudio : resolved.config.advancedConfig?.supportsReferenceAudio),
                        },
                        references,
                    );
                    assertVideoReferenceRoles(resolved.config.advancedConfig, references, preset?.videoReferenceRoles);
                    assertReferenceUrls(resolved.config.advancedConfig, references, Boolean(preset));
                    task = await createVideoTask({
                        ...bindingContext,
                        userId: user.id,
                        username: user.username,
                        displayName: user.displayName,
                        config: resolved.config,
                        upstream: { id: "", provider: "generation", model: resolved.config.model },
                        requestedDurationSeconds: 5,
                        prompt: run.input?.prompt || PROMPT,
                        references,
                        source: "video-task",
                    });
                    await updateBindingVerification(id, { taskId: task.id, phase: "submitting" });
                    const upstream = await createUpstream(
                        user.id,
                        origin,
                        cookie,
                        resolved.config,
                        run.input?.prompt || "结合三张参考图，让橙色小球缓慢经过蓝色方块和绿色圆环，保持物体外观一致，镜头连续稳定。",
                        { size: "16:9", vquality: "480p", videoSeconds: 5, videoGenerateAudio: false },
                        references,
                        resolved.settings.generationPointMultipliers,
                        `binding-verification:${id}`,
                    );
                    task = (await updateVideoTask(task.id, { upstream }))!;
                    await updateBindingVerification(id, { upstreamTaskId: upstream.id });
                    await scheduleGenerationTask("video", task.id, { executionPhase: "submitted", channelId: run.channelId, upstreamTaskId: upstream.id });
                }
                if (!task.upstream.id && !task.upstream.resultUrl) throw new GenerationSubmissionUncertainError("视频提交没有可查询的任务或结果，禁止重提");
                const step = await queryVideoTaskUpstream(task, origin, cookie);
                if (step.state === "failed") throw new Error(step.error);
                if (step.state === "result_ready") {
                    const completed = await persistVideoTaskResult(task, step.resultUrl, origin, cookie);
                    if (!completed?.result?.url) throw new Error("视频产物保存失败");
                    // A successful upstream artifact must survive local metadata validation failure.
                    await updateBindingVerification(id, { result: { url: completed.result.url }, phase: "validating_result" });
                    const metadata = await inspectSavedMedia(completed.result.url, "video", origin, cookie, timeout);
                    result = { url: completed.result.url, mimeType: metadata.mimeType };
                    await updateBindingVerification(id, { diagnostics: { ...(await getBindingVerification(id))?.diagnostics, ...metadata } });
                }
            }
            if (result) {
                if (!(await getBindingVerification(id))?.diagnostics?.requestDigest) throw new Error("缺少真实上游提交证据，不能标记验证通过");
                const fresh = await target(run.logicalModelId, run.bindingId);
                if (fresh.fingerprint !== run.fingerprint) throw new Error("执行期间绑定配置已改变，结果不能用于启用");
                if (!(await completeBindingVerification(id, run.busyUntil!, result))) throw new GenerationSubmissionUncertainError("验证租约已过期或状态已变化，不能标记通过");
            } else await updateBindingVerification(id, { phase: "polling", busyUntil: 0 });
        });
    } catch (error) {
        const existingResult = (await getBindingVerification(id))?.result;
        const uncertain = error instanceof GenerationSubmissionUncertainError || Boolean(existingResult?.url);
        if (error instanceof BindingVerificationMediaSpecificationError) {
            await updateBindingVerification(id, {
                diagnostics: { ...(await getBindingVerification(id))?.diagnostics, actualMedia: error.metadata, specificationMismatch: true },
                ...(existingResult ? { result: { ...existingResult, mimeType: error.metadata.mimeType } } : {}),
            });
        }
        const message = error instanceof Error ? error.message : "绑定验证失败";
        const { redactDiagnosticText } = await import("./media-task-diagnostics");
        const safe = redactDiagnosticText(message, [resolved.channel.apiKey, run.token]);
        await recordBindingVerificationDiagnostic(id, { phase: "failed", errorMessage: safe, errorName: error instanceof Error ? error.name : "Error" });
        await updateBindingVerification(id, { status: uncertain ? "needs_review" : "failed", phase: uncertain ? "needs_review" : "failed", error: safe, busyUntil: 0 });
    }
    return (await getBindingVerification(id))!;
}

export function bindingReferenceContentDigest(dataUrl: string): string {
    const match = dataUrl.match(/^data:image\/[^;,]+;base64,([\s\S]+)$/);
    if (!match) throw new Error("无法校验参考图片的二进制内容");
    const bytes = Buffer.from(match[1], "base64");
    if (!bytes.length) throw new Error("参考图片内容为空");
    return createHash("sha256").update(bytes).digest("hex");
}

type VerificationVideoMetadata = { mimeType: string; width: number; height: number; durationSeconds: number; bytes: number };
export class BindingVerificationMediaSpecificationError extends Error {
    constructor(
        message: string,
        readonly metadata: VerificationVideoMetadata,
    ) {
        super(message);
    }
}
export function assertBindingVerificationVideoSpecification(metadata: VerificationVideoMetadata, frameSeconds: number) {
    if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) !== 480) throw new BindingVerificationMediaSpecificationError("上游已生成视频，但实际分辨率不是 480p；产物已保留，需人工核对，禁止自动重提。", metadata);
    if (!Number.isFinite(metadata.durationSeconds) || !Number.isFinite(frameSeconds) || frameSeconds <= 0 || Math.abs(metadata.durationSeconds - 5) > frameSeconds)
        throw new BindingVerificationMediaSpecificationError("上游已生成视频，但实际时长不是 5 秒（允许一帧封装误差）；产物已保留，需人工核对，禁止自动重提。", metadata);
}

export async function validateBindingVerificationMedia(bytes: Buffer, capability: "image" | "video", path?: string) {
    if (capability === "image") {
        const metadata = await sharp(bytes, { failOn: "error" }).metadata();
        if (!metadata.width || !metadata.height) throw new Error("图片产物无法解码");
        await sharp(bytes).stats();
        return { mimeType: `image/${metadata.format}`, width: metadata.width, height: metadata.height, bytes: bytes.length };
    }
    if (!path) throw new Error("视频检查缺少持久化文件");
    const detected = await fileTypeFromBlob(await openAsBlob(path));
    if (!detected?.mime.startsWith("video/")) throw new Error("视频产物不是有效视频文件");
    const { stdout } = await runFfprobe(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type,width,height,duration,avg_frame_rate:format=duration", "-of", "json", path]);
    const data = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number; duration?: string; avg_frame_rate?: string }>; format?: { duration?: string } };
    const stream = data.streams?.[0];
    const duration = Number(stream?.duration || data.format?.duration);
    const [n, d] = (stream?.avg_frame_rate || "0/1").split("/").map(Number);
    const frameSeconds = d / n;
    const metadata = { mimeType: detected.mime, width: stream?.width || 0, height: stream?.height || 0, durationSeconds: duration, bytes: (await stat(path)).size };
    await runFfmpeg(["-v", "error", "-xerror", "-i", path, "-map", "0:v:0", "-f", "null", "-"]);
    assertBindingVerificationVideoSpecification(metadata, frameSeconds);
    return metadata;
}
async function inspectSavedMedia(url: string, capability: "image" | "video", origin: string, cookie: string, timeoutMs: number) {
    const dir = await mkdtemp(join(tmpdir(), "vozeb-binding-verification-"));
    const file = join(dir, "result");
    try {
        if (url.startsWith("data:")) {
            const match = url.match(/^data:[^;,]+;base64,([\s\S]+)$/);
            if (!match) throw new Error("产物 data URL 无效");
            await writeFile(file, Buffer.from(match[1], "base64"));
        } else await downloadMediaToFile(url, file, { origin, cookie, maxBytes: creativeUploadMaxBytes(capability), timeoutMs });
        return await validateBindingVerificationMedia(capability === "image" ? await readFile(file) : Buffer.alloc(0), capability, file);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
