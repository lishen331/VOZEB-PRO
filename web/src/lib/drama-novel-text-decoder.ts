export type DramaNovelTextEncoding = "utf-8" | "utf-16le" | "utf-16be" | "gb18030";

export type DramaNovelDecodedText = {
    text: string;
    encoding: DramaNovelTextEncoding;
};

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const UTF16LE_BOM = [0xff, 0xfe] as const;
const UTF16BE_BOM = [0xfe, 0xff] as const;

function startsWith(bytes: Uint8Array, prefix: readonly number[]) {
    return prefix.every((value, index) => bytes[index] === value);
}

function decode(bytes: Uint8Array, encoding: string, fatal = false) {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
}

/**
 * Decode local TXT/MD files without assuming that the browser's default is UTF-8.
 * UTF-8 is validated first; legacy Chinese files then use the platform GB18030
 * decoder instead of silently displaying replacement characters.
 */
export function decodeDramaNovelBytes(input: ArrayBuffer): DramaNovelDecodedText {
    const bytes = new Uint8Array(input);

    if (startsWith(bytes, UTF16LE_BOM)) {
        return { text: decode(bytes.subarray(2), "utf-16le"), encoding: "utf-16le" };
    }
    if (startsWith(bytes, UTF16BE_BOM)) {
        return { text: decode(bytes.subarray(2), "utf-16be"), encoding: "utf-16be" };
    }

    const utf8Bytes = startsWith(bytes, UTF8_BOM) ? bytes.subarray(3) : bytes;
    try {
        return { text: decode(utf8Bytes, "utf-8", true), encoding: "utf-8" };
    } catch {
        try {
            return { text: decode(utf8Bytes, "gb18030", true), encoding: "gb18030" };
        } catch {
            throw new Error("当前环境不支持 GB18030 文本解码，请将剧本另存为 UTF-8 后重试");
        }
    }
}
