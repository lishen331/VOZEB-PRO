import { access } from "node:fs/promises";

/**
 * 解析可用于 ffmpeg `drawtext` 的中文字体路径。
 *
 * 文字水印必须有真实字体文件，否则 `drawtext` 直接报错、整个成片失败。
 * 生产镜像装的是 `fonts-noto-cjk`（见仓库根 Dockerfile），
 * 但开发机（尤其 Windows）不一定有，所以这里按候选路径探测，
 * 一个都没有就返回 undefined —— 调用方据此跳过水印，而不是让合成崩掉。
 *
 * 可用 `FINAL_VIDEO_FONT_PATH` 覆盖（自建部署换字体时不必改代码）。
 */
const CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
];

export async function resolveFinalVideoFontPath(candidates: string[] = CANDIDATES) {
    const configured = process.env.FINAL_VIDEO_FONT_PATH?.trim();
    for (const candidate of configured ? [configured, ...candidates] : candidates) {
        try {
            await access(candidate);
            return candidate;
        } catch {
            continue;
        }
    }
    return undefined;
}
