import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runFfmpeg } from "@/lib/server/ffmpeg";

export { DIALOG_LIMITS, dialogRoles, parseDialogScript, validateDialog, type DialogLine, type DialogRole } from "@/lib/audio-dialog-script";

import { DIALOG_LIMITS } from "@/lib/audio-dialog-script";

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
                // 静音片段用 anullsrc 生成，采样率与各句保持一致，拼接时可以直接流拷贝。
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
