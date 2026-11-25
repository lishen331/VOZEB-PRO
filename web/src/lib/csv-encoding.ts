export const CSV_ENCODING_ERROR = "CSV 文件编码有误，请从原始表格重新保存为 CSV UTF-8 后上传";

export function decodeCsvBytes(buffer: ArrayBuffer): string | null {
    const bytes = new Uint8Array(buffer);
    const hasUtf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        if (hasUtf8Bom) return null;
        try {
            // GB18030 also covers CSV files saved in GBK.
            text = new TextDecoder("gb18030", { fatal: true }).decode(bytes);
        } catch {
            return null;
        }
    }
    return text.includes("\uFFFD") || text.includes("\0") ? null : text;
}
