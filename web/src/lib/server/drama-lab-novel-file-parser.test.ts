import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { extractUploadedText } from "./drama-lab-novel-file-parser";

describe("drama lab novel file parser", () => {
    it("extracts Word paragraphs, tabs, line breaks, and XML entities from DOCX", () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>第一章</w:t></w:r></w:p><w:p><w:r><w:t>中文正文 &amp; 继续</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>下一段</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>尾部</w:t></w:r></w:p></w:body></w:document>`;
        const docx = zipSync({ "word/document.xml": new TextEncoder().encode(xml) });

        expect(extractUploadedText(docx, "故事.docx")).toBe("第一章\n中文正文 & 继续\t下一段\n尾部");
    });

    it("decodes plain text formats through the existing byte decoder", () => {
        expect(extractUploadedText(new TextEncoder().encode("第一章\n正文"), "故事.md")).toBe("第一章\n正文");
    });

    it("rejects unsupported extensions before parsing", () => {
        expect(() => extractUploadedText(new Uint8Array([1, 2, 3]), "故事.pdf")).toThrowError(/不支持的文件格式/iu);
    });
});
