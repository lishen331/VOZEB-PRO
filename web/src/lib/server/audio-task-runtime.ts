import { isOfficialWorkflowQueryPath, queryRunningHubTask } from "./runninghub-provider";
import { generationTaskShouldConsumePoints } from "@/lib/server/generation-execution-policy";
import { fileTypeFromBuffer } from "file-type";
import { mediaTaskSource } from "@/lib/media-management-contract";
import { audioTaskRefundIdempotencyKey, refundAudioTask } from "@/lib/server/audio-task-refund";
import { getAudioTask, transitionAudioTask, updateAudioTask, type AudioTask } from "@/lib/server/audio-task-store";
import { generationModelId, systemGenerationChannelId } from "@/lib/server/generation-channel";
import { getAuthSettings, getPublicUsersByIds } from "@/lib/auth/store";
import { generationMediaProxyHeaders } from "@/lib/server/generation-media-authorization";
import { CHANNEL_SATURATED_MESSAGE } from "@/lib/server/channel-concurrency";
import { finishGenerationAttempt, generationReservationId, nextGenerationAttemptNo, releaseGenerationReservations, renewGenerationReservations, reserveGenerationAttemptSlot, startGenerationAttempt } from "@/lib/server/generation-attempt";
import { fetchInternalApi, isInternalApiBaseUrl } from "@/lib/server/internal-origin";
import { maintenanceWorkerHeaders } from "@/lib/server/maintenance-auth";
import { resolveModelRequestTimeoutMs } from "@/lib/server/model-request-policy";
import { buildProviderRequest, isProviderBusinessError, providerQueryPaths, readProviderError, readProviderString, resolvedProviderCreatePaths } from "@/lib/server/provider-task-config";
import { writePersistentMediaDataUrl } from "@/lib/server/reference-asset-store";
import { registerGenerationTaskAssetsForUser } from "@/lib/server/creative-runtime-service";
import { scheduleGenerationTask } from "@/lib/server/generation-task-scheduler";
import { GenerationSubmissionSafeFailure, GenerationSubmissionUncertainError, generationSubmissionResponseError, generationSubmissionUncertainError } from "@/lib/server/generation-submission-error";
import { systemAiBillingHeaders } from "@/lib/server/system-ai-billing";
import { fetchSafeOutbound } from "@/lib/server/safe-outbound-fetch";
import { refundGenerationCharge } from "@/lib/server/generation-charge-service";
import { buildRunningHubWorkflowPayload, workflowConfigForTask, workflowTimeoutMs } from "@/lib/server/runninghub-workflow-runtime";
import { recordGenerationTaskLogResult } from "@/lib/server/generation-log-task-service";
import { getGenerationLogForUser } from "@/lib/server/generation-log-store";
import { audioModelFamily, audioUpstreamFields } from "@/lib/audio-model-params";
import { createCustomVoice, getCustomVoice, listCustomVoices, updateCustomVoice } from "@/lib/server/custom-voice-store";
import { randomUUID } from "node:crypto";
import type { SystemModelChannel } from "@/lib/auth/store";
import { normalizeVoiceCustomization, type VoiceCustomizationConfig } from "@/lib/custom-voice-config";
import { queryQwenVoiceStatus, submitMinimaxVoiceDesign, submitQwenVoiceClone, submitQwenVoiceDesign, upstreamVoicePrefix } from "@/lib/server/custom-voice-upstream";
import { concatAudioWithGaps, validateDialog } from "@/lib/server/audio-dialog-service";
import { getLocalMediaRegistration } from "@/lib/server/local-media-registry";
import { readRegisteredMediaBytes } from "@/lib/server/object-storage-service";
import type { ReferenceAudioInput } from "@/lib/server/custom-voice-upstream";
import type { AudioTaskConfig } from "@/lib/server/audio-task-store";

export type AudioUpstreamStep =
    | { state: "pending"; status: string; upstreamTaskId: string; createPath: string; pointsCost?: number; billingReceiptId?: string }
    | { state: "result_ready"; status: string; resultUrl: string; pointsCost?: number; billingReceiptId?: string }
    | { state: "completed" }
    | { state: "failed"; status: string; error: string; retryReason?: "upstream_failed" };

