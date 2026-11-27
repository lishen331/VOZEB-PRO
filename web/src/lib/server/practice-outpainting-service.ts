import sharp from "sharp";
import { parseBase64DataUrl } from "@/lib/data-url";
import type { outpaintingGeometry } from "@/lib/practice-outpainting";
import { MAX_INPUT_PIXELS } from "./generated-image-normalizer";
import type { ImageTaskConfig } from "./image-task-store";

type Geometry = NonNullable<ReturnType<typeof outpaintingGeometry>>;
const pngUrl = (bytes: Buffer) => `data:image/png;base64,${bytes.toString("base64")}`;

function readImage(url: string) {
    const parsed = parseBase64DataUrl(url);
    if (!parsed?.mimeType.startsWith("image/")) throw new Error("无法读取扩图图片");
    return sharp(Buffer.from(parsed.data, "base64"), { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
}

export async function outpaintingSourceSize(url: string) {
    const metadata = await readImage(url).metadata();
    const { width, height } = metadata.autoOrient;
    if (!width || !height || (metadata.pages || 1) > 1) throw new Error("请选择一张静态图片");
    return { width, height };
}

async function sourcePixels(source: string, geometry: Geometry) {
    return readImage(source).rotate().resize(geometry.sourceWidth, geometry.sourceHeight, { fit: "fill" }).toColourspace("srgb").ensureAlpha().raw().toBuffer();
}

export async function prepareOutpainting(source: string, geometry: Geometry) {
    const { width, height, left, top, sourceWidth, sourceHeight } = geometry;
    const pixels = await sourcePixels(source, geometry);
    const canvas = Buffer.alloc(width * height * 4);
    const mask = Buffer.alloc(canvas.length);
    for (let y = 0; y < sourceHeight; y++) {
        const offset = ((top + y) * width + left) * 4;
        pixels.copy(canvas, offset, y * sourceWidth * 4, (y + 1) * sourceWidth * 4);
        mask.fill(255, offset, offset + sourceWidth * 4);
    }
    const encode = async (buffer: Buffer) =>
        pngUrl(
            await sharp(buffer, { raw: { width, height, channels: 4 } })
                .png()
                .toBuffer(),
        );
    return { image: await encode(canvas), mask: await encode(mask) };
}

export async function composeOutpainting(source: string, generated: string, geometry: Geometry) {
    const { width, height, left, top, sourceWidth, sourceHeight } = geometry;
    const decoded = await readImage(generated).rotate().toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== width || decoded.info.height !== height) throw new Error("模型返回的扩图尺寸不符，请检查练习渠道的尺寸支持");
    const pixels = await sourcePixels(source, geometry);
    for (let y = 0; y < sourceHeight; y++) pixels.copy(decoded.data, ((top + y) * width + left) * 4, y * sourceWidth * 4, (y + 1) * sourceWidth * 4);
    return pngUrl(
        await sharp(decoded.data, { raw: { width, height, channels: 4 } })
            .png()
            .toBuffer(),
    );
}

export function supportsOutpainting(config: Pick<ImageTaskConfig, "apiFormat" | "model"> & { advancedConfig?: Partial<NonNullable<ImageTaskConfig["advancedConfig"]>> }) {
    const advanced = config.advancedConfig;
    return (
        config.apiFormat === "openai" &&
        advanced?.protocol === "openai" &&
        !advanced.globalAiOpcPreset &&
        !advanced.globalAiOpcPresets?.length &&
        advanced.supportsReferenceImage === true &&
        /^\/?(?:v1\/)?images\/edits\/?$/i.test(advanced.editPath || "") &&
        !/json|public|\burl\b|公网|链接|base64/i.test(advanced.referenceRule || "")
    );
}
