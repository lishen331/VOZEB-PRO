import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runFfmpeg } from "@/lib/server/ffmpeg";

/** 多角色对话：每行「名字：台词」，名字 1～8 个字，中英文冒号都可以。 */
export type DialogLine = { role: string; text: string };
export type DialogRole = { voice: string; instruction?: string; emotion?: string };

const LINE_PATTERN = /^\s*([^\s：:]{1,8})\s*[：:]\s*(\S.*)$/;
export const DIALOG_LIMITS = { minRoles: 2, maxRoles: 10, maxLines: 100, maxCharsPerLine: 500, gapMs: 300 };

/** 解析对话脚本；不符合「名字：台词」的行直接忽略。 */
export function parseDialogScript(text: string): DialogLine[] {
    return (text || "")
        .split("\n")
        .map((line) => line.match(LINE_PATTERN))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => ({ role: match[1].trim(), text: match[2].trim().slice(0, DIALOG_LIMITS.maxCharsPerLine) }))
        .filter((line) => line.text.length > 0);
}

export function dialogRoles(lines: DialogLine[]) {
    return [...new Set(lines.map((line) => line.role))];
}

/** 提交前的整体校验：角色数、句数都在限制内，且每个角色都配了音色。 */
export function validateDialog(lines: DialogLine[], roles: Record<string, DialogRole | undefined>) {
    const names = dialogRoles(lines);
    if (names.length < DIALOG_LIMITS.minRoles) return "多人对话至少要 2 个角色，每行写成「名字：台词」";
    if (names.length > DIALOG_LIMITS.maxRoles) return `多人对话最多 ${DIALOG_LIMITS.maxRoles} 个角色`;
    if (lines.length > DIALOG_LIMITS.maxLines) return `多人对话最多 ${DIALOG_LIMITS.maxLines} 句`;
    const missing = names.find((name) => !roles[name]?.voice?.trim());
    if (missing) return `角色「${missing}」还没有选择音色`;
    return null;
}

/**
 * 把各句音频按顺序拼成一个文件，句间插入固定静音。
 * 用 concat demuxer + 生成静音片段，避免重编码导致音质损失。
 */
export async function concatAudioWithGaps(segments: Buffer[], extension: string, gapMs = DIALOG_LIMITS.gapMs) {
    const dir = await mkdtemp(join(tmpdir(), "vozeb-dialog-"));
    try {
        const list: string[] = [];
        for (const [index, bytes] of segments.entries()) {
            const file = join(dir, `seg-${index}.${extension}`);
            await writeFile(file, bytes);
            list.push(`file '${file}'`);
            if (index < segments.length - 1 && gapMs > 0) {
                // 静音片段用 anullsrc 生成，编码参数与各句保持一致的采样率/声道/码率。
                const silence = join(dir, `gap-${index}.${extension}`);
                await runFfmpeg(["-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(gapMs / 1000), "-c:a", extension === "mp3" ? "libmp3lame" : "pcm_s16le", silence], { timeoutMs: 30_000 });
                list.push(`file '${silence}'`);
            }
        }
        const listFile = join(dir, "list.txt");
        await writeFile(listFile, list.join("\n"), "utf8");
        const output = join(dir, `joined.${extension}`);
        await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", output], { timeoutMs: 120_000 });
        return await readFile(output);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
