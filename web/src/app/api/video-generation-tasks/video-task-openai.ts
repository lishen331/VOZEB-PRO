import { imageReferenceToFile } from "@/app/api/image-tasks/image-task-support";
import sharp from "sharp";

type OpenAiVideoFormInput = {
    model: string;
    prompt: string;
    seconds: number;
    width?: number;
    height?: number;
    imageUrls: string[];
    origin: string;
    cookie: string;
};

export async function buildOpenAiVideoFormData(input: OpenAiVideoFormInput) {
    if (input.imageUrls.length > 1) throw new Error("OpenAI 视频协议最多支持 1 张参考图");
    const formData = new FormData();
    formData.set("model", input.model);
    formData.set("prompt", input.prompt);
    // The Sora-compatible multipart endpoint accepts only 4, 8, or 12 seconds.
    // Drama shots can use arbitrary durations (for example 6 seconds), so map to
    // the smallest supported value that can contain the requested shot.
    formData.set("seconds", String(normalizeOpenAiVideoSeconds(input.seconds)));
    if (Number.isFinite(input.width) && Number.isFinite(input.height)) {
        formData.set("size", `${input.width}x${input.height}`);
    }
    formData.set("watermark", "false");
    formData.set("private", "false");
    formData.set("character_url", "");
    formData.set("character_timestamps", "");
    formData.set("metadata", "");
    formData.set("character_from_task", "");
    formData.set("character_create", "");
    if (input.imageUrls[0]) {
        const source = await imageReferenceToFile({ dataUrl: input.imageUrls[0], url: input.imageUrls[0] }, "input-reference.png", input.origin, input.cookie);
        const [width, height] = [input.width, input.height];
        try {
            const bytes = await sharp(Buffer.from(await source.arrayBuffer()), { failOn: "error" })
                .rotate()
                .resize(width, height, { fit: "cover", position: "centre" })
                .jpeg({ quality: 92 })
                .toBuffer();
            formData.set("input_reference", new File([bytes], "input-reference.jpg", { type: "image/jpeg" }));
        } catch {
            // Keep the original file available for formats sharp cannot decode.
            formData.set("input_reference", source);
        }
    }
    return formData;
}

export function normalizeOpenAiVideoSeconds(value: number) {
    if (!Number.isFinite(value) || value <= 4) return 4;
    if (value <= 8) return 8;
    return 12;
}
