import { describe, expect, it } from "vitest";

import { decodeDramaNovelBytes } from "./drama-novel-text-decoder";

function bytes(values: number[]) {
    return Uint8Array.from(values).buffer;
}

describe("decodeDramaNovelBytes", () => {
    it("strips a UTF-8 BOM", () => {
        expect(decodeDramaNovelBytes(bytes([0xef, 0xbb, 0xbf, 0xe7, 0xac, 0xac, 0xe4, 0xb8, 0x80]))).toEqual({ text: "第一", encoding: "utf-8" });
    });

    it("decodes valid UTF-8 without a BOM", () => {
        const encoded = new TextEncoder().encode("第一章").buffer;
        expect(decodeDramaNovelBytes(encoded)).toEqual({ text: "第一章", encoding: "utf-8" });
    });

    it("decodes UTF-16 little-endian and big-endian BOM files", () => {
        expect(decodeDramaNovelBytes(bytes([0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65]))).toEqual({ text: "中文", encoding: "utf-16le" });
        expect(decodeDramaNovelBytes(bytes([0xfe, 0xff, 0x4e, 0x2d, 0x65, 0x87]))).toEqual({ text: "中文", encoding: "utf-16be" });
    });

    it("falls back to GB18030 for legacy Chinese bytes", () => {
        expect(decodeDramaNovelBytes(bytes([0xd6, 0xd0, 0xce, 0xc4]))).toEqual({ text: "中文", encoding: "gb18030" });
    });

    it("uses the legacy decoder for malformed UTF-8 instead of replacement characters", () => {
        const result = decodeDramaNovelBytes(bytes([0xd6, 0xd0, 0xce, 0xc4, 0x28]));
        expect(result.encoding).toBe("gb18030");
        expect(result.text).toContain("中文");
        expect(result.text).not.toContain("�");
    });
});