export async function createAudioTaskUpstreamStep(task: AudioTask, origin: string, cookie = "", workerUserId = ""): Promise<AudioUpstreamStep> {
    const current = await getAudioTask(task.id);
    if (!current || current.status === "cancelled") return { state: "failed", status: "cancelled", error: "任务已取消" };
    const running = current.status === "pending" ? await transitionAudioTask(current, ["pending"], { status: "running" }) : current;
    if (!running) return { state: "failed", status: "conflict", error: "音频任务状态已变化" };
    if (running.upstream?.id) return queryAudioTaskUpstreamStep(running, origin, cookie, workerUserId);

    const candidates = [running.config, ...(running.candidateConfigs || [])];
    let attempts = running.attempts || [];
    let latestError = "没有可用的音频渠道";
    for (const [index, config] of candidates.entries()) {
        const reservationId = generationReservationId("audio", task.id, nextGenerationAttemptNo(attempts));
        const reserved = await reserveGenerationAttemptSlot({
            capability: "audio",
            channelId: config.channelId,
            upstreamModel: config.model,
            reservationId,
            concurrencyLimit: config.capabilityProfile?.concurrencyLimit,
        });
        if (!reserved) {
            latestError = CHANNEL_SATURATED_MESSAGE;
            continue;
        }
        const started = startGenerationAttempt(attempts, { channelId: config.channelId, model: generationModelId(config), capability: "audio", reservationId });
        attempts = started.attempts;
        const candidate = { ...running, config, candidateConfigs: candidates.slice(index + 1), attempts, attemptNo: started.attempt.attemptNo, upstream: undefined, billing: undefined };
        try {
            await updateAudioTask(task.id, { config, candidateConfigs: candidate.candidateConfigs, attempts, attemptNo: candidate.attemptNo, upstream: undefined, billing: undefined });
            await scheduleGenerationTask("audio", task.id, { executionPhase: "submitting", nextPollAt: Date.now(), channelId: config.channelId, provider: config.advancedConfig?.protocol || config.apiFormat, lastUpstreamStatus: "submitting" });
        } catch (error) {
            await releaseGenerationReservations([reservationId]);
            throw error;
        }

        try {
            // 多人对话：逐句合成后按序拼接成一段音频，不走上游单次创建流程。
            if (config.mode === "dialog") return await runDialogAudioTask(task, config, origin, cookie, workerUserId);
            // Handle custom voice if specified
            let voiceId = config.voice;
            if (config.mode === "design" || config.mode === "clone") {
                // 设计和克隆：先用上游创建一个音色，再用它合成。任一步失败都按可安全重试处理。
                voiceId = await ensureModeVoiceId(task, config, voiceId);
            }
            if (config.customVoiceId) {
                const customVoice = await getCustomVoice(config.customVoiceId);
                if (!customVoice) {
                    throw new GenerationSubmissionSafeFailure("自定义音色不存在");
                }
                if (customVoice.status !== "ready") {
                    throw new GenerationSubmissionSafeFailure("自定义音色尚未就绪");
                }
                if (customVoice.ownerUserId !== task.userId && !customVoice.shared) {
                    throw new GenerationSubmissionSafeFailure("无权使用此自定义音色");
                }
                if (customVoice.ttsModel !== config.model) {
                    throw new GenerationSubmissionSafeFailure("自定义音色与当前模型不匹配");
                }
                if (customVoice.channelId !== config.channelId) {
                    throw new GenerationSubmissionSafeFailure("自定义音色与当前渠道不匹配");
                }
                voiceId = customVoice.upstreamVoiceId || voiceId;
                // Update lastUsedAt to prevent MiniMax expiration
                await updateCustomVoice(config.customVoiceId, { lastUsedAt: new Date().toISOString() }).catch(() => {
                    // Non-critical: continue even if update fails
                });
            }

            const defaults = {
                model: config.model,
                input: candidate.prompt,
                prompt: candidate.prompt,
                text: candidate.prompt,
                voice: voiceId,
                response_format: config.format,
                format: config.format,
                speed: Number(config.speed) || 1,
                ...(config.instructions ? { instructions: config.instructions } : {}),
                ...(candidate.workflowInput || {}),
            };
            const workflow = workflowConfigForTask(candidate);
            // 自定义音色：上游字段里的 voice 必须换成解析出的 upstreamVoiceId，
            // 不能让 custom:<id> 漏到上游，也不能因为剔除它而丢掉 voice_setting.voice_id。
            let payload: Record<string, unknown>;
            try {
                payload = workflow
                    ? buildRunningHubWorkflowPayload({ config: workflow, businessInput: defaults, references: [] })
                    : { ...buildProviderRequest(config.advancedConfig?.requestTemplate, defaults, defaults), ...withoutUndefined(audioUpstreamFields(config.model, candidate.prompt, config.params, config.customVoiceId ? voiceId : undefined)) };
            } catch (error) {
                throw new GenerationSubmissionSafeFailure(error instanceof Error ? error.message : "音频请求模板无效");
            }
            const { response, path } = await createAudioUpstream(candidate, origin, cookie, workerUserId, payload, workflow);
            const billing = readBilling(response.headers);
            if (billing.billingReceiptId) await updateAudioTask(task.id, { billing: { pointsCost: billing.pointsCost ?? 0, billingReceiptId: billing.billingReceiptId, refunded: false } });
            const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "";
            if (!contentType.includes("json")) {
                const completed = await persistAudioBytes(candidate, origin, Buffer.from(await response.arrayBuffer()), contentType);
                if (completed?.status === "success") {
                    await markAudioAttemptSucceeded(candidate, billing);
                    return { state: "completed" };
                }
                return { state: "failed", status: completed?.status || "cancelled", error: completed?.error || "任务已取消" };
            }

            let data: unknown;
            try {
                data = await response.json();
            } catch {
                throw new GenerationSubmissionUncertainError("音频接口返回了无效 JSON，创建结果待确认");
            }
            if (isProviderBusinessError(data)) throw new GenerationSubmissionSafeFailure(readProviderError(data) || "音频接口返回失败");
            const directUrl = readProviderString(data, config.advancedConfig?.resultField, AUDIO_KEYS);
            if (directUrl) {
                const submittedAt = Date.now();
                await scheduleGenerationTask("audio", task.id, {
                    executionPhase: "result_ready",
                    channelId: config.channelId,
                    provider: config.advancedConfig?.protocol || config.apiFormat,
                    submittedAt,
                    nextPollAt: submittedAt,
                    lastUpstreamStatus: "completed",
                    resultPayload: { url: directUrl },
                });
                return { state: "result_ready", status: "completed", resultUrl: directUrl, ...billing };
            }
            const id = readProviderString(data, config.advancedConfig?.taskIdField, ID_KEYS);
            if (!id) throw new GenerationSubmissionUncertainError("音频接口没有返回音频或任务 ID，创建结果待确认");
            await updateAudioTask(task.id, { upstream: { id, createPath: path } });
            const submittedAt = Date.now();
            await scheduleGenerationTask("audio", task.id, {
                executionPhase: "submitted",
                upstreamTaskId: id,
                channelId: config.channelId,
                provider: config.advancedConfig?.protocol || config.apiFormat,
                queryPath: config.advancedConfig?.queryPath,
                submittedAt,
                nextPollAt: submittedAt,
                lastUpstreamStatus: "submitted",
            });
            return { state: "pending", status: "submitted", upstreamTaskId: id, createPath: path, ...billing };
        } catch (error) {
            if (!(error instanceof GenerationSubmissionSafeFailure)) throw generationSubmissionUncertainError(error, "音频任务创建结果未知");
            latestError = error.message;
            attempts = finishGenerationAttempt(attempts, candidate.attemptNo, { status: "failed", error: latestError });
            await refundAudioCandidate(candidate);
            await updateAudioTask(task.id, { attempts, attemptNo: candidate.attemptNo, upstream: undefined, billing: undefined });
        }
    }
    return { state: "failed", status: "failed", error: latestError };
}

