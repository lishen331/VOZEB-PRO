/**
 * 成片合成的 ffmpeg 参数与字幕文件构造。
 *
 * 背景：成片原本固定走 `-c copy`（直接拼流，不转码），所以"分辨率 / 字幕 / 水印"
 * 这些配置项即使存进快照也不会影响产物 —— 那就是哑参数。这里把它们做成真的。
 *
 * 关键约束：**没有任何配置时必须与改造前完全一致**（仍是 `-c copy`）。
 * 转码会重新编码全片，耗时和画质损失都是真实代价，不能因为加了功能就让默认路径变慢。
 * 只有用户显式要求缩放 / 烧字幕 / 打水印时才转码。
 *
 * 就地验证方式：ffmpeg 二进制不一定在开发机上，所以用注入的 fake ffmpeg 断言 argv，
 * 参数拼错会在测试里判红，而不是等到线上合成失败。
 */

/** 分辨率：source 表示保持源尺寸（不缩放、不转码）。 */
export type FinalVideoResolution = "source" | "720p" | "1080p" | "1440p" | "2160p";

export type FinalVideoComposeOptions = {
    resolution: FinalVideoResolution;
    /** 把分镜字幕烧进画面（硬字幕，播放器无法关闭）。 */
    burnSubtitles: boolean;
    /** 右下角水印文字；留空表示不打水印。 */
    watermarkText: string;
};

export const DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS: FinalVideoComposeOptions = { resolution: "source", burnSubtitles: false, watermarkText: "" };

const RESOLUTIONS: Record<Exclude<FinalVideoResolution, "source">, number> = { "720p": 720, "1080p": 1080, "1440p": 1440, "2160p": 2160 };

export function normalizeFinalVideoComposeOptions(input: unknown): FinalVideoComposeOptions {
    const raw = (input || {}) as Record<string, unknown>;
    const resolution = typeof raw.resolution === "string" && (raw.resolution === "source" || raw.resolution in RESOLUTIONS) ? (raw.resolution as FinalVideoResolution) : "source";
    return {
        resolution,
        burnSubtitles: raw.burnSubtitles === true,
        // 水印是要烧进画面的文字，长度必须有上限，否则会糊满整帧。
        watermarkText: typeof raw.watermarkText === "string" ? raw.watermarkText.trim().slice(0, 60) : "",
    };
}

/** 是否需要真正转码。默认配置返回 false，保持原有 `-c copy` 路径。 */
export function finalVideoNeedsTranscode(options: FinalVideoComposeOptions, hasSubtitleText: boolean) {
    return options.resolution !== "source" || (options.burnSubtitles && hasSubtitleText) || Boolean(options.watermarkText);
}

export type FinalVideoSubtitleShot = { subtitle?: string; duration?: number };

/** 单条字幕缺 duration 时的兜底时长，避免整轨时间码错位。 */
const FALLBACK_SHOT_SECONDS = 3;

/**
 * 按分镜顺序累加时间码生成 SRT。
 *
 * 时间轴必须对**所有**分镜累加，哪怕某镜没有字幕 —— 否则后面每条字幕都会整体提前，
 * 越到片尾偏得越多。这是最容易写错的一处，已用测试锁死。
 */
export function buildFinalVideoSrt(shots: FinalVideoSubtitleShot[]) {
    let cursorMs = 0;
    let index = 0;
    const blocks: string[] = [];
    for (const shot of shots) {
        const seconds = typeof shot.duration === "number" && shot.duration > 0 ? shot.duration : FALLBACK_SHOT_SECONDS;
        const start = cursorMs;
        cursorMs += Math.round(seconds * 1000);
        const text = shot.subtitle?.trim();
        if (!text) continue;
        index += 1;
        blocks.push(`${index}\n${srtTime(start)} --> ${srtTime(cursorMs)}\n${text}`);
    }
    return blocks.join("\n\n");
}

function srtTime(ms: number) {
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    const seconds = Math.floor((ms % 60_000) / 1000);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

/**
 * ffmpeg 转义：filter 参数里的特殊字符必须转义，否则中文水印带标点就会让整条
 * filtergraph 解析失败（合成直接报错，用户只看到"成片失败"）。
 */
function escapeFilterText(value: string) {
    return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export type FinalVideoComposeArgsInput = {
    inputPath: string;
    outputPath: string;
    options: FinalVideoComposeOptions;
    /** 已写盘的字幕文件名（相对 cwd）；未烧字幕时传 undefined。 */
    subtitleFileName?: string;
    /** 水印字体文件绝对路径；缺字体时不打文字水印。 */
    fontFile?: string;
};

/**
 * 构造第二段 ffmpeg 的参数（拼流之后的处理段）。
 *
 * 不需要处理时返回 `-c copy`，与改造前逐字一致。
 */
export function buildFinalVideoComposeArgs(input: FinalVideoComposeArgsInput): string[] {
    const { inputPath, outputPath, options } = input;
    const filters: string[] = [];

    if (options.resolution !== "source") {
        const height = RESOLUTIONS[options.resolution as Exclude<FinalVideoResolution, "source">];
        // 只按高度缩放、宽度取偶数，保持原始宽高比，不裁剪不加黑边。
        filters.push(`scale=-2:${height}`);
    }
    if (options.burnSubtitles && input.subtitleFileName) {
        filters.push(`subtitles=${input.subtitleFileName}:force_style='FontName=Noto Sans CJK SC,FontSize=18,Outline=2,Shadow=1,MarginV=36'`);
    }
    if (options.watermarkText && input.fontFile) {
        const fontPath = input.fontFile.replace(/\\/g, "/").replace(/:/g, "\\:");
        filters.push(`drawtext=fontfile='${fontPath}':text='${escapeFilterText(options.watermarkText)}':fontcolor=white@0.75:fontsize=h/28:x=w-tw-24:y=h-th-24:shadowcolor=black@0.6:shadowx=2:shadowy=2`);
    }

    if (!filters.length) return ["-y", "-i", inputPath, "-c", "copy", "-movflags", "+faststart", outputPath];

    return [
        "-y",
        "-i",
        inputPath,
        "-vf",
        filters.join(","),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        // 音轨不重编码：字幕/缩放/水印都只动画面，重编码音频纯属损失。
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        outputPath,
    ];
}
