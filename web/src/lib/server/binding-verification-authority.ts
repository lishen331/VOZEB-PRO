import { AsyncLocalStorage } from "node:async_hooks";
import { timingSafeEqual } from "node:crypto";
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
    if (body instanceof FormData) {
        const fields: Record<string, unknown> = {};
        for (const [key, value] of body.entries()) {
            if (typeof value === "string") fields[key] = value;
            else {
                if (value.type.startsWith("image/")) imageFiles++;
                fields[key] = Buffer.from(await value.arrayBuffer()).toString("base64");
            }
        }
        serialized = JSON.stringify(fields);
    } else if (typeof body === "string") serialized = body;
    else if (body instanceof ArrayBuffer) serialized = Buffer.from(body).toString("utf8");
    else if (ArrayBuffer.isView(body)) serialized = Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("utf8");
    const expected = run.capability === "video" ? 3 : 1;
    let referenceCount = run.fixtureUrls.filter((url) => serialized.includes(url) || serialized.includes(url.replaceAll("/", "\\/"))).length;
    if (referenceCount < expected && imageFiles < expected) {
        const { bindingVerificationFixtures } = await import("./binding-verification-fixtures");
        const fixtures = await bindingVerificationFixtures();
        referenceCount = fixtures.slice(0, expected).filter((bytes) => serialized.includes(bytes.toString("base64"))).length;
    }
    if (Math.max(referenceCount, imageFiles) < expected) throw new Error(`实际提交报文未包含要求的 ${expected} 张参考图，禁止降级验证`);
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
    const { createHash } = await import("node:crypto");
    return { referenceCount: expected, ...(run.capability === "video" ? { durationSeconds: 5, resolution: "480p" } : {}), requestDigest: createHash("sha256").update(serialized).digest("hex") };
}
