import type { PracticeModuleKind } from "@/lib/practice-domain";
import type { IpReference } from "@/lib/ip-library-domain";
import { getLocalMediaRegistration, isLocalMediaRegistrationExpired } from "@/lib/server/local-media-registry";
import { normalizeIpReferences } from "./ip-library-reference-service";
import type { PracticeTenantScope } from "./practice-tenant-scope";

export type NormalizedPracticeReference = { type: "asset"; id: string; inputKey?: string } | IpReference;

export class PracticeReferenceAuthorizationError extends Error {
    constructor(
        message: string,
        readonly status = 403,
    ) {
        super(message);
    }
}

const IMAGE_KEYS = new Set(["referenceImage", "firstFrameImage", "lastFrameImage", "sceneImage", "characterPropImage1", "characterPropImage2", "characterPropImage3", "image"]);
const AUDIO_KEYS = new Set(["audio"]);

export async function validatePracticeReferences(scope: PracticeTenantScope, module: PracticeModuleKind, _input: Record<string, unknown>, value: unknown): Promise<NormalizedPracticeReference[]> {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const result: NormalizedPracticeReference[] = [];
    for (const item of value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const source = item as Record<string, unknown>;
        if (source.type === "ip") {
            const ip = normalizeIpReferences([source])[0];
            if (ip) result.push(ip);
            continue;
        }
        if (source.type !== "asset" || typeof source.id !== "string") continue;
        const id = source.id.trim().slice(0, 512);
        if (!id) continue;
        const inputKey = typeof source.inputKey === "string" && (IMAGE_KEYS.has(source.inputKey) || AUDIO_KEYS.has(source.inputKey)) ? source.inputKey : undefined;
        const identity = `${id}:${inputKey || ""}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        const registration = await getLocalMediaRegistration(id);
        if (registration) {
            if (registration.ownerUserId !== scope.ownerUserId) throw new PracticeReferenceAuthorizationError("练习引用素材不属于当前账号");
            if (isLocalMediaRegistrationExpired(registration)) throw new PracticeReferenceAuthorizationError("练习引用素材已过期", 410);
            const expected = inputKey && AUDIO_KEYS.has(inputKey) ? "audio" : module === "dubbing" || module === "music" ? undefined : "image";
            if (expected && registration.type !== expected) throw new PracticeReferenceAuthorizationError("练习引用素材媒体类型不匹配", 400);
        }
        result.push({ type: "asset", id, ...(inputKey ? { inputKey } : {}) });
    }
    return result;
}
