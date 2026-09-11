import { randomUUID } from "node:crypto";
import { SCRIPT_BLOCK_TYPES, type ScriptBlock, type ScriptBlockType, type ScriptDocument, type ScriptFormatOptions } from "@/lib/script-practice-types";
const TYPES = new Set<string>(SCRIPT_BLOCK_TYPES);
const FDX_TO_BLOCK: Record<string, ScriptBlockType> = { "Scene Heading": "scene-heading", Action: "action", Character: "character", Parenthetical: "parenthetical", Dialogue: "dialogue", Transition: "transition", Note: "note" };
const BLOCK_TO_FDX: Record<ScriptBlockType, string> = { "scene-heading": "Scene Heading", action: "Action", character: "Character", parenthetical: "Parenthetical", dialogue: "Dialogue", transition: "Transition", note: "Note" };
export function normalizeScriptDocument(value: unknown, options: ScriptFormatOptions = {}): ScriptDocument {
    const source = object(value);
    const blocks = (Array.isArray(source.blocks) ? source.blocks : []).flatMap((item) => {
        const record = object(item);
        const type = typeof record.type === "string" && TYPES.has(record.type) ? (record.type as ScriptBlockType) : undefined;
        const text = typeof record.text === "string" ? record.text.trim() : "";
        if (!type || !text) return [];
        const rawId = typeof record.id === "string" ? record.id.trim() : "";
        const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(rawId) ? rawId : randomUUID();
        return [{ id, type, text } satisfies ScriptBlock];
    });
    const now = options.now || new Date().toISOString();
    return {
        id: options.documentId || stringValue(source.id) || randomUUID(),
        projectId: options.projectId || stringValue(source.projectId),
        format: "structured",
        blocks,
        version: Number.isSafeInteger(source.version) && Number(source.version) > 0 ? Number(source.version) : options.version || 1,
        schemaVersion: 1,
        createdAt: stringValue(source.createdAt) || now,
        updatedAt: now,
    };
}
export function parseFountain(source: string, options: ScriptFormatOptions = {}) {
    if (typeof source !== "string" || !source.trim()) throw new ScriptFormatError("Fountain 内容为空");
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    const blocks: Array<Omit<ScriptBlock, "id">> = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (!line) {
            i++;
            continue;
        }
        if (/^(?:INT|EXT|EST|INT\.\/EXT|I\/E)\./i.test(line) || /^\.(?:INT|EXT)\b/i.test(line)) {
            blocks.push({ type: "scene-heading", text: line });
            i++;
            continue;
        }
        if (/^(?:FADE IN:|FADE OUT:|CUT TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:)$/i.test(line)) {
            blocks.push({ type: "transition", text: line });
            i++;
            continue;
        }
        if (isCharacter(line, lines[i + 1])) {
            blocks.push({ type: "character", text: line });
            i++;
            while (i < lines.length && lines[i].trim()) {
                const text = lines[i].trim();
                blocks.push(/^\(.+\)$/.test(text) ? { type: "parenthetical", text } : { type: "dialogue", text });
                i++;
            }
            continue;
        }
        const action = [line];
        i++;
        while (i < lines.length && lines[i].trim()) action.push(lines[i++].trim());
        blocks.push({ type: "action", text: action.join("\n") });
    }
    return normalizeScriptDocument({ blocks: blocks.map((block) => ({ ...block, id: randomUUID() })) }, options);
}
export function serializeFountain(document: ScriptDocument) {
    return document.blocks.reduce((result, block, index) => {
        const previous = document.blocks[index - 1];
        const contiguous = previous && (previous.type === "character" || previous.type === "parenthetical" || previous.type === "dialogue") && (block.type === "parenthetical" || block.type === "dialogue");
        return result + (index ? (contiguous ? "\n" : "\n\n") : "") + block.text;
    }, "");
}
export function parseFdx(source: string, options: ScriptFormatOptions = {}) {
    if (typeof source !== "string" || !/^\s*(?:<\?xml[^>]*>\s*)?<FinalDraft\b[\s\S]*<\/FinalDraft>\s*$/i.test(source)) throw new ScriptFormatError("FDX 根节点无效");
    const paragraphs = Array.from(source.matchAll(/<Paragraph\b[^>]*\bType\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/Paragraph>/gi));
    if (!paragraphs.length) throw new ScriptFormatError("FDX 未找到有效段落");
    const blocks = paragraphs.flatMap((match) => {
        const type = FDX_TO_BLOCK[decodeXml(match[1])];
        const text = Array.from(match[2].matchAll(/<Text\b[^>]*>([\s\S]*?)<\/Text>/gi))
            .map((item) => decodeXml(item[1]))
            .join("")
            .trim();
        return type && text ? [{ id: randomUUID(), type, text }] : [];
    });
    return normalizeScriptDocument({ blocks }, options);
}
export function serializeFdx(document: ScriptDocument) {
    return `<?xml version="1.0" encoding="UTF-8"?><FinalDraft DocumentType="Script" Version="1"><Content>${document.blocks.map((block) => `<Paragraph Type="${escapeXml(BLOCK_TO_FDX[block.type])}"><Text>${escapeXml(block.text)}</Text></Paragraph>`).join("")}</Content></FinalDraft>`;
}
export function serializePlainText(document: ScriptDocument) {
    return document.blocks.map((block) => block.text).join("\n\n");
}
export class ScriptFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ScriptFormatError";
    }
}
function isCharacter(line: string, next?: string) {
    return Boolean(line.length <= 80 && next?.trim() && !/[.!?。！？]$/.test(line) && /^[A-Z0-9一-龥][A-Z0-9一-龥 ._'’()\-]*$/i.test(line));
}
function object(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function stringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
function decodeXml(value: string) {
    return value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}
function escapeXml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
