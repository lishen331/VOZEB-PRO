import type { UploadedImage } from "@/services/image-storage";

export type ReversePromptHistoryRecord = {
    id: string;
    createdAt: number;
    updatedAt: number;
    sourceUrl?: string;
    analysisMode: string;
    extraRequirement: string;
    analysisText: string;
    trialStatus?: "pending" | "failed" | "success";
    trial?: { taskId: string; prompt: string; image: UploadedImage };
};

export function readReversePromptHistoryInput(value: unknown) {
    if (!value || typeof value !== "object" || !("mode" in value) || !("extraRequirement" in value)) return null;
    const { mode, extraRequirement } = value;
    if (typeof mode !== "string" || !["general", "style", "detail"].includes(mode) || typeof extraRequirement !== "string" || extraRequirement.length > 20_000) return null;
    return { mode, extraRequirement: extraRequirement.trim() };
}
