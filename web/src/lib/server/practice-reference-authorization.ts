import type { IpReference } from "@/lib/ip-library-domain";
import type { PracticeModuleKind } from "@/lib/practice-domain";
import { createPostgresRepositories } from "@/lib/server/database";
import { getLocalMediaRegistration, isLocalMediaRegistrationExpired, type LocalMediaRegistration } from "@/lib/server/local-media-registry";
import { normalizeIpReferences, validateIpReferences } from "@/lib/server/ip-library-reference-service";
import type { PracticeTenantScope } from "@/lib/server/practice-tenant-scope";

export type PracticeReferenceInputKey = "referenceImage" | "firstFrameImage" | "lastFrameImage" | "sceneImage" | "characterPropImage1" | "characterPropImage2" | "characterPropImage3" | "image" | "audio";
export type PracticeMediaType = "image" | "audio";
export type PracticeReferenceScope = LocalMediaRegistration["scope"];

export type NormalizedPracticeAssetReference = {
    type: "asset";
    id: string;
    storageKey: string;
    /** 媒体注册作用域：用户上传为 reference，生成结果（如存入资产库的练习产物）为 generation；派发时据此选择站内媒体路由. */
    scope: PracticeReferenceScope;
    inputKey: PracticeReferenceInputKey;
    mediaType: PracticeMediaType;
    mimeType: string;
};

export type NormalizedPracticeReference = NormalizedPracticeAssetReference | IpReference;

export class PracticeReferenceAuthorizationError extends Error {
    readonly code = "PRACTICE_REFERENCE_INVALID" as const;
    readonly status = 400 as const;

    constructor(message = "练习引用素材不可用") {
        super(message);
        this.name = "PracticeReferenceAuthorizationError";
    }
}

const IMAGE_INPUT_KEYS = new Set<PracticeReferenceInputKey>(["referenceImage", "firstFrameImage", "lastFrameImage", "sceneImage", "characterPropImage1", "characterPropImage2", "characterPropImage3", "image"]);
const AUDIO_INPUT_KEYS = new Set<PracticeReferenceInputKey>(["audio"]);

export async function validatePracticeReferences(scope: PracticeTenantScope, _module: PracticeModuleKind, _input: Record<string, unknown>, references: unknown): Promise<NormalizedPracticeReference[]> {
    if (references === undefined) return [];
    if (!Array.isArray(references)) throw new PracticeReferenceAuthorizationError("练习引用素材格式无效");

    const assets: NormalizedPracticeAssetReference[] = [];
    const rawIpReferences: unknown[] = [];
    const seenAssets = new Set<string>();

    for (const value of references) {
        const source = asRecord(value);
        const type = source.type;
        if (type === "ip") {
            rawIpReferences.push(value);
            continue;
        }
        if (type !== "asset") throw new PracticeReferenceAuthorizationError("练习引用素材类型无效");

        const storageKey = normalizeStorageKey(source.id);
        if (!storageKey) throw new PracticeReferenceAuthorizationError("练习引用素材无效");
        const inputKey = normalizeInputKey(source.inputKey);
        const mediaType = expectedMediaType(_module, inputKey);
        const identity = `${storageKey}:${inputKey}`;
        if (seenAssets.has(identity)) continue;
        seenAssets.add(identity);

        const registration = await getLocalMediaRegistration(storageKey);
        if (!registration || normalizeStorageKey(registration.storageKey) !== storageKey) throw new PracticeReferenceAuthorizationError("练习引用素材不存在或已失效");
        assertRegistrationScope(registration, scope);
        if (isLocalMediaRegistrationExpired(registration)) throw new PracticeReferenceAuthorizationError("练习引用素材已过期");
        await assertRegistrationReadable(registration, scope.ownerUserId, storageKey);
        if (registration.type !== mediaType) throw new PracticeReferenceAuthorizationError("练习引用素材类型与输入位置不匹配");

        assets.push({
            type: "asset",
            id: storageKey,
            storageKey,
            scope: registration.scope,
            inputKey,
            mediaType,
            mimeType: registration.mimeType,
        });
    }

    let ipReferences: IpReference[] = [];
    if (rawIpReferences.length) {
        try {
            ipReferences = normalizeIpReferences(rawIpReferences);
            if (ipReferences.length !== rawIpReferences.length) throw new PracticeReferenceAuthorizationError("IP 引用格式无效");
            await validateIpReferences(scope.ownerUserId, ipReferences);
        } catch {
            throw new PracticeReferenceAuthorizationError("IP 引用不可用或无权访问");
        }
    }
    return [...assets, ...ipReferences];
}

export function expectedMediaType(_module: PracticeModuleKind, inputKey: unknown): PracticeMediaType {
    const normalized = typeof inputKey === "string" ? inputKey.trim() : "";
    if (IMAGE_INPUT_KEYS.has(normalized as PracticeReferenceInputKey)) return "image";
    if (AUDIO_INPUT_KEYS.has(normalized as PracticeReferenceInputKey)) return "audio";
    throw new PracticeReferenceAuthorizationError("练习引用位置无效");
}

/** 已验证练习素材在站内的媒体路由；scope 缺失时按用户上传（reference）处理. */
export function practiceReferenceMediaUrl(storageKey: string, scope?: unknown) {
    const value = storageKey.trim();
    if (!/^(?:temporary|permanent)\//.test(value)) throw new PracticeReferenceAuthorizationError("练习参考素材无效");
    const prefix = scope === "generation" ? "/api/generation-log-assets/" : "/api/reference-assets/";
    return `${prefix}${value.split("/").map(encodeURIComponent).join("/")}`;
}

async function assertRegistrationReadable(registration: LocalMediaRegistration, ownerUserId: string, storageKey: string) {
    if (registration.ownerUserId === ownerUserId) return;
    const material = await createPostgresRepositories().schoolDomain.getReadableCourseMaterial(ownerUserId, storageKey);
    if (!material || normalizeStorageKey(material.storageKey) !== storageKey) throw new PracticeReferenceAuthorizationError("练习引用素材无权访问");
}

function assertRegistrationScope(registration: LocalMediaRegistration, scope: PracticeTenantScope) {
    // reference = 用户上传的参考素材；generation = 生成结果.存入资产库的练习产物复用原 generation 存储键，
    // 因此两种作用域都允许引用，归属仍由 owner / 课程授权决定，派发时按作用域选择媒体路由.
    if (registration.scope !== "reference" && registration.scope !== "generation") throw new PracticeReferenceAuthorizationError("练习引用素材作用域无效");
    const schoolId = optionalString((registration as LocalMediaRegistration & { schoolId?: unknown }).schoolId);
    if (schoolId && schoolId !== scope.schoolId) throw new PracticeReferenceAuthorizationError("练习引用素材不属于当前学校");
}

function normalizeInputKey(value: unknown): PracticeReferenceInputKey {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (IMAGE_INPUT_KEYS.has(normalized as PracticeReferenceInputKey) || AUDIO_INPUT_KEYS.has(normalized as PracticeReferenceInputKey)) return normalized as PracticeReferenceInputKey;
    throw new PracticeReferenceAuthorizationError("练习引用位置无效");
}

function normalizeStorageKey(value: unknown) {
    if (typeof value !== "string") return "";
    const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    return /^(?:temporary|permanent)\//.test(normalized) ? normalized : "";
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function optionalString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