/**
 * 设计 / 克隆模式：先用上游创建一个音色，返回可用于合成的 voice_id。
 * - 克隆：同一段参考音频（指纹相同）复用已就绪的音色，不重复调上游、不重复扣费。
 * - 设计：每次生成都创建新音色，默认不保存；用户点保存后才进入「我的音色」。
 * 失败一律抛 GenerationSubmissionSafeFailure，走既有的退款路径。
 */
async function ensureModeVoiceId(task: AudioTask, config: AudioTaskConfig, fallbackVoiceId: string | undefined) {
    const voiceConfig = normalizeVoiceCustomization(config.advancedConfig?.voiceCustomization);
    if (!voiceConfig) throw new GenerationSubmissionSafeFailure("当前渠道未启用自定义音色");
    const kind = config.mode === "clone" ? "clone" : "design";
    const targetModel = config.model;
    const provider = voiceConfig.provider;

    if (kind === "clone") {
        if (!config.cloneConsent) throw new GenerationSubmissionSafeFailure("克隆音色需要先确认已获得声音本人授权");
        if (!config.referenceAudioUrl) throw new GenerationSubmissionSafeFailure("克隆音色缺少参考音频");
        const fingerprint = config.referenceAudioFingerprint;
        if (!fingerprint) throw new GenerationSubmissionSafeFailure("克隆音色缺少参考音频标识");
        const existing = await findReusableCloneVoice(task.userId, config.channelId || "", targetModel, fingerprint);
        if (existing?.upstreamVoiceId && existing.status === "ready") {
            await updateCustomVoice(existing.id, { lastUsedAt: new Date().toISOString() }).catch(() => {});
            return existing.upstreamVoiceId;
        }
        if (existing?.upstreamVoiceId && existing.status === "creating") {
            // 上一次克隆还在审核：接着等它，不重复创建（指纹有唯一索引，重复创建也会失败）。
            const ready = await waitForVoiceReady(await channelFromTaskConfig(config), existing.upstreamVoiceId);
            await updateCustomVoice(existing.id, { status: ready ? "ready" : "creating", lastUsedAt: new Date().toISOString() });
            if (!ready) throw new GenerationSubmissionSafeFailure("音色审核未在预期时间内完成，请稍后重试");
            return existing.upstreamVoiceId;
        }
        const voiceId = randomUUID();
        const prefix = upstreamVoicePrefix(voiceId);
        const channel = await channelFromTaskConfig(config);
        // 站内音频（/api/reference-assets/...）上游访问不到、也不一定开了对象存储外链，
        // 所以读成字节按 data: URI 内联上传；公网地址直接透传。
        const result = await submitQwenVoiceClone(channel, voiceConfig, targetModel, prefix, await cloneAudioInput(config.referenceAudioUrl));
        if (result.status === "failed" || !result.upstreamVoiceId) {
            throw new GenerationSubmissionSafeFailure(result.failureReason || "音色克隆失败");
        }
        await createCustomVoice({ id: voiceId, ownerUserId: task.userId, channelId: config.channelId || "", provider, ttsModel: targetModel, kind, name: "克隆音色", ...cloneExtra(fingerprint) });
        await updateCustomVoice(voiceId, {
            status: result.status,
            upstreamVoiceId: result.upstreamVoiceId,
            upstreamRequestId: result.upstreamRequestId,
            previewUrl: result.previewUrl,
            previewMimeType: result.previewMimeType,
            failureReason: result.failureReason,
            ...cloneExtra(fingerprint),
        });
        if (result.status === "creating" && result.upstreamVoiceId) {
            // 千问克隆要等审核，一般十几秒；直接在这里等，用户点一次生成就够，不用回来手动刷新。
            const ready = await waitForVoiceReady(channel, result.upstreamVoiceId);
            await updateCustomVoice(voiceId, { status: ready ? "ready" : "creating", failureReason: ready ? undefined : "音色审核未在预期时间内完成" });
            if (!ready) throw new GenerationSubmissionSafeFailure("音色审核未在预期时间内完成，请稍后重试");
        }
        return result.upstreamVoiceId;
    }

    const description = (config.voiceDescription || "").trim();
    if (!description) throw new GenerationSubmissionSafeFailure("设计音色需要填写声音描述");
    const previewText = designPreviewText(task.prompt, voiceConfig);
    const voiceId = randomUUID();
    const channel = await channelFromTaskConfig(config);
    const result = provider === "minimax" ? await submitMinimaxVoiceDesign(channel, voiceConfig, description, previewText) : await submitQwenVoiceDesign(channel, voiceConfig, targetModel, upstreamVoicePrefix(voiceId), description, previewText);
    if (result.status === "failed" || !result.upstreamVoiceId) {
        throw new GenerationSubmissionSafeFailure(result.failureReason || "音色设计失败");
    }
    const previewUrl = result.previewAudioBase64 ? await persistVoicePreview(voiceId, result.previewAudioBase64, result.previewMimeType || "audio/mpeg").catch(() => undefined) : result.previewUrl;
    await createCustomVoice({ id: voiceId, ownerUserId: task.userId, channelId: config.channelId || "", provider, ttsModel: targetModel, kind, name: description.slice(0, 20) });
    await updateCustomVoice(voiceId, {
        status: "ready",
        saved: false,
        upstreamVoiceId: result.upstreamVoiceId,
        upstreamRequestId: result.upstreamRequestId,
        previewUrl,
        previewMimeType: result.previewMimeType,
    });
    return result.upstreamVoiceId;
}

