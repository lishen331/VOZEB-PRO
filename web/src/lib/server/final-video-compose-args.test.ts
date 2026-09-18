import { describe, expect, it } from "vitest";

import { DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS, buildFinalVideoComposeArgs, buildFinalVideoSrt, finalVideoNeedsTranscode, normalizeFinalVideoComposeOptions } from "./final-video-compose-args";

/**
 * 这些配置项此前是哑参数（成片固定 `-c copy`，字段进了快照却从不进 ffmpeg）。
 * 所以测试重点不是"字段能否保存"，而是"是否真的进了 ffmpeg 参数"，
 * 以及"没配置时是否仍走原来的不转码路径"。
 */
describe("normalizeFinalVideoComposeOptions", () => {
    it("defaults to the pre-change behaviour", () => {
        expect(normalizeFinalVideoComposeOptions(undefined)).toEqual(DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS);
        expect(normalizeFinalVideoComposeOptions({ resolution: "4k" }).resolution).toBe("source");
    });

    it("keeps only known resolutions and trims the watermark", () => {
        expect(normalizeFinalVideoComposeOptions({ resolution: "1080p" }).resolution).toBe("1080p");
        expect(normalizeFinalVideoComposeOptions({ watermarkText: "  VOZEB  " }).watermarkText).toBe("VOZEB");
        expect(normalizeFinalVideoComposeOptions({ watermarkText: "x".repeat(200) }).watermarkText).toHaveLength(60);
    });

    it("treats a non-boolean burnSubtitles as off", () => {
        expect(normalizeFinalVideoComposeOptions({ burnSubtitles: "yes" }).burnSubtitles).toBe(false);
    });
});

describe("finalVideoNeedsTranscode", () => {
    it("stays false for the default options so the fast path is preserved", () => {
        expect(finalVideoNeedsTranscode(DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS, true)).toBe(false);
    });

    it("does not transcode for subtitles when no shot has subtitle text", () => {
        expect(finalVideoNeedsTranscode({ ...DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS, burnSubtitles: true }, false)).toBe(false);
    });

    it("transcodes for each real option", () => {
        expect(finalVideoNeedsTranscode({ ...DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS, resolution: "1080p" }, false)).toBe(true);
        expect(finalVideoNeedsTranscode({ ...DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS, burnSubtitles: true }, true)).toBe(true);
        expect(finalVideoNeedsTranscode({ ...DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS, watermarkText: "VOZEB" }, false)).toBe(true);
    });
});

describe("buildFinalVideoSrt", () => {
    it("advances the timeline over shots without subtitles", () => {
        // 中间那镜没有字幕，但它的 2 秒必须照样占用时间轴，
        // 否则第二条字幕会整体提前 2 秒。
        const srt = buildFinalVideoSrt([
            { subtitle: "第一句", duration: 3 },
            { subtitle: "", duration: 2 },
            { subtitle: "第二句", duration: 4 },
        ]);
        expect(srt).toContain("00:00:00,000 --> 00:00:03,000");
        expect(srt).toContain("00:00:05,000 --> 00:00:09,000");
        // 只有两条字幕，序号必须连续。
        expect(srt.split("\n\n")).toHaveLength(2);
        expect(srt).toContain("2\n00:00:05,000");
    });

    it("falls back to a fixed duration instead of collapsing the timeline", () => {
        const srt = buildFinalVideoSrt([{ subtitle: "缺时长" }, { subtitle: "第二句", duration: 1 }]);
        expect(srt).toContain("00:00:00,000 --> 00:00:03,000");
        expect(srt).toContain("00:00:03,000 --> 00:00:04,000");
    });

    it("returns an empty string when nothing has subtitles", () => {
        expect(buildFinalVideoSrt([{ duration: 3 }, { subtitle: "   ", duration: 2 }])).toBe("");
    });
});

describe("buildFinalVideoComposeArgs", () => {
    const base = { inputPath: "joined.mp4", outputPath: "final.mp4" };

    it("keeps the exact stream-copy args when nothing is configured", () => {
        const args = buildFinalVideoComposeArgs({ ...base, options: DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS });
        expect(args).toEqual(["-y", "-i", "joined.mp4", "-c", "copy", "-movflags", "+faststart", "final.mp4"]);
        expect(args).not.toContain("-vf");
        expect(args).not.toContain("libx264");
    });

    it("scales by height only, preserving the aspect ratio", () => {
        const args = buildFinalVideoComposeArgs({ ...base, options: { ...DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS, resolution: "1080p" } });
        expect(args[args.indexOf("-vf") + 1]).toBe("scale=-2:1080");
        expect(args).toContain("libx264");
        // 只动画面，音轨不重编码。
        expect(args.join(" ")).toContain("-c:a copy");
    });

    it("burns subtitles only when a subtitle file was actually written", () => {
        const withFile = buildFinalVideoComposeArgs({ ...base, options: { ...DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS, burnSubtitles: true }, subtitleFileName: "subtitles.srt" });
        expect(withFile[withFile.indexOf("-vf") + 1]).toContain("subtitles=subtitles.srt");
        const withoutFile = buildFinalVideoComposeArgs({ ...base, options: { ...DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS, burnSubtitles: true } });
        expect(withoutFile).toEqual(["-y", "-i", "joined.mp4", "-c", "copy", "-movflags", "+faststart", "final.mp4"]);
    });

    it("skips the text watermark when no font file is available", () => {
        const args = buildFinalVideoComposeArgs({ ...base, options: { ...DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS, watermarkText: "VOZEB" } });
        expect(args).not.toContain("-vf");
    });

    it("escapes watermark punctuation so the filtergraph still parses", () => {
        const args = buildFinalVideoComposeArgs({
            ...base,
            options: { ...DEFAULT_FINAL_VIDEO_COMPOSE_OPTIONS, watermarkText: "VOZEB: 出品, 2026" },
            fontFile: "C:/fonts/noto.ttf",
        });
        const filter = args[args.indexOf("-vf") + 1];
        expect(filter).toContain("drawtext=");
        expect(filter).toContain("VOZEB\\: 出品\\, 2026");
        // Windows 盘符里的冒号也要转义，否则 fontfile 路径会被当作参数分隔。
        expect(filter).toContain("C\\:/fonts/noto.ttf");
    });

    it("chains every filter in a stable order", () => {
        const args = buildFinalVideoComposeArgs({
            ...base,
            options: { resolution: "720p", burnSubtitles: true, watermarkText: "VOZEB" },
            subtitleFileName: "subtitles.srt",
            fontFile: "/fonts/noto.ttf",
        });
        const filter = args[args.indexOf("-vf") + 1];
        expect(filter.indexOf("scale=")).toBeLessThan(filter.indexOf("subtitles="));
        expect(filter.indexOf("subtitles=")).toBeLessThan(filter.indexOf("drawtext="));
    });
});
