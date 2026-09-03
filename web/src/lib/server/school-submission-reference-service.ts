import type { SchoolContentReference, TeachingSubmissionReferencePreview } from "@/lib/school-domain";
import { validateSchoolContentReferences } from "./school-content-reference-service";

type ResolveInput = {
    ownerUserId: string;
    schoolId: string;
    references: SchoolContentReference[];
};

export async function resolveSchoolContentReferences({ ownerUserId, schoolId, references }: ResolveInput): Promise<TeachingSubmissionReferencePreview[]> {
    return Promise.all(
        references.map(async (reference) => {
            try {
                const [preview] = await validateSchoolContentReferences({ userId: ownerUserId, schoolId, references: [reference] });
                if (!preview) return unavailableReference(reference);
                const previewUrl = preview.previewUrl;
                return {
                    reference: preview.reference,
                    title: preview.title,
                    kind: reference.type,
                    mediaType: inferMediaType(previewUrl, reference),
                    ...(previewUrl ? { previewUrl } : {}),
                    availability: "available" as const,
                };
            } catch (error) {
                const status = error && typeof error === "object" ? (error as { status?: unknown }).status : undefined;
                if (status === 403 || status === 404) return unavailableReference(reference);
                throw error;
            }
        }),
    );
}

export function resolveTeachingSubmissionReferences(input: ResolveInput) {
    return resolveSchoolContentReferences(input);
}

function unavailableReference(reference: SchoolContentReference): TeachingSubmissionReferencePreview {
    return { reference, title: "成果不可用", kind: reference.type, mediaType: "unknown", availability: "unavailable", unavailableReason: "成果当前不存在或无权访问" };
}

function inferMediaType(previewUrl: string | undefined, reference: SchoolContentReference): TeachingSubmissionReferencePreview["mediaType"] {
    if (!previewUrl) {
        if (reference.type === "work") return "text";
        if (reference.type === "canvas" || reference.type === "drama" || reference.type === "asset" || reference.type === "ip") return "image";
        return "unknown";
    }
    const extension = previewUrl.split(/[?#]/, 1)[0]?.split(".").pop()?.toLowerCase();
    if (extension && ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(extension)) return "image";
    if (extension && ["mp4", "webm", "mov", "m4v"].includes(extension)) return "video";
    if (extension && ["mp3", "wav", "ogg", "m4a", "aac"].includes(extension)) return "audio";
    if (extension && ["txt", "md", "json", "csv"].includes(extension)) return "text";
    if (extension && ["pdf", "doc", "docx", "zip"].includes(extension)) return "file";
    return "unknown";
}