async function findReusableCloneVoice(userId: string, channelId: string, ttsModel: string, fingerprint: string) {
    const voices = await listCustomVoices({ ownerUserId: userId, ttsModel, includeOwned: true });
    const matches = voices.filter((voice) => voice.kind === "clone" && voice.channelId === channelId && voice.upstreamVoiceId && voice.sourceFingerprint === fingerprint);
    return matches.find((voice) => voice.status === "ready") || matches.find((voice) => voice.status === "creating");
}

function cloneExtra(fingerprint: string) {
    return { sourceFingerprint: fingerprint, consentAt: new Date().toISOString(), saved: true } as const;
}

/** 设计接口要求 preview_text 15～200 字；取节点文本的前 200 字，不够时补一句通用话术。 */
function designPreviewText(prompt: string, config: VoiceCustomizationConfig) {
    const text = (prompt || "").trim().slice(0, config.designLimits.previewTextMax);
    if (text.length >= config.designLimits.previewTextMin) return text;
    const filler = "大家好，这是用设计出来的声音说的一段试听文本，希望你喜欢。";
    return (text + filler).slice(0, config.designLimits.previewTextMax);
}

/** 轮询千问音色状态直到可用的等待上限；超时返回 false。 */
async function waitForVoiceReady(channel: SystemModelChannel, upstreamVoiceId: string, timeoutMs = 120_000, intervalMs = 5_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        const status = await queryQwenVoiceStatus(channel, upstreamVoiceId);
        if (status.status === "ready") return true;
        if (status.status === "failed") throw new GenerationSubmissionSafeFailure(status.failureReason || "音色审核未通过");
    }
    return false;
}

/**
 * 适配器需要渠道形态的对象。音频任务里的 baseUrl 是站内代理路径（/api/ai/system/...），
 * 而音色适配器直接出站调用上游，必须换成渠道在设置里的真实上游地址。
 */
async function channelFromTaskConfig(config: AudioTaskConfig): Promise<SystemModelChannel> {
    const base = {
        id: config.channelId || "",
        name: "",
        apiKey: config.apiKey,
        apiFormat: (config.apiFormat === "gemini" ? "gemini" : "openai") as SystemModelChannel["apiFormat"],
        models: [] as string[],
        enabled: true,
        advancedConfig: config.advancedConfig,
    } as SystemModelChannel;
    if (!config.baseUrl.startsWith("/")) return { ...base, baseUrl: config.baseUrl };
    const settings = await getAuthSettings();
    const stored = settings.systemChannels.find((item) => item.id === config.channelId);
    if (!stored?.baseUrl) throw new GenerationSubmissionSafeFailure("找不到自定义音色所属渠道的上游地址");
    return { ...base, baseUrl: stored.baseUrl, apiKey: stored.apiKey || config.apiKey, advancedConfig: config.advancedConfig || stored.advancedConfig };
}

async function persistVoicePreview(voiceId: string, base64: string, mimeType: string) {
    const extension = mimeType === "audio/wav" ? "wav" : mimeType === "audio/mp4" ? "m4a" : "mp3";
    const stored = await writePersistentMediaDataUrl(`data:${mimeType};base64,${base64}`, "audio", { ownerUserId: "system", source: "custom-voice-preview", originalName: `${voiceId}.${extension}` });
    return stored.url;
}

/**
 * 多人对话：每句单独调一次合成接口（带上该角色的音色和指令），按顺序拼接成一个文件。
 * 并发 3，保持原顺序；任一句失败则整单失败，由外层走退款。
 */
