/**
 * Splits `data:<mime>;base64,<data>` without a regex. Generated media is several MB, and
 * `/^data:([^;,]+);base64,(.+)$/` over that input overflowed the V8 regex stack in production
 * (2026-10-23 RangeError). Same acceptance rules as that regex: a non-empty mime without `;`
 * or `,`, the literal `;base64,` marker, and non-empty data.
 */
export function parseBase64DataUrl(value: string): { mimeType: string; data: string } | null {
    if (!value.startsWith("data:")) return null;
    const comma = value.indexOf(",");
    if (comma < 0) return null;
    const header = value.slice(5, comma);
    if (!header.endsWith(";base64")) return null;
    const mimeType = header.slice(0, -";base64".length);
    if (!mimeType || mimeType.includes(";")) return null;
    const data = value.slice(comma + 1);
    return data ? { mimeType, data } : null;
}
