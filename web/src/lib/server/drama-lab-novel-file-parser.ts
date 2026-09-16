import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

import { decodeXML } from "entities";
import { unzipSync } from "fflate";

import { decodeDramaNovelBytes } from "@/lib/drama-novel-text-decoder";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);

export class DramaLabNovelFileError extends Error {
    constructor(
        message: string,
        readonly status = 415,
    ) {
        super(message);
        this.name = "DramaLabNovelFileError";
    }
}

export function extractUploadedText(input: Uint8Array | ArrayBuffer, originalName = "") {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const extension = extname(originalName).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension) || !extension) return decodeTextBytes(bytes);
    if (extension === ".docx") return extractDocxText(bytes);
    if (extension === ".doc") return extractDocText(bytes, originalName);
    throw new DramaLabNovelFileError(`不支持的文件格式：${extension}`);
}

export function extractDocxText(input: Uint8Array) {
    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(input);
    } catch {
        throw new DramaLabNovelFileError("DOCX 文件损坏或不是有效的 Word 文档");
    }
    const documentXml = entries["word/document.xml"];
    if (!documentXml) throw new DramaLabNovelFileError("DOCX 文件缺少正文内容");
    const xml = new TextDecoder("utf-8").decode(documentXml);
    const paragraphs = Array.from(xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/giu), (match) => parseWordParagraph(match[1] || ""));
    const text = (paragraphs.length ? paragraphs : [parseWordParagraph(xml)]).join("\n").replace(/\r\n?/gu, "\n");
    if (!text.trim()) throw new DramaLabNovelFileError("DOCX 文件没有可识别的文本内容");
    return text;
}

function parseWordParagraph(xml: string) {
    const tokens = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/\s*>|<w:br\b[^>]*\/\s*>|<w:cr\b[^>]*\/\s*>/giu;
    let result = "";
    for (const match of xml.matchAll(tokens)) {
        if (match[1] !== undefined) result += decodeXML(match[1]);
        else if (/w:tab/iu.test(match[0])) result += "\t";
        else result += "\n";
    }
    return result;
}

export function extractDocText(input: Uint8Array, originalName = "故事.doc") {
    const tempDir = mkdtempSync(join(tmpdir(), "vozeb-drama-novel-"));
    const inputPath = join(tempDir, basename(originalName || "故事.doc"));
    try {
        writeFileSync(inputPath, input);
        if (commandExists("antiword")) {
            try {
                const output = execFileSync("antiword", [inputPath], { encoding: "buffer", maxBuffer: 8 * 1024 * 1024, timeout: 120000 });
                const text = decodeTextBytes(output).trim();
                if (text) return text;
            } catch {
                // Try LibreOffice when antiword cannot read the document.
            }
        }
        const office = commandExists("libreoffice") ? "libreoffice" : commandExists("soffice") ? "soffice" : undefined;
        if (office) {
            try {
                execFileSync(office, ["--headless", "--convert-to", "txt:Text", "--outdir", tempDir, inputPath], { encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
                const convertedPath = join(tempDir, `${basename(inputPath, extname(inputPath))}.txt`);
                if (existsSync(convertedPath)) {
                    const text = decodeTextBytes(readFileSync(convertedPath)).trim();
                    if (text) return text;
                }
            } catch {
                // Fall through to the actionable converter message.
            }
        }
        throw new DramaLabNovelFileError("暂不支持读取 .doc：服务器未安装 antiword 或 LibreOffice，请另存为 .docx 后重试");
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}

function decodeTextBytes(input: Uint8Array) {
    const copy = new Uint8Array(input.byteLength);
    copy.set(input);
    return decodeDramaNovelBytes(copy.buffer).text;
}

function commandExists(command: string) {
    try {
        execFileSync(process.platform === "win32" ? "where.exe" : "which", [command], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}