async function runDialogAudioTask(task: AudioTask, config: AudioTaskConfig, origin: string, cookie: string, workerUserId: string): Promise<AudioUpstreamStep> {
    const dialog = config.dialog;
    if (!dialog?.lines?.length) throw new GenerationSubmissionSafeFailure("多人对话缺少台词");
    const issue = validateDialog(dialog.lines, dialog.roles || {});
    if (issue) throw new GenerationSubmissionSafeFailure(issue);
    const family = audioModelFamily(config.model);
    const extension = (config.format || "mp3").toLowerCase() === "wav" ? "wav" : "mp3";
    const results: Array<Buffer | undefined> = new Array(dialog.lines.length);
    let index = 0;
    let failure = "";
    const worker = async () => {
        while (index < dialog.lines.length && !failure) {
            const current = index++;
            const line = dialog.lines[current];
            const role = dialog.roles[line.role];
            try {
                results[current] = await synthesizeDialogLine(task, config, line, role, family, origin, cookie, workerUserId);
            } catch (error) {
                failure = error instanceof Error ? error.message : "多人对话合成失败";
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(3, dialog.lines.length) }, worker));
    if (failure) throw new GenerationSubmissionSafeFailure(failure);
    const segments = results.filter((bytes): bytes is Buffer => Boolean(bytes));
    if (segments.length !== dialog.lines.length) throw new GenerationSubmissionSafeFailure("多人对话部分台词没有合成结果");
    const joined = await concatAudioWithGaps(segments, extension);
    await persistAudioBytes(task, origin, joined, extension === "wav" ? "audio/wav" : "audio/mpeg");
    return { state: "completed" };
}

async function synthesizeDialogLine(task: AudioTask, config: AudioTaskConfig, line: { role: string; text: string }, role: { voice: string; instruction?: string; emotion?: string }, family: string, origin: string, cookie: string, workerUserId: string) {
    const voiceId = role.voice;
    const instruction = (role.instruction || "").trim();
    const params: Record<string, unknown> = { ...(config.params || {}), voiceId };
    if (family === "qwen" && instruction) params.instruction = instruction;
    if (family === "minimax" && role.emotion) params.emotion = role.emotion;
    const defaults = {
        model: config.model,
        input: line.text,
        prompt: line.text,
        text: line.text,
        voice: voiceId,
        response_format: config.format,
        format: config.format,
        speed: Number(config.speed) || 1,
    };
    const payload = { ...buildProviderRequest(config.advancedConfig?.requestTemplate, defaults, defaults), ...withoutUndefined(audioUpstreamFields(config.model, line.text, params, voiceId)) };
    const { response } = await createAudioUpstream({ ...task, config }, origin, cookie, workerUserId, payload);
    const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "";
    if (contentType.includes("json")) {
        const text = await response.text();
        let data: unknown;
        try {
            data = JSON.parse(text);
        } catch {
            throw new GenerationSubmissionSafeFailure("多人对话的音频接口返回了无效 JSON");
        }
        if (isProviderBusinessError(data)) throw new GenerationSubmissionSafeFailure(readProviderError(data) || `角色「${line.role}」合成失败`);
        const directUrl = readProviderString(data, config.advancedConfig?.resultField, AUDIO_KEYS);
        if (!directUrl) throw new GenerationSubmissionSafeFailure(`角色「${line.role}」没有返回音频`);
        return await downloadAudioBytes(directUrl, line.role);
    }
    return Buffer.from(await response.arrayBuffer());
}

