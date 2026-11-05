import sharp, { type Metadata } from "sharp";

export const MAX_INPUT_PIXELS = 40_000_000;

type NormalizedGeneratedImage = {
    bytes: Buffer;
    mimeType: string;
    width?: number;
    height?: number;
};

export async function normalizeGeneratedImageBytes(bytes: Buffer, mimeType: string, _targetSize?: string): Promise<NormalizedGeneratedImage> {
    const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    const dimensions = orientedDimensions(metadata);
    // Requested geometry belongs to the request and preview frame, not a
    // destructive crop of the provider's original result.
    return { bytes, mimeType: imageMimeType(metadata.format, mimeType), ...dimensions };
}

function orientedDimensions(metadata: Metadata) {
    const rotated = metadata.orientation && metadata.orientation >= 5 && metadata.orientation <= 8;
    const width = rotated ? metadata.height : metadata.width;
    const height = rotated ? metadata.width : metadata.height;
    return {
        width: Number.isFinite(width) && Number(width) > 0 ? Number(width) : undefined,
        height: Number.isFinite(height) && Number(height) > 0 ? Number(height) : undefined,
    };
}

function imageMimeType(format: string | undefined, fallback: string) {
    if (format === "jpg" || format === "jpeg") return "image/jpeg";
    if (format === "png" || format === "webp" || format === "gif" || format === "avif" || format === "tiff") return `image/${format}`;
    return fallback;
}
