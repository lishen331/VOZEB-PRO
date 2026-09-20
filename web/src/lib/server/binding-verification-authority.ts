import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, timingSafeEqual } from "node:crypto";
import { hasAdminPermission } from "@/lib/admin-permissions";
import type { AuthSettings, PublicUser } from "@/lib/auth/store";
import { getBindingVerification } from "./binding-verification-store";
import { bindingVerificationFingerprint } from "./binding-verification-policy";

type Scope = { id: string; token: string; channelId: string; origin: string };
const scope = new AsyncLocalStorage<Scope>();
export const BINDING_VERIFICATION_HEADER = "x-vozeb-binding-verification";
export function withBindingVerificationScope<T>(value: Scope, callback: () => Promise<T>) {
    return scope.run(value, callback);
}
export function bindingVerificationRequestHeaders(url: string, input?: HeadersInit) {
    const headers = new Headers(input);
    headers.delete(BINDING_VERIFICATION_HEADER);
    const current = scope.getStore();
    if (current) {
        const target = new URL(url);
        if (target.origin === current.origin && target.pathname.startsWith(`/api/ai/system/${encodeURIComponent(current.channelId)}/`)) headers.set(BINDING_VERIFICATION_HEADER, `${current.id}:${current.token}`);
    }
    return headers;
}
export async function authorizeBindingVerificationProxy<T extends Pick<AuthSettings, "logicalModels" | "systemChannels">>(request: Request, settings: T, user: Pick<PublicUser, "id" | "role" | "status" | "adminPermissions"> | null, channelId: string) {
    const grant = request.headers.get(BINDING_VERIFICATION_HEADER);
    if (!grant) return null;
    if (!user || !hasAdminPermission(user, "upstream.manage")) throw new Error("绑定验证需要上游配置管理员权限");
    const [id, token, ...extra] = grant.split(":");
    const run = await getBindingVerification(id);
    if (
        extra.length ||
        !run ||
        !token ||
        token.length !== run.token.length ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(run.token)) ||
        run.userId !== user.id ||
        run.channelId !== channelId ||
        run.status !== "running" ||
        !run.busyUntil ||
        run.busyUntil < Date.now()
    )
        throw new Error("绑定验证授权无效或已结束");
    const model = settings.logicalModels.find((m) => m.id === run.logicalModelId);
    const binding = model?.bindings.find((b) => b.id === run.bindingId);
    const channel = settings.systemChannels.find((c) => c.id === channelId);
    if (!model || !binding || !channel || binding.channelId !== channelId || bindingVerificationFingerprint(model, binding, channel) !== run.fingerprint) throw new Error("绑定配置已改变，请重新验证");
    // Only this authenticated request receives a singleton route. Shared settings are never mutated.
    return { run, settings: { ...settings, logicalModels: [{ ...model, enabled: true, bindings: [{ ...binding, enabled: true }] }], systemChannels: [{ ...channel, enabled: true }] } };
}

/** Validate the actual adapter output, rather than just the requested options. */
export async function assertBindingVerificationSubmission(run: import("./binding-verification-store").BindingVerificationRun, body: BodyInit | undefined) {
    let serialized = "";
    let imageFiles = 0;
    const binaryDigests = new Set<string>();
    const submittedUrls = new Set<string>();
    if (body instanceof FormData) {
        const fields: Record<string, unknown> = {};
        for (const [key, value] of body.entries()) {
            if (typeof value === "string") fields[key] = value;
            else {
                if (value.type.startsWith("image/")) imageFiles++;
                const bytes = Buffer.from(await value.arrayBuffer());
                binaryDigests.add(createHash("sha256").update(bytes).digest("hex"));
                fields[key] = bytes.toString("base64");
            }
        }
        serialized = JSON.stringify(fields);
    } else if (typeof body === "string") serialized = body;
    else if (body instanceof ArrayBuffer) serialized = Buffer.from(body).toString("utf8");
    else if (ArrayBuffer.isView(body)) serialized = Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("utf8");
    const collectInline = (value: unknown) => {
        if (typeof value === "string") {
            if (/^https?:\/\//.test(value) && !/\s/.test(value)) submittedUrls.add(value);
            if (/^data:(image|video)\/[^;,]+;base64,/.test(value))
                binaryDigests.add(
                    createHash("sha256")
                        .update(Buffer.from(value.slice(value.indexOf(",") + 1), "base64"))
                        .digest("hex"),
                );
        } else if (value && typeof value === "object") {
            const object = value as Record<string, unknown>;
            const mime = object.mimeType ?? object.mime_type;
            if (typeof mime === "string" && /^(image|video)\//.test(mime) && typeof object.data === "string") binaryDigests.add(createHash("sha256").update(Buffer.from(object.data, "base64")).digest("hex"));
            for (const [key, item] of Object.entries(object)) if (!/^(prompt|text|description|negative_prompt)$/i.test(key)) collectInline(item);
        }
    };
    try {
        collectInline(JSON.parse(serialized));
    } catch {
        /* non-JSON bodies are verified by their file digests */
    }
    const expected = run.input ? run.input.references.length : run.capability === "video" ? 3 : 1;
    let referenceCount = (run.input ? run.input.references.map((item) => item.url) : run.fixtureUrls).filter((url) => serialized.includes(url) || serialized.includes(url.replaceAll("/", "\\/"))).length;
    if (!run.input && referenceCount < expected && imageFiles < expected) {
        const { bindingVerificationFixtures } = await import("./binding-verification-fixtures");
        const fixtures = await bindingVerificationFixtures();
        referenceCount = fixtures.slice(0, expected).filter((bytes) => serialized.includes(bytes.toString("base64"))).length;
    }
    if (run.input) referenceCount = run.input.references.filter((reference) => submittedUrls.has(reference.url) || run.referenceEvidence?.some((evidence) => evidence.url === reference.url && binaryDigests.has(evidence.sha256))).length;
    if ((run.input ? referenceCount : Math.max(referenceCount, imageFiles)) < expected) throw new Error(`实际提交报文未包含要求的 ${expected} 个参考素材，实际请求不得丢弃输入`);
    if (run.capability === "video") {
        let payload: unknown;
        try {
            payload = JSON.parse(serialized);
        } catch {
            throw new Error("无法验证视频实际请求参数");
        }
        const fields: Array<[string, unknown]> = [];
        const visit = (value: unknown) => {
            if (value && typeof value === "object")
                for (const [key, item] of Object.entries(value)) {
                    fields.push([key, item]);
                    visit(item);
                }
        };
        visit(payload);
        const durations = fields.filter(([key]) => /^(duration|seconds|durationSeconds|duration_seconds|videoSeconds)$/i.test(key)).map(([, v]) => Number(v));
        const resolutions = fields.filter(([key]) => /^(resolution|quality|vquality|height)$/i.test(key)).map(([, v]) => String(v).replace(/p$/i, ""));
        if (!resolutions.includes("480") || resolutions.some((v) => /^\d+$/.test(v) && v !== "480") || !durations.length || durations.some((v) => v !== 5)) throw new Error("实际提交报文未严格保持 480p、5 秒，禁止降级验证");
    }

    return { referenceCount: expected, ...(run.capability === "video" ? { durationSeconds: 5, resolution: "480p" } : {}), requestDigest: createHash("sha256").update(serialized).digest("hex") };
}