async function downloadAudioBytes(url: string, role: string) {
    const response = await fetchSafeOutbound(url, { method: "GET", signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new GenerationSubmissionSafeFailure(`角色「${role}」的音频下载失败（HTTP ${response.status}）`);
    return Buffer.from(await response.arrayBuffer());
}

/** 克隆参考音频：站内地址读成字节按 data: URI 内联上传（自动兼容本地磁盘和对象存储），公网地址直接用 URL。 */
async function cloneAudioInput(reference: string): Promise<ReferenceAudioInput> {
    const value = (reference || "").trim();
    if (!value.startsWith("/api/reference-assets/") && !value.startsWith("/api/generation-log-assets/")) return { url: value };
    const token = decodeURIComponent(value.split("?")[0].replace(/^\/api\/(?:reference|generation-log)-assets\//, ""));
    const registration = await getLocalMediaRegistration(token);
    if (!registration) throw new GenerationSubmissionSafeFailure("找不到参考音频文件");
    const bytes = await readRegisteredMediaBytes(registration, 30 * 1024 * 1024);
    const mime = registration.mimeType || "audio/mpeg";
    const format = mime === "audio/wav" ? "wav" : mime === "audio/mp4" ? "m4a" : "mp3";
    return { data: bytes, format };
}

export async function queryAudioTaskUpstreamStep(task: AudioTask, origin: string, cookie = "", workerUserId = ""): Promise<AudioUpstreamStep> {
    if (!task.upstream?.id) return { state: "failed", status: "missing_upstream_id", error: "音频任务缺少上游任务 ID" };
    await renewGenerationReservations(task.attempts);
    if (task.config.advancedConfig?.protocol === "runninghub" && isOfficialWorkflowQueryPath(task.config.advancedConfig.queryPath || "")) {
        const workflow = workflowConfigForTask(task);
        const result = await queryRunningHubTask({
            baseUrl: new URL(task.config.baseUrl, origin).href,
            apiKey: task.config.apiKey,
            taskId: task.upstream.id,
            config: { ...task.config.advancedConfig, outputMappings: workflow?.outputMappings, timeoutSeconds: workflow?.timeoutSeconds },
            fetchImpl: (_url, init = {}) => providerFetch(task, origin, cookie, workerUserId, task.config.advancedConfig!.queryPath!, init),
        });
        if (FAILED.has(result.status.toLowerCase())) return { state: "failed", status: result.status, error: result.querySummary?.upstreamError || readProviderError(result.raw) || "RunningHub 音频生成失败", retryReason: "upstream_failed" };
        if (result.resultUrl) return { state: "result_ready", status: result.status, resultUrl: result.resultUrl };
        if (["success", "succeeded", "completed"].includes(result.status.toLowerCase())) return { state: "failed", status: result.status, error: "RunningHub 已完成，但输出节点未返回音频", retryReason: "upstream_failed" };
        return { state: "pending", status: result.status, upstreamTaskId: task.upstream.id, createPath: task.upstream.createPath };
    }
    let lastError = "";
    for (const path of providerQueryPaths(task.config.advancedConfig, task.upstream.id, [`${task.upstream.createPath.replace(/\/+$/, "")}/${encodeURIComponent(task.upstream.id)}`])) {
        const workflow = workflowConfigForTask(task);
        const response = await providerFetch(task, origin, cookie, workerUserId, path, { cache: "no-store", signal: AbortSignal.timeout(workflowTimeoutMs(workflow, Math.min(resolveModelRequestTimeoutMs(task.config, "audio"), 60_000))) });
        const text = await response.text();
        if (!response.ok) {
            lastError = readAudioError(text, response.status);
            continue;
        }
        let data: unknown;
        try {
            data = JSON.parse(text);
        } catch {
            lastError = "音频任务查询返回了无效 JSON";
            continue;
        }
        const status = readProviderString(data, task.config.advancedConfig?.statusField, STATUS_KEYS).toLowerCase();
        if (task.config.advancedConfig?.protocol === "tuzi-suno") {
            // Suno exposes a partial stream URL while still generating; only SUCCESS carries the final file.
            if (FAILED.has(status)) return { state: "failed", status, error: readProviderError(data) || "Suno 音乐生成失败", retryReason: "upstream_failed" };
            if (!SUCCEEDED.has(status)) return { state: "pending", status: status || "processing", upstreamTaskId: task.upstream.id, createPath: task.upstream.createPath };
            const finalUrl = readProviderString(data, task.config.advancedConfig.resultField, AUDIO_KEYS);
            if (finalUrl) return { state: "result_ready", status, resultUrl: finalUrl };
            return { state: "failed", status, error: "Suno 已完成，但没有返回音频地址", retryReason: "upstream_failed" };
        }
        const result = readProviderString(data, task.config.advancedConfig?.resultField, AUDIO_KEYS);
        if (result) return { state: "result_ready", status: status || "completed", resultUrl: result };
        if (FAILED.has(status)) return { state: "failed", status, error: readProviderError(data) || "音频生成失败", retryReason: "upstream_failed" };
        return { state: "pending", status: status || "processing", upstreamTaskId: task.upstream.id, createPath: task.upstream.createPath };
    }
    throw new Error(lastError || "音频任务查询失败");
}

export async function persistAudioTaskResult(task: AudioTask, origin: string, resultUrl: string, cookie = "", workerUserId = "") {
    if (/^data:audio\//i.test(resultUrl)) {
        const asset = await writePersistentMediaDataUrl(resultUrl, "audio", mediaContext(task));
        return completeAudioTask(task, asset.url || `/api/reference-assets/${asset.token}`, resultUrl.slice(5, resultUrl.indexOf(";")) || mimeFromFormat(task.config.format || "mp3"));
    }
    const path = /^https?:\/\//i.test(resultUrl) ? `/_media?url=${encodeURIComponent(resultUrl)}` : `/${resultUrl.replace(/^\/+/, "")}`;
    const response = await providerFetch(task, origin, cookie, workerUserId, path, { signal: AbortSignal.timeout(workflowTimeoutMs(workflowConfigForTask(task), resolveModelRequestTimeoutMs(task.config, "audio"))) });
    if (!response.ok) throw new Error(readAudioError(await response.text(), response.status));
    return persistAudioBytes(task, origin, Buffer.from(await response.arrayBuffer()), response.headers.get("content-type")?.split(";")[0] || "");
}

export async function markAudioTaskFailed(task: AudioTask, error: string) {
    const current = (await getAudioTask(task.id)) || task;
    if (current.status === "cancelled" || current.status === "success") return current;
    const billing = current.billing;
    const attempts = finishGenerationAttempt(current.attempts || [], current.attemptNo || current.attempts?.at(-1)?.attemptNo || 1, { status: "failed", error, pointsCost: billing?.pointsCost, billingReceiptId: billing?.billingReceiptId });
    const failed = await transitionAudioTask(current, ["pending", "running"], { status: "error", error: error.slice(0, 500), config: { ...current.config, apiKey: "" }, billing });
    if (!failed) {
        const latest = await getAudioTask(current.id);
        if (latest?.status === "error" || latest?.status === "cancelled") return refundAudioTask(latest);
        return latest;
    }
    await updateAudioTask(current.id, { attempts, candidateConfigs: [], attemptNo: attempts.at(-1)?.attemptNo });
    const latest = (await getAudioTask(current.id)) || failed;
    await ensurePracticeAudioGenerationLog(latest, "failed", error);
    return refundAudioTask(latest);
}

export async function prepareAudioTaskAutomaticRetry(task: AudioTask, error: string) {
    const current = (await getAudioTask(task.id)) || task;
    if (current.status !== "pending" && current.status !== "running") return null;
    const attemptNo = current.attemptNo || current.attempts?.at(-1)?.attemptNo || 1;
    if (attemptNo >= 2) return null;
    const attempts = finishGenerationAttempt(current.attempts || [], attemptNo, {
        status: "failed",
        error,
        pointsCost: current.billing?.pointsCost,
        billingReceiptId: current.billing?.billingReceiptId,
    });
    await refundAudioCandidate(current);
    const nextConfig = current.candidateConfigs?.[0] || current.config;
    return updateAudioTask(current.id, {
        config: nextConfig,
        candidateConfigs: [],
        attempts,
        attemptNo,
        upstream: undefined,
        billing: undefined,
    });
}

async function createAudioUpstream(task: AudioTask, origin: string, cookie: string, workerUserId: string, payload: Record<string, unknown>, workflow?: ReturnType<typeof workflowConfigForTask>) {
    let lastError = "";
    const idempotencyKey = `audio-task:${task.id}:attempt:${task.attemptNo || 1}`;
    for (const path of resolvedProviderCreatePaths(task.config.advancedConfig, "audio", ["/audio/speech"])) {
        let response: Response;
        try {
            response = await providerFetch(task, origin, cookie, workerUserId, path, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotencyKey,
                    "X-Client-Request-Id": idempotencyKey,
                    ...(task.config.baseUrl.startsWith("/") ? systemAiBillingHeaders(generationModelId(task.config), idempotencyKey, task.config.model, task.executionProfile, task.billingContext) : {}),
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(workflowTimeoutMs(workflow, resolveModelRequestTimeoutMs(task.config, "audio"))),
            });
        } catch (error) {
            throw generationSubmissionUncertainError(error, "音频任务创建结果未知");
        }
        if (response.ok) return { response, path };
        lastError = readAudioError(await response.text(), response.status);
        const responseError = generationSubmissionResponseError(response.status, lastError);
        if (responseError instanceof GenerationSubmissionUncertainError) throw responseError;
    }
    throw new GenerationSubmissionSafeFailure(lastError || "没有可用的音频创建接口");
}

async function refundAudioCandidate(task: AudioTask) {
    const current = await getAudioTask(task.id);
    const billing = current?.billing;
    if (!generationTaskShouldConsumePoints(task.executionProfile) || !billing?.billingReceiptId || billing.refunded) return;
    await refundGenerationCharge({ userId: task.userId, receiptId: billing.billingReceiptId, model: generationModelId(task.config), usageKind: "audio", units: 1, idempotencyKey: audioTaskRefundIdempotencyKey({ id: task.id, attemptNo: task.attemptNo }) });
}

async function persistAudioBytes(task: AudioTask, origin: string, bytes: Buffer, responseMime: string) {
    if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new Error("音频结果为空或超过 30MB 限制");
    const detected = await fileTypeFromBuffer(bytes);
    const detectedMime = detected?.mime.startsWith("audio/") ? detected.mime : "";
    const declaredMime = responseMime.toLowerCase().startsWith("audio/") ? responseMime.toLowerCase() : "";
    if (!detectedMime && (!declaredMime || looksLikeTextResponse(bytes))) throw new GenerationSubmissionSafeFailure("音频接口返回的不是有效音频文件");
    const mimeType = detectedMime || declaredMime || mimeFromFormat(task.config.format || "mp3");
    const asset = await writePersistentMediaDataUrl(`data:${mimeType};base64,${bytes.toString("base64")}`, "audio", mediaContext(task));
    return completeAudioTask(task, asset.url || `/api/reference-assets/${asset.token}`, mimeType);
}

function looksLikeTextResponse(bytes: Buffer) {
    const prefix = bytes.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
    return prefix.startsWith("<!doctype") || prefix.startsWith("<html") || prefix.startsWith("{") || prefix.startsWith("[");
}

async function completeAudioTask(task: AudioTask, url: string, mimeType: string) {
    const current = await getAudioTask(task.id);
    if (!current || current.status === "cancelled") {
        if (current?.status === "cancelled") await refundAudioTask(current);
        return current;
    }
    const publicUrl = normalizeAudioResultUrl(url);
    const completed = await transitionAudioTask(current, ["pending", "running"], { status: "success", result: { url: publicUrl, mimeType }, config: { ...current.config, apiKey: "" }, billing: current.billing });
    if (!completed) {
        const latest = await getAudioTask(task.id);
        if (latest?.status === "cancelled") await refundAudioTask(latest);
        return latest;
    }
    await ensurePracticeAudioGenerationLog(completed, "success");
    await registerGenerationTaskAssetsForUser(completed.userId, {
        ...completed,
        taskId: completed.id,
        title: completed.prompt.slice(0, 80) || "生成音频",
        assets: [{ type: "audio", url: publicUrl, mimeType }],
    }).catch((error) => console.error("Creative audio asset registration failed", error));
    return completed;
}

export async function ensurePracticeAudioGenerationLog(task: AudioTask, status: "success" | "failed", error?: string) {
    if (task.executionProfile !== "open-source-practice" || task.businessCode !== "dubbing") return;
    try {
        if (await getGenerationLogForUser(task.userId, `audio-task:${task.id}`)) return;
        const user = (await getPublicUsersByIds([task.userId]))[0];
        if (!user) return;
        await recordGenerationTaskLogResult({
            taskId: task.id,
            userId: task.userId,
            username: user.username,
            displayName: user.displayName,
            kind: "audio",
            source: "practice",
            status,
            title: task.prompt.slice(0, 80) || "配音练习",
            prompt: task.prompt,
            model: generationModelId(task.config),
            summary: status === "success" ? "配音练习完成" : "配音练习失败",
            durationMs: Math.max(0, task.updatedAt - task.createdAt),
            asset: status === "success" && task.result ? { type: "audio", url: normalizeAudioResultUrl(task.result.url), mimeType: task.result.mimeType } : undefined,
            error,
            createdAt: task.createdAt,
        });
    } catch (logError) {
        console.error("Practice audio generation log failed", { taskId: task.id, error: logError });
    }
}

function normalizeAudioResultUrl(value: string) {
    try {
        const parsed = new URL(value);
        if (["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.pathname.startsWith("/api/")) return `${parsed.pathname}${parsed.search}`;
    } catch {
        // Keep relative and public URLs unchanged.
    }
    return value;
}

async function markAudioAttemptSucceeded(task: AudioTask, billing: { pointsCost?: number; billingReceiptId?: string }) {
    const current = await getAudioTask(task.id);
    if (!current) return;
    const attempts = finishGenerationAttempt(current.attempts || [], current.attemptNo || 1, { status: "succeeded", pointsCost: billing.pointsCost, billingReceiptId: billing.billingReceiptId });
    await updateAudioTask(task.id, {
        attempts,
        attemptNo: attempts.at(-1)?.attemptNo,
        candidateConfigs: [],
        billing: billing.billingReceiptId ? { pointsCost: billing.pointsCost ?? 0, billingReceiptId: billing.billingReceiptId, refunded: false } : undefined,
    });
}

function providerFetch(task: AudioTask, origin: string, cookie: string, workerUserId: string, path: string, init: RequestInit) {
    const url = task.config.baseUrl.startsWith("/") ? `${origin}${task.config.baseUrl.replace(/\/+$/, "")}${path}` : `${task.config.baseUrl.replace(/\/+$/, "")}${path}`;
    const headers = new Headers(init.headers);
    if (task.config.baseUrl.startsWith("/") && workerUserId) Object.entries(maintenanceWorkerHeaders(workerUserId)).forEach(([key, value]) => headers.set(key, value));
    else if (cookie) headers.set("cookie", cookie);
    const practiceRequestId = task.executionProfile === "open-source-practice" ? `audio-task:${task.id}:attempt:${task.attemptNo || 1}:poll` : undefined;
    if (task.config.baseUrl.startsWith("/")) Object.entries(systemAiBillingHeaders(generationModelId(task.config), practiceRequestId, task.config.model, task.executionProfile, task.billingContext)).forEach(([key, value]) => headers.set(key, value));
    const mediaUrl = task.config.baseUrl.startsWith("/") ? mediaUrlFromProxyPath(path) : "";
    const channelId = task.config.channelId || systemGenerationChannelId(task.config.baseUrl);
    if (mediaUrl && channelId) Object.entries(generationMediaProxyHeaders({ userId: task.userId, taskType: "audio", taskId: task.id, channelId, upstreamModel: task.config.model, url: mediaUrl })).forEach(([key, value]) => headers.set(key, value));
    if (!task.config.baseUrl.startsWith("/")) headers.set(task.config.apiFormat === "gemini" ? "x-goog-api-key" : "authorization", task.config.apiFormat === "gemini" ? task.config.apiKey : `Bearer ${task.config.apiKey}`);
    return isInternalApiBaseUrl(task.config.baseUrl) ? fetchInternalApi(url, { ...init, headers }) : fetchSafeOutbound(url, { ...init, headers });
}

function mediaUrlFromProxyPath(path: string) {
    try {
        const parsed = new URL(path, "http://internal");
        return parsed.pathname === "/_media" ? parsed.searchParams.get("url")?.trim() || "" : "";
    } catch {
        return "";
    }
}

function readBilling(headers: Headers) {
    const raw = headers.get("x-vozeb-pro-points-cost");
    const value = raw === null ? undefined : Number(raw);
    return { pointsCost: value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined, billingReceiptId: headers.get("x-vozeb-pro-billing-receipt-id") || undefined };
}

function mediaContext(task: AudioTask) {
    return { ownerUserId: task.userId, source: mediaTaskSource(task.source, task, "audio-task"), conversationId: task.conversationId, runId: task.runId, taskId: task.id, projectId: task.projectId };
}

function mimeFromFormat(format: string) {
    return format === "wav" ? "audio/wav" : format === "opus" ? "audio/ogg" : format === "aac" ? "audio/aac" : format === "flac" ? "audio/flac" : "audio/mpeg";
}

function readAudioError(value: string, status: number) {
    try {
        const payload = JSON.parse(value) as { msg?: string; message?: string; error?: string | { message?: string } };
        const message = typeof payload.error === "string" ? payload.error : payload.error?.message || payload.msg || payload.message;
        return message?.trim().slice(0, 500) || `音频生成失败（${status}）`;
    } catch {
        return value.trim().slice(0, 500) || `音频生成失败（${status}）`;
    }
}

const ID_KEYS = ["task_id", "taskId", "id", "job_id", "jobId", "generation_id", "generationId"];
const STATUS_KEYS = ["status", "state", "task_status", "taskStatus"];
const AUDIO_KEYS = ["audio_url", "audioUrl", "media_url", "mediaUrl", "output_url", "outputUrl", "result_url", "resultUrl", "url", "uri"];
const FAILED = new Set(["failed", "failure", "error", "cancelled", "canceled", "expired"]);
const SUCCEEDED = new Set(["success", "succeeded", "completed", "complete"]);

function withoutUndefined(value: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
